#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const PACKAGE_JSON_DEFAULT_PATH = "package.json";

const MODE_FIXED = "fixed";
const MODE_GIT_HEIGHT = "git-height";

const GIT_COMMAND = "git";
const GIT_HEIGHT_ARGS = ["rev-list", "--count", "HEAD"];

const DIGITS_ONLY_REGEX = /^\d+$/;
const VERSION_SPLIT_PRERELEASE = "-";
const VERSION_SPLIT_METADATA = "+";
const VERSION_SPLIT_DOT = ".";

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolvePath(rootPath, candidatePath) {
  if (!candidatePath) {
    return "";
  }

  return path.isAbsolute(candidatePath)
    ? path.normalize(candidatePath)
    : path.resolve(rootPath, candidatePath);
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
    .split(VERSION_SPLIT_PRERELEASE)[0]
    .split(VERSION_SPLIT_METADATA)[0];

  const parts = numericPrefix.split(VERSION_SPLIT_DOT);

  return {
    major: parts[0] || "",
    minor: parts[1] || "",
    build: parts[2] || ""
  };
}

function parseSemVerSuffix(version) {
  const raw = getString(version);
  const prereleaseIndex = raw.indexOf(VERSION_SPLIT_PRERELEASE);

  if (prereleaseIndex < 0) {
    return "";
  }

  const metadataIndex = raw.indexOf(VERSION_SPLIT_METADATA, prereleaseIndex);
  return metadataIndex >= 0
    ? raw.slice(prereleaseIndex, metadataIndex)
    : raw.slice(prereleaseIndex);
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
    mode: String(
      env.NODEJS_VERSION_MODE ||
      providerConfig.mode ||
      MODE_FIXED
    ).trim().toLowerCase(),

    packageJsonPath:
      env.PACKAGE_JSON_PATH ||
      providerConfig.packageJsonPath ||
      PACKAGE_JSON_DEFAULT_PATH
  };
}

function readPackageJson(repoRoot, config) {
  const packageJsonPath = resolvePath(repoRoot, config.packageJsonPath);

  if (!fileExists(packageJsonPath)) {
    throw new Error(`package.json not found: ${packageJsonPath}`);
  }

  return {
    packageJsonPath,
    packageJson: readJson(packageJsonPath)
  };
}

function tryExec(command, args, options = {}) {
  try {
    const stdout = cp
      .execSync(`${command} ${args.join(" ")}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        ...options
      })
      .trim();

    return {
      ok: true,
      stdout,
      stderr: ""
    };
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: error.message || String(error)
    };
  }
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

function buildVersionWithGitHeight(baseVersion, gitHeight) {
  // Split the base version into numeric and suffix parts
  const suffix = parseSemVerSuffix(baseVersion);
  const baseNumeric = baseVersion.split(VERSION_SPLIT_PRERELEASE)[0].split(VERSION_SPLIT_METADATA)[0];

  // Split numeric parts and append git height
  const numericParts = baseNumeric
    .split(".")
    .map(x => x.trim())
    .filter(Boolean);

  // If there are already 4 or more parts, replace the last one with git height
  if (numericParts.length >= 4) {
    numericParts[numericParts.length - 1] = gitHeight;
  } else {
    // Otherwise, add git height as a new part
    numericParts.push(gitHeight);
  }

  const fullNumeric = numericParts.join(".");
  const version = suffix ? `${fullNumeric}${suffix}` : fullNumeric;

  return {
    version,
    full: fullNumeric,
    suffix
  };
}

function resolveVersion(context) {
  const config = getConfig(context);

  if (![MODE_FIXED, MODE_GIT_HEIGHT].includes(config.mode)) {
    throw new Error(
      `Unsupported nodejs version mode: ${config.mode}. Supported modes: ${MODE_FIXED}, ${MODE_GIT_HEIGHT}`
    );
  }

  const { packageJsonPath, packageJson } = readPackageJson(context.repoRoot, config);

  if (!packageJson || !packageJson.version) {
    throw new Error(`No version found in package.json: ${packageJsonPath}`);
  }

  let version = String(packageJson.version).trim();

  // If mode is git-height, append the git height to the version
  if (config.mode === MODE_GIT_HEIGHT) {
    const gitHeight = getGitHeight(context.repoRoot, context.env || process.env);
    const withGitHeight = buildVersionWithGitHeight(version, gitHeight);
    version = withGitHeight.version;
  }

  const parts = splitVersionParts(version);

  return normalizeVersionInfo({
    source: "nodejs",
    version,
    full: version,
    major: parts.major,
    minor: parts.minor,
    build: parts.build,
    suffix: parseSemVerSuffix(version),
    semVer2: version,
    assemblyVersion: "",
    informationalVersion: "",
    nuGetPackageVersion: ""
  });
}

module.exports = {
  MODE_FIXED,
  MODE_GIT_HEIGHT,
  getConfig,
  resolveVersion
};
