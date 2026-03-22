#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");

const fsHelpers = require("../../fs.cjs");
const processHelpers = require("../../process.cjs");
const { normalizeVersionInfo, sanitizeBranch, splitVersionParts, truncate } = require("../../model.cjs");

const MAIN_ASSEMBLY_INFO_FILE_PATH = "mainAssemblyInfoFilePath";
const ASSEMBLY_INFO_FILE_PATHS = "assemblyInfoFilePaths";
const VERSION_INFO_FILE_PATHS = "versionInfoFilePaths";
const PROJECT_FILE_PATHS = "projectFilePaths";
const CSPROJ_FILE_PATHS = "csprojFilePaths";
const AUTO_DISCOVER = "autoDiscover";
const MODE = "mode";

const MODE_FIXED = "fixed";
const MODE_GIT_HEIGHT = "git-height";

const DEFAULT_MAX_FILES = 10000;
const MAX_VERSION_LENGTH = 50;
const RELEASE_BRANCH_TOKEN = "release";

const FILE_PRIORITY = {
  PROJECT: 1,
  SHARED_MSBUILD: 2,
  VERSION_INFO: 3,
  ASSEMBLY_INFO: 4
};

const FILE_SOURCE = {
  PROJECT: "dotnet-project",
  SHARED_MSBUILD: "dotnet-msbuild",
  VERSION_INFO: "dotnet-versioninfo",
  ASSEMBLY_INFO: "dotnet-assemblyinfo"
};

const REGEX_PROJECT_FILE = /\.(?:csproj|vbproj|fsproj)$/i;
const REGEX_SHARED_MSBUILD_FILE = /(?:^|[\\/])Directory\.Build\.(?:props|targets)$/i;
const REGEX_VERSION_INFO = /(?:^|[\\/])VersionInfo\.(?:cs|vb|fs)$/i;
const REGEX_ASSEMBLY_INFO = /(?:^|[\\/])AssemblyInfo\.(?:cs|vb|fs)$/i;
const REGEX_DISCOVERY = /(?:^|[\\/])(AssemblyInfo\.(?:cs|vb|fs)|VersionInfo\.(?:cs|vb|fs)|Directory\.Build\.(?:props|targets)|[^\\/]+\.(?:csproj|vbproj|fsproj))$/i;

const ASSEMBLY_FILE_VERSION_REGEX = /AssemblyFileVersion\("([^"]+)"\)/;
const ASSEMBLY_INFORMATIONAL_VERSION_REGEX = /AssemblyInformationalVersion\("([^"]+)"\)/;
const XML_ASSEMBLY_FILE_VERSION_REGEX = /<AssemblyFileVersion>([^<]+)<\/AssemblyFileVersion>/i;
const XML_ASSEMBLY_VERSION_REGEX = /<AssemblyVersion>([^<]+)<\/AssemblyVersion>/i;
const XML_FILE_VERSION_REGEX = /<FileVersion>([^<]+)<\/FileVersion>/i;
const XML_INFORMATIONAL_VERSION_REGEX = /<InformationalVersion>([^<]+)<\/InformationalVersion>/i;
const XML_PACKAGE_VERSION_REGEX = /<PackageVersion>([^<]+)<\/PackageVersion>/i;
const XML_VERSION_REGEX = /<Version>([^<]+)<\/Version>/i;
const XML_VERSION_PREFIX_REGEX = /<VersionPrefix>([^<]+)<\/VersionPrefix>/i;
const XML_VERSION_SUFFIX_REGEX = /<VersionSuffix>([^<]+)<\/VersionSuffix>/i;

const LEGACY_VERSION_SPLIT_REGEX = /^([^-+]+?)(?:-(.+))?$/;
const DIGITS_ONLY_REGEX = /^\d+$/;

const GIT_COMMAND = "git";
const GIT_HEIGHT_ARGS = ["rev-list", "--count", "HEAD"];
const DOTNET_COMMAND = "dotnet";
const DOTNET_MSBUILD_SUBCOMMAND = "msbuild";
const DOTNET_NOLOGO_FLAG = "-nologo";
const DOTNET_PREPROCESS_FLAG_PREFIX = "-pp:";

const {
  discoverFiles,
  fileExists,
  parsePathList,
  readText,
  resolvePath,
  unique
} = fsHelpers;
const { commandExists, tryExec } = processHelpers;

function getString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function normalizeLegacySuffix(value) {
  const text = getString(value);

  if (!text) {
    return "";
  }

  return text
    .replace(/^refs\/heads\//i, "")
    .replace(/^refs-heads-/i, "")
    .replace(/[\/\\ _]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
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

    projectFilePaths:
      providerConfig[PROJECT_FILE_PATHS] || [],

    csprojFilePaths:
      providerConfig[CSPROJ_FILE_PATHS] || [],

    envAssemblyInfoFilePaths:
      env.ASSEMBLY_INFO_FILE_PATHS || "",

    envVersionInfoFilePaths:
      env.VERSION_INFO_FILE_PATHS || "",

    envProjectFilePaths:
      env.PROJECT_FILE_PATHS || "",

    envCsprojFilePaths:
      env.CSPROJ_FILE_PATHS || "",

    autoDiscover:
      providerConfig[AUTO_DISCOVER] !== false
  };
}

function classifyCandidate(filePath) {
  if (REGEX_PROJECT_FILE.test(filePath)) {
    return FILE_PRIORITY.PROJECT;
  }

  if (REGEX_SHARED_MSBUILD_FILE.test(filePath)) {
    return FILE_PRIORITY.SHARED_MSBUILD;
  }

  if (REGEX_VERSION_INFO.test(filePath)) {
    return FILE_PRIORITY.VERSION_INFO;
  }

  return FILE_PRIORITY.ASSEMBLY_INFO;
}

function getSourceName(filePath) {
  if (REGEX_PROJECT_FILE.test(filePath)) {
    return FILE_SOURCE.PROJECT;
  }

  if (REGEX_SHARED_MSBUILD_FILE.test(filePath)) {
    return FILE_SOURCE.SHARED_MSBUILD;
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

  for (const item of config.projectFilePaths || []) {
    candidates.push(resolvePath(repoRoot, item));
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

  for (const item of parsePathList(config.envProjectFilePaths)) {
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

  if (config.autoDiscover === false) {
    return explicit;
  }

  const discovered = getDiscoveredCandidates(repoRoot).filter(fileExists);
  return sortCandidates(unique([...explicit, ...discovered]));
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
  if (REGEX_PROJECT_FILE.test(filePath) || REGEX_SHARED_MSBUILD_FILE.test(filePath)) {
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

function extractProjectMetadata(content) {
  const versionMatch = content.match(XML_VERSION_REGEX);
  const fileVersionMatch = content.match(XML_FILE_VERSION_REGEX);
  const versionPrefixMatch = content.match(XML_VERSION_PREFIX_REGEX);
  const versionSuffixMatch = content.match(XML_VERSION_SUFFIX_REGEX);
  const assemblyFileVersionMatch = content.match(XML_ASSEMBLY_FILE_VERSION_REGEX);
  const assemblyVersionMatch = content.match(XML_ASSEMBLY_VERSION_REGEX);
  const informationalVersionMatch = content.match(XML_INFORMATIONAL_VERSION_REGEX);
  const packageVersionMatch = content.match(XML_PACKAGE_VERSION_REGEX);

  return {
    rawVersion:
      (versionMatch && versionMatch[1] && String(versionMatch[1]).trim()) ||
      (fileVersionMatch && fileVersionMatch[1] && String(fileVersionMatch[1]).trim()) ||
      (versionPrefixMatch && versionPrefixMatch[1] && combineVersionPrefixAndSuffix(
        versionPrefixMatch[1],
        versionSuffixMatch && versionSuffixMatch[1]
      )) ||
      (assemblyFileVersionMatch && assemblyFileVersionMatch[1] && String(assemblyFileVersionMatch[1]).trim()) ||
      null,
    assemblyVersion: (assemblyVersionMatch && assemblyVersionMatch[1] && String(assemblyVersionMatch[1]).trim()) || "",
    informationalVersion: (informationalVersionMatch && informationalVersionMatch[1] && String(informationalVersionMatch[1]).trim()) || "",
    nuGetPackageVersion: (packageVersionMatch && packageVersionMatch[1] && String(packageVersionMatch[1]).trim()) || ""
  };
}

function parseLegacyVersion(rawVersion) {
  const value = String(rawVersion || "").trim();
  const match = value.match(LEGACY_VERSION_SPLIT_REGEX);

  const baseNumber = match?.[1] || value;
  const branchRaw = match?.[2] || "";
  const branch = normalizeLegacySuffix(branchRaw);

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

function normalizeFixedVersion(parsed, sourceName, metadata = {}) {
  return normalizeVersionInfo({
    source: sourceName,
    version: truncate(parsed.version, MAX_VERSION_LENGTH),
    full: parsed.baseNumber,
    major: parsed.major,
    minor: parsed.minor,
    build: parsed.build,
    suffix: parsed.suffix,
    semVer2: truncate(parsed.version, MAX_VERSION_LENGTH),
    assemblyVersion: getString(metadata.assemblyVersion),
    informationalVersion: getString(metadata.informationalVersion),
    nuGetPackageVersion: getString(metadata.nuGetPackageVersion)
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

function normalizeGitHeightVersion(parsed, gitHeight, sourceName, metadata = {}) {
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
    assemblyVersion: getString(metadata.assemblyVersion),
    informationalVersion: getString(metadata.informationalVersion),
    nuGetPackageVersion: getString(metadata.nuGetPackageVersion)
  });
}

function createTempFilePath(prefix, extension = ".xml") {
  const uniqueSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`)), `${uniqueSuffix}${extension}`);
}

function cleanupTempFile(tempFilePath) {
  try {
    fs.rmSync(path.dirname(tempFilePath), { recursive: true, force: true });
  } catch {
    // ignore temp cleanup failures
  }
}

function evaluateProjectFile(projectFilePath, options) {
  if (!REGEX_PROJECT_FILE.test(projectFilePath)) {
    return null;
  }

  if (!commandExists(DOTNET_COMMAND, { env: options.env })) {
    return null;
  }

  const preprocessedPath = createTempFilePath("dockship-msbuild-preprocess");
  const args = [
    DOTNET_MSBUILD_SUBCOMMAND,
    projectFilePath,
    DOTNET_NOLOGO_FLAG,
    `${DOTNET_PREPROCESS_FLAG_PREFIX}${preprocessedPath}`
  ];

  try {
    const result = tryExec(DOTNET_COMMAND, args, {
      cwd: options.repoRoot,
      env: options.env
    });

    if (!result.ok || !fileExists(preprocessedPath)) {
      return null;
    }

    const metadata = extractProjectMetadata(readText(preprocessedPath));

    if (!metadata.rawVersion) {
      return null;
    }

    const parsed = parseLegacyVersion(metadata.rawVersion);

    if (options.mode === MODE_GIT_HEIGHT) {
      const gitHeight = getGitHeight(options.repoRoot, options.env);
      return normalizeGitHeightVersion(parsed, gitHeight, FILE_SOURCE.PROJECT, metadata);
    }

    return normalizeFixedVersion(parsed, FILE_SOURCE.PROJECT, metadata);
  } finally {
    cleanupTempFile(preprocessedPath);
  }
}

function resolveVersionFromFile(filePath, options) {
  const evaluatedProjectVersion = evaluateProjectFile(filePath, options);

  if (evaluatedProjectVersion) {
    return evaluatedProjectVersion;
  }

  const content = readText(filePath);
  const rawVersion = extractRawVersion(content, filePath);

  if (!rawVersion) {
    return null;
  }

  const parsed = parseLegacyVersion(rawVersion);
  const sourceName = getSourceName(filePath);
  const metadata = REGEX_PROJECT_FILE.test(filePath) || REGEX_SHARED_MSBUILD_FILE.test(filePath)
    ? extractProjectMetadata(content)
    : {};

  if (options.mode === MODE_GIT_HEIGHT) {
    const gitHeight = getGitHeight(options.repoRoot, options.env);
    return normalizeGitHeightVersion(parsed, gitHeight, sourceName, metadata);
  }

  return normalizeFixedVersion(parsed, sourceName, metadata);
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
