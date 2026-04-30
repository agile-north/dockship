const { fileExists, resolvePath } = require("../../fs.cjs");
const { commandExists, tryExec } = require("../../process.cjs");
const {
  getString,
  normalizeVersionInfo,
  parseSemVerSuffix,
  splitVersionParts,
  truncate
} = require("../../model.cjs");

const COMMAND_GITVERSION = "gitversion";
const COMMAND_DOTNET_GITVERSION = "dotnet-gitversion";
const COMMAND_DOCKER = "docker";

const DEFAULT_CONFIG_FILE = "GitVersion.yml";
const DEFAULT_DOCKER_IMAGE = "gittools/gitversion:6.0.0";
const DOCKER_WORK_DIR = "/repo";

const MAX_VERSION_LENGTH = 200;
const EMPTY_STRING = "";

function getConfig(context) {
  const providerConfig = context.providerConfig || {};

  return {
    configFile: getString(providerConfig.configFile, DEFAULT_CONFIG_FILE),
    allowGlobalCommand: providerConfig.allowGlobalCommand !== false,
    useDocker: providerConfig.useDocker === true,
    dockerImage: getString(providerConfig.dockerImage, DEFAULT_DOCKER_IMAGE),
    additionalArgs: Array.isArray(providerConfig.additionalArgs)
      ? providerConfig.additionalArgs.map(value => getString(value)).filter(Boolean)
      : []
  };
}

function repoUsesGitVersion(repoRoot, config) {
  return fileExists(resolvePath(repoRoot, config.configFile));
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function removeSemVerMetadata(version) {
  return getString(version).split("+")[0];
}

function getVersionWithoutMetadata(versionText, json) {
  const fromVersion = removeSemVerMetadata(versionText);

  if (fromVersion) {
    return fromVersion;
  }

  const major = getString(json.Major);
  const minor = getString(json.Minor);
  const patch = getString(json.Patch);

  if (major && minor && patch) {
    return `${major}.${minor}.${patch}`;
  }

  return EMPTY_STRING;
}

function mapGitVersionJson(json) {
  const fullSemVer = getString(json.FullSemVer);
  const semVer = getString(json.SemVer);
  const fullVersion = getString(json.FullVersion);
  const semVer2 = fullSemVer || semVer || fullVersion;
  const version = truncate(getVersionWithoutMetadata(semVer || fullSemVer || fullVersion, json), MAX_VERSION_LENGTH);

  if (!version) {
    throw new Error("GitVersion output did not include a SemVer value");
  }

  const full = version.split("-")[0];
  const parts = splitVersionParts(version);

  return normalizeVersionInfo({
    source: "gitversion",
    version,
    full,
    major: parts.major || getString(json.Major),
    minor: parts.minor || getString(json.Minor),
    build: parts.build || getString(json.Patch),
    suffix: parseSemVerSuffix(version),
    semVer2,
    assemblyVersion: getString(json.AssemblySemVer || json.AssemblyVersion),
    informationalVersion: getString(json.InformationalVersion),
    nuGetPackageVersion: getString(json.NuGetVersionV2 || json.NuGetVersion)
  });
}

function getGitVersionArgs(config) {
  const args = ["-output", "json"];

  if (config.configFile && config.configFile !== DEFAULT_CONFIG_FILE) {
    args.push("-config", config.configFile);
  }

  if (config.additionalArgs.length > 0) {
    args.push(...config.additionalArgs);
  }

  return args;
}

function tryRunGitVersionCli(repoRoot, config, env) {
  return tryExec(COMMAND_GITVERSION, getGitVersionArgs(config), {
    cwd: repoRoot,
    env
  });
}

function tryRunDotnetGitVersionCli(repoRoot, config, env) {
  return tryExec(COMMAND_DOTNET_GITVERSION, getGitVersionArgs(config), {
    cwd: repoRoot,
    env
  });
}

function tryRunGitVersionDocker(repoRoot, config, env) {
  return tryExec(COMMAND_DOCKER, [
    "run", "--rm",
    "-v", `${repoRoot}:${DOCKER_WORK_DIR}`,
    "-w", DOCKER_WORK_DIR,
    config.dockerImage,
    DOCKER_WORK_DIR,
    ...getGitVersionArgs(config)
  ], {
    env
  });
}

function resolveVersion(context) {
  const config = getConfig(context);
  const repoRoot = context.repoRoot;
  const env = context.env || process.env;

  if (!repoUsesGitVersion(repoRoot, config)) {
    throw new Error("GitVersion provider selected but repository does not contain GitVersion config");
  }

  if (config.allowGlobalCommand && commandExists(COMMAND_GITVERSION, { env })) {
    const result = tryRunGitVersionCli(repoRoot, config, env);

    if (result.ok && result.stdout) {
      const parsed = tryParseJson(result.stdout);

      if (parsed) {
        return mapGitVersionJson(parsed);
      }
    }
  }

  if (config.allowGlobalCommand && commandExists(COMMAND_DOTNET_GITVERSION, { env })) {
    const result = tryRunDotnetGitVersionCli(repoRoot, config, env);

    if (result.ok && result.stdout) {
      const parsed = tryParseJson(result.stdout);

      if (parsed) {
        return mapGitVersionJson(parsed);
      }
    }
  }

  if (config.useDocker && commandExists(COMMAND_DOCKER, { env })) {
    const result = tryRunGitVersionDocker(repoRoot, config, env);

    if (result.ok && result.stdout) {
      const parsed = tryParseJson(result.stdout);

      if (parsed) {
        return mapGitVersionJson(parsed);
      }
    }
  }

  throw new Error("Failed to resolve version using GitVersion");
}

module.exports = {
  resolveVersion
};
