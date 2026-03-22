const path = require("path");
const { fileExists } = require("../../fs.cjs");
const { commandExists, tryExec } = require("../../process.cjs");
const {
  normalizeVersionInfo,
  parseSemVerSuffix,
  splitVersionParts
} = require("../../model.cjs");

const VERSION_JSON_FILE_NAME = "version.json";
const DOTNET_TOOL_MANIFEST_RELATIVE_PATH = ".config/dotnet-tools.json";

const COMMAND_DOTNET = "dotnet";
const COMMAND_NBGV = "nbgv";
const COMMAND_DOCKER = "docker";

const CONTAINER_WORK_DIR = "/repo";
const DEFAULT_DOCKER_IMAGE = "mcr.microsoft.com/dotnet/sdk:latest";

function getConfig(context) {
  const providerConfig = context.providerConfig || {};

  return {
    versionJsonFileName: providerConfig.versionJsonFileName || VERSION_JSON_FILE_NAME,
    dotnetToolManifestRelativePath: providerConfig.dotnetToolManifestRelativePath || DOTNET_TOOL_MANIFEST_RELATIVE_PATH,
    allowToolRestore: providerConfig.allowToolRestore !== false,
    allowGlobalCommand: providerConfig.allowGlobalCommand !== false,
    requireVersionJson: providerConfig.requireVersionJson !== false,
    useDocker: providerConfig.useDocker !== false,
    dockerImage: providerConfig.dockerImage || DEFAULT_DOCKER_IMAGE
  };
}

function repoUsesNbgv(repoRoot, config) {
  const versionJsonPath = path.join(repoRoot, config.versionJsonFileName);
  if (fileExists(versionJsonPath)) {
    return true;
  }

  return !config.requireVersionJson;
}

function hasToolManifest(repoRoot, config) {
  return fileExists(path.join(repoRoot, config.dotnetToolManifestRelativePath));
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tryRunNbgvDotnet(repoRoot, env) {
  return tryExec(COMMAND_DOTNET, ["nbgv", "get-version", "--format", "json"], {
    cwd: repoRoot,
    env
  });
}

function tryRestoreTools(repoRoot, env) {
  return tryExec(COMMAND_DOTNET, ["tool", "restore"], {
    cwd: repoRoot,
    env
  });
}

function tryRunNbgvGlobal(repoRoot, env) {
  return tryExec(COMMAND_NBGV, ["get-version", "--format", "json"], {
    cwd: repoRoot,
    env
  });
}

function canUseDotnet(env) {
  return commandExists(COMMAND_DOTNET, { env });
}

function canUseGlobalNbgv(env) {
  return commandExists(COMMAND_NBGV, { env });
}

function canUseDocker(env) {
  return commandExists(COMMAND_DOCKER, { env });
}

function tryRunNbgvDocker(repoRoot, image, env) {
  // Runs nbgv inside the .NET SDK container.
  // - git config safe.directory: required for mounted volumes (git >= 2.35.2)
  // - dotnet tool restore output redirected to stderr so only nbgv JSON reaches stdout
  const script = [
    `git config --global --add safe.directory ${CONTAINER_WORK_DIR}`,
    `dotnet tool restore 1>&2 || true`,
    `dotnet nbgv get-version --format json`
  ].join(" && ");

  return tryExec(COMMAND_DOCKER, [
    "run", "--rm",
    "-v", `${repoRoot}:${CONTAINER_WORK_DIR}`,
    "-w", CONTAINER_WORK_DIR,
    image,
    "sh", "-c", script
  ], { env });
}

function mapNbgvJson(json) {
  const version = String(json.Version || "").trim();
  const parts = splitVersionParts(version);

  return normalizeVersionInfo({
    source: "nbgv",
    version,
    full: version,
    major: parts.major,
    minor: parts.minor,
    build: parts.build,
    suffix: parseSemVerSuffix(String(json.SemVer2 || version)),
    semVer2: String(json.SemVer2 || version),
    assemblyVersion: String(json.AssemblyVersion || ""),
    informationalVersion: String(json.AssemblyInformationalVersion || ""),
    nuGetPackageVersion: String(json.NuGetPackageVersion || "")
  });
}

function resolveVersion(context) {
  const config = getConfig(context);
  const repoRoot = context.repoRoot;
  const env = context.env || process.env;

  if (!repoUsesNbgv(repoRoot, config)) {
    throw new Error("NBGV provider selected but repository does not appear to use NBGV");
  }

  // --- Docker execution (default) ---
  if (config.useDocker && canUseDocker(env)) {
    const result = tryRunNbgvDocker(repoRoot, config.dockerImage, env);

    if (result.ok && result.stdout) {
      const json = tryParseJson(result.stdout);

      if (json && json.Version) {
        return mapNbgvJson(json);
      }
    }
  }

  // --- Host execution (fallback or useDocker: false) ---
  if (canUseDotnet(env)) {
    let result = tryRunNbgvDotnet(repoRoot, env);
    if (result.ok && result.stdout) {
      const json = tryParseJson(result.stdout);
      if (json && json.Version) {
        return mapNbgvJson(json);
      }
    }

    if (config.allowToolRestore && hasToolManifest(repoRoot, config)) {
      const restore = tryRestoreTools(repoRoot, env);
      if (restore.ok) {
        result = tryRunNbgvDotnet(repoRoot, env);
        if (result.ok && result.stdout) {
          const json = tryParseJson(result.stdout);
          if (json && json.Version) {
            return mapNbgvJson(json);
          }
        }
      }
    }
  }

  if (config.allowGlobalCommand && canUseGlobalNbgv(env)) {

    const result = tryRunNbgvGlobal(repoRoot, env);
    if (result.ok && result.stdout) {

      const json = tryParseJson(result.stdout);
      if (json && json.Version) {
        return mapNbgvJson(json);
      }
    }
  }

  throw new Error("Failed to resolve version using NBGV");
}

module.exports = {
  resolveVersion
};
