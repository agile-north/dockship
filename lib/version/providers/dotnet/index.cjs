#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const MAIN_ASSEMBLY_INFO_FILE_PATH = "mainAssemblyInfoFilePath";
const ASSEMBLY_INFO_FILE_PATHS = "assemblyInfoFilePaths";
const VERSION_INFO_FILE_PATHS = "versionInfoFilePaths";
const CSPROJ_FILE_PATHS = "csprojFilePaths";
const AUTO_DISCOVER = "autoDiscover";
const MODE = "mode";

const MODE_FIXED = "fixed";
const MODE_GIT_HEIGHT = "git-height";

const DEFAULT_MAX_FILES = 10000;
const MAX_VERSION_LENGTH = 50;
const RELEASE_BRANCH_TOKEN = "release";

const FILE_PRIORITY = {
  CSPROJ: 1,
  VERSION_INFO: 2,
  ASSEMBLY_INFO: 3
};

const FILE_SOURCE = {
  CSPROJ: "dotnet-csproj",
  VERSION_INFO: "dotnet-versioninfo",
  ASSEMBLY_INFO: "dotnet-assemblyinfo"
};

const REGEX_CSPROJ = /\.csproj$/i;
const REGEX_VERSION_INFO = /(?:^|[\\/])VersionInfo\.cs$/i;
const REGEX_ASSEMBLY_INFO = /(?:^|[\\/])AssemblyInfo\.cs$/i;
const REGEX_DISCOVERY = /(?:^|[\\/])(AssemblyInfo\.cs|VersionInfo\.cs|[^\\/]+\.csproj)$/i;

const ASSEMBLY_FILE_VERSION_REGEX = /AssemblyFileVersion\("([^"]+)"\)/;
const ASSEMBLY_INFORMATIONAL_VERSION_REGEX = /AssemblyInformationalVersion\("([^"]+)"\)/;
const XML_ASSEMBLY_FILE_VERSION_REGEX = /<AssemblyFileVersion>([^<]+)<\/AssemblyFileVersion>/i;
const XML_FILE_VERSION_REGEX = /<FileVersion>([^<]+)<\/FileVersion>/i;
const XML_VERSION_REGEX = /<Version>([^<]+)<\/Version>/i;
const XML_VERSION_PREFIX_REGEX = /<VersionPrefix>([^<]+)<\/VersionPrefix>/i;
const XML_VERSION_SUFFIX_REGEX = /<VersionSuffix>([^<]+)<\/VersionSuffix>/i;

const LEGACY_VERSION_SPLIT_REGEX = /^([^-+]+?)(?:-(.+))?$/;
const DIGITS_ONLY_REGEX = /^\d+$/;

const GIT_COMMAND = "git";
const GIT_HEIGHT_ARGS = ["rev-list", "--count", "HEAD"];

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function resolvePath(rootPath, candidatePath) {
  if (!candidatePath) {
    return "";
  }

  return path.isAbsolute(candidatePath)
    ? path.normalize(candidatePath)
    : path.resolve(rootPath, candidatePath);
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function parsePathList(value) {
  if (!value || !String(value).trim()) {
    return [];
  }

  return String(value)
    .split(/[;,]/)
    .map(x => x.trim())
    .filter(Boolean);
}

function discoverFiles(rootPath, predicate, options = {}) {
  const ignoreDirs = new Set(options.ignoreDirs || [
    ".git",
    ".idea",
    ".vs",
    ".vscode",
    ".teamcity",
    "node_modules",
    "bin",
    "obj",
    "dist",
    "build",
    "out"
  ]);
  const maxFiles = Number(options.maxFiles || DEFAULT_MAX_FILES);

  const queue = [rootPath];
  const results = [];
  let seenFiles = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    let entries;

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (ignoreDirs.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      seenFiles += 1;
      if (seenFiles > maxFiles) {
        return results;
      }

      if (predicate(fullPath, entry)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function tryExec(command, args, options = {}) {
  try {
    const result = cp.spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      shell: false
    });

    return {
      ok: result.status === 0,
      status: result.status,
      stdout: (result.stdout || "").trim(),
      stderr: (result.stderr || "").trim(),
      error: result.error || null
    };
  } catch (error) {
    return {
      ok: false,
      status: -1,
      stdout: "",
      stderr: "",
      error
    };
  }
}

function getString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function splitVersionParts(version) {
  const raw = getString(version);
  const numericPrefix = raw
    .split("-")[0]
    .split("+")[0];

  const parts = numericPrefix.split(".");

  return {
    major: parts[0] || "",
    minor: parts[1] || "",
    build: parts[2] || ""
  };
}

function truncate(value, maxLength) {
  const text = getString(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function sanitizeBranch(branch) {
  if (!branch) {
    return "";
  }

  let value = getString(branch);

  value = value.replace(/^refs\/heads\//i, "");
  value = value.replace(/^refs-heads-/i, "");
  value = value.replace(/[\/\\ _.]+/g, "-");
  value = value.replace(/-+/g, "-");
  value = value.replace(/^-+|-+$/g, "");

  return value.toLowerCase();
}

function normalizeVersionInfo(input) {
  const version = getString(input.version);
  const full = getString(input.full, version);
  const parts = splitVersionParts(version || full);

  return {
    source: getString(input.source),
    version,
    full,
    major: getString(input.major, parts.major),
    minor: getString(input.minor, parts.minor),
    build: getString(input.build, parts.build),
    suffix: getString(input.suffix),
    semVer2: getString(input.semVer2, version || full),
    assemblyVersion: getString(input.assemblyVersion),
    informationalVersion: getString(input.informationalVersion),
    nuGetPackageVersion: getString(input.nuGetPackageVersion)
  };
}

function getConfig(context) {
  const providerConfig = context.providerConfig || {};
  const env = context.env || process.env;

  return {
    mode:
      String(
        env.DOTNET_VERSION_MODE ||
        providerConfig[MODE] ||
        MODE_FIXED
      ).trim().toLowerCase(),

    mainAssemblyInfoFilePath:
      env.MAIN_ASSEMBLY_INFO_FILE_PATH ||
      providerConfig[MAIN_ASSEMBLY_INFO_FILE_PATH] ||
      "",

    assemblyInfoFilePaths:
      providerConfig[ASSEMBLY_INFO_FILE_PATHS] || [],

    versionInfoFilePaths:
      providerConfig[VERSION_INFO_FILE_PATHS] || [],

    csprojFilePaths:
      providerConfig[CSPROJ_FILE_PATHS] || [],

    envAssemblyInfoFilePaths:
      env.ASSEMBLY_INFO_FILE_PATHS || "",

    envVersionInfoFilePaths:
      env.VERSION_INFO_FILE_PATHS || "",

    envCsprojFilePaths:
      env.CSPROJ_FILE_PATHS || "",

    autoDiscover:
      providerConfig[AUTO_DISCOVER] !== false
  };
}

function classifyCandidate(filePath) {
  if (REGEX_CSPROJ.test(filePath)) {
    return FILE_PRIORITY.CSPROJ;
  }

  if (REGEX_VERSION_INFO.test(filePath)) {
    return FILE_PRIORITY.VERSION_INFO;
  }

  return FILE_PRIORITY.ASSEMBLY_INFO;
}

function getSourceName(filePath) {
  if (REGEX_CSPROJ.test(filePath)) {
    return FILE_SOURCE.CSPROJ;
  }

  if (REGEX_VERSION_INFO.test(filePath)) {
    return FILE_SOURCE.VERSION_INFO;
  }

  return FILE_SOURCE.ASSEMBLY_INFO;
}

function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const priorityDiff = classifyCandidate(a) - classifyCandidate(b);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return a.localeCompare(b);
  });
}

function getExplicitCandidates(repoRoot, config) {
  const candidates = [];

  if (config.mainAssemblyInfoFilePath) {
    candidates.push(resolvePath(repoRoot, config.mainAssemblyInfoFilePath));
  }

  for (const item of config.csprojFilePaths || []) {
    candidates.push(resolvePath(repoRoot, item));
  }

  for (const item of config.versionInfoFilePaths || []) {
    candidates.push(resolvePath(repoRoot, item));
  }

  for (const item of config.assemblyInfoFilePaths || []) {
    candidates.push(resolvePath(repoRoot, item));
  }

  for (const item of parsePathList(config.envCsprojFilePaths)) {
    candidates.push(resolvePath(repoRoot, item));
  }

  for (const item of parsePathList(config.envVersionInfoFilePaths)) {
    candidates.push(resolvePath(repoRoot, item));
  }

  for (const item of parsePathList(config.envAssemblyInfoFilePaths)) {
    candidates.push(resolvePath(repoRoot, item));
  }

  return sortCandidates(unique(candidates));
}

function getDiscoveredCandidates(repoRoot) {
  const discovered = discoverFiles(
    repoRoot,
    fullPath => REGEX_DISCOVERY.test(fullPath),
    { maxFiles: DEFAULT_MAX_FILES }
  );

  return sortCandidates(unique(discovered));
}

function getCandidates(repoRoot, config) {
  const explicit = getExplicitCandidates(repoRoot, config).filter(fileExists);

  if (explicit.length > 0) {
    return explicit;
  }

  if (config.autoDiscover === false) {
    return [];
  }

  return getDiscoveredCandidates(repoRoot).filter(fileExists);
}

function combineVersionPrefixAndSuffix(prefix, suffix) {
  const cleanPrefix = String(prefix || "").trim();
  const cleanSuffix = String(suffix || "").trim();

  if (!cleanPrefix) {
    return "";
  }

  if (!cleanSuffix) {
    return cleanPrefix;
  }

  return `${cleanPrefix}-${cleanSuffix}`;
}

function extractRawVersion(content, filePath) {
  if (REGEX_CSPROJ.test(filePath)) {
    const versionMatch = content.match(XML_VERSION_REGEX);
    if (versionMatch && versionMatch[1]) {
      return String(versionMatch[1]).trim();
    }

    const fileVersionMatch = content.match(XML_FILE_VERSION_REGEX);
    if (fileVersionMatch && fileVersionMatch[1]) {
      return String(fileVersionMatch[1]).trim();
    }

    const versionPrefixMatch = content.match(XML_VERSION_PREFIX_REGEX);
    const versionSuffixMatch = content.match(XML_VERSION_SUFFIX_REGEX);

    if (versionPrefixMatch && versionPrefixMatch[1]) {
      return combineVersionPrefixAndSuffix(
        versionPrefixMatch[1],
        versionSuffixMatch && versionSuffixMatch[1]
      );
    }

    const assemblyFileVersionMatch = content.match(XML_ASSEMBLY_FILE_VERSION_REGEX);
    if (assemblyFileVersionMatch && assemblyFileVersionMatch[1]) {
      return String(assemblyFileVersionMatch[1]).trim();
    }

    return null;
  }

  const patterns = [
    ASSEMBLY_FILE_VERSION_REGEX,
    ASSEMBLY_INFORMATIONAL_VERSION_REGEX,
    XML_ASSEMBLY_FILE_VERSION_REGEX,
    XML_FILE_VERSION_REGEX,
    XML_VERSION_REGEX,
    XML_VERSION_PREFIX_REGEX
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      return String(match[1]).trim();
    }
  }

  return null;
}

function parseLegacyVersion(rawVersion) {
  const value = String(rawVersion || "").trim();
  const match = value.match(LEGACY_VERSION_SPLIT_REGEX);

  const baseNumber = match?.[1] || value;
  const branchRaw = match?.[2] || "";
  const branch = sanitizeBranch(branchRaw);

  let version = baseNumber;
  let suffix = "";

  if (branch && !branch.includes(RELEASE_BRANCH_TOKEN)) {
    version = `${baseNumber}-${branch}`;
    suffix = `-${branch}`;
  }

  const parts = splitVersionParts(baseNumber);

  return {
    baseNumber,
    version,
    suffix,
    major: parts.major,
    minor: parts.minor,
    build: parts.build
  };
}

function normalizeFixedVersion(parsed, sourceName) {
  return normalizeVersionInfo({
    source: sourceName,
    version: truncate(parsed.version, MAX_VERSION_LENGTH),
    full: parsed.baseNumber,
    major: parsed.major,
    minor: parsed.minor,
    build: parsed.build,
    suffix: parsed.suffix,
    semVer2: truncate(parsed.version, MAX_VERSION_LENGTH),
    assemblyVersion: "",
    informationalVersion: "",
    nuGetPackageVersion: ""
  });
}

function getGitHeight(repoRoot, env) {
  const result = tryExec(GIT_COMMAND, GIT_HEIGHT_ARGS, {
    cwd: repoRoot,
    env
  });

  if (!result.ok) {
    throw new Error(result.stderr || "Failed to calculate git height");
  }

  const height = String(result.stdout || "").trim();

  if (!DIGITS_ONLY_REGEX.test(height)) {
    throw new Error(`Invalid git height returned: ${height}`);
  }

  return height;
}

function buildVersionWithGitHeight(parsed, gitHeight) {
  const numericParts = parsed.baseNumber
    .split("-")[0]
    .split("+")[0]
    .split(".")
    .map(x => x.trim())
    .filter(Boolean);

  if (numericParts.length >= 4) {
    numericParts[numericParts.length - 1] = gitHeight;
  } else {
    numericParts.push(gitHeight);
  }

  const fullNumeric = numericParts.join(".");
  const version = parsed.suffix ? `${fullNumeric}${parsed.suffix}` : fullNumeric;

  const parts = splitVersionParts(fullNumeric);

  return {
    version,
    full: fullNumeric,
    major: parts.major,
    minor: parts.minor,
    build: parts.build,
    suffix: parsed.suffix
  };
}

function normalizeGitHeightVersion(parsed, gitHeight, sourceName) {
  const gitHeightVersion = buildVersionWithGitHeight(parsed, gitHeight);

  return normalizeVersionInfo({
    source: sourceName,
    version: truncate(gitHeightVersion.version, MAX_VERSION_LENGTH),
    full: gitHeightVersion.full,
    major: gitHeightVersion.major,
    minor: gitHeightVersion.minor,
    build: gitHeightVersion.build,
    suffix: gitHeightVersion.suffix,
    semVer2: truncate(gitHeightVersion.version, MAX_VERSION_LENGTH),
    assemblyVersion: "",
    informationalVersion: "",
    nuGetPackageVersion: ""
  });
}

function resolveVersionFromFile(filePath, options) {
  const content = readText(filePath);
  const rawVersion = extractRawVersion(content, filePath);

  if (!rawVersion) {
    return null;
  }

  const parsed = parseLegacyVersion(rawVersion);
  const sourceName = getSourceName(filePath);

  if (options.mode === MODE_GIT_HEIGHT) {
    const gitHeight = getGitHeight(options.repoRoot, options.env);
    return normalizeGitHeightVersion(parsed, gitHeight, sourceName);
  }

  return normalizeFixedVersion(parsed, sourceName);
}

function resolveVersion(context) {
  const config = getConfig(context);

  if (![MODE_FIXED, MODE_GIT_HEIGHT].includes(config.mode)) {
    throw new Error(
      `Unsupported dotnet version mode: ${config.mode}. Supported modes: ${MODE_FIXED}, ${MODE_GIT_HEIGHT}`
    );
  }

  const candidates = getCandidates(context.repoRoot, config);

  if (candidates.length === 0) {
    throw new Error("No dotnet version source files were found");
  }

  for (const candidate of candidates) {
    const versionInfo = resolveVersionFromFile(candidate, {
      mode: config.mode,
      repoRoot: context.repoRoot,
      env: context.env || process.env
    });

    if (versionInfo) {
      return versionInfo;
    }
  }

  throw new Error("Failed to resolve version using dotnet provider");
}

module.exports = {
  MODE_FIXED,
  MODE_GIT_HEIGHT,
  getConfig,
  getCandidates,
  resolveVersion
};
