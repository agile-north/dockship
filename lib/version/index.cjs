const path = require("path");
const { discoverFiles, fileExists, findRepoRoot, resolvePath, tryReadJson } = require("./fs.cjs");
const { validateVersionInfo } = require("./model.cjs");

const BUILD_DIR_NAME = ".dockship";
const BUILD_CONFIG_FILE_NAME = "dockship.json";
const VERSION_SECTION_KEY = "version";
const PROVIDERS_FOLDER = "providers";
const PROVIDER_AUTO = "auto";
const PROVIDER_NODEJS = "nodejs";
const PROVIDER_DOTNET = "dotnet";
const PROVIDER_NBGV = "nbgv";
const PROVIDER_ENV = "env";
const DEFAULT_ENV_VERSION_VAR = "DOCKSHIP_VERSION";
const PACKAGE_JSON_FILE_NAME = "package.json";
const VERSION_JSON_FILE_NAME = "version.json";
const DOTNET_TOOL_MANIFEST_RELATIVE_PATH = ".config/dotnet-tools.json";
const MODE_FIXED = "fixed";
const EMPTY_STRING = "";
const DEFAULT_MAX_FILES = 10000;
const REGEX_DOTNET_DISCOVERY = /(?:^|[\\/])(AssemblyInfo\.(?:cs|vb|fs)|VersionInfo\.(?:cs|vb|fs)|Directory\.Build\.(?:props|targets)|[^\\/]+\.(?:csproj|vbproj|fsproj))$/i;

function getDefaultBuildConfig() {
  return {
    [VERSION_SECTION_KEY]: {
      provider: PROVIDER_AUTO,
      [PROVIDER_NBGV]: {
        versionJsonFileName: VERSION_JSON_FILE_NAME,
        dotnetToolManifestRelativePath: DOTNET_TOOL_MANIFEST_RELATIVE_PATH,
        allowToolRestore: true,
        allowGlobalCommand: true,
        requireVersionJson: true
      },
      [PROVIDER_NODEJS]: {
        packageJsonPath: PACKAGE_JSON_FILE_NAME,
        mode: MODE_FIXED
      },
      [PROVIDER_DOTNET]: {
        mode: MODE_FIXED,
        mainAssemblyInfoFilePath: EMPTY_STRING,
        assemblyInfoFilePaths: [],
        versionInfoFilePaths: [],
        projectFilePaths: [],
        csprojFilePaths: [],
        autoDiscover: true
      },
      [PROVIDER_ENV]: {
        versionVar: DEFAULT_ENV_VERSION_VAR,
        version: EMPTY_STRING
      }
    }
  };
}

function mergeBuildConfig(config) {
  const defaults = getDefaultBuildConfig();
  const version = config?.[VERSION_SECTION_KEY] || {};

  return {
    ...defaults,
    ...(config || {}),
    [VERSION_SECTION_KEY]: {
      ...defaults[VERSION_SECTION_KEY],
      ...version,
      [PROVIDER_NBGV]: {
        ...defaults[VERSION_SECTION_KEY][PROVIDER_NBGV],
        ...(version[PROVIDER_NBGV] || {})
      },
      [PROVIDER_NODEJS]: {
        ...defaults[VERSION_SECTION_KEY][PROVIDER_NODEJS],
        ...(version[PROVIDER_NODEJS] || {})
      },
      [PROVIDER_DOTNET]: {
        ...defaults[VERSION_SECTION_KEY][PROVIDER_DOTNET],
        ...(version[PROVIDER_DOTNET] || {})
      },
      [PROVIDER_ENV]: {
        ...defaults[VERSION_SECTION_KEY][PROVIDER_ENV],
        ...(version[PROVIDER_ENV] || {})
      }
    }
  };
}

function getBuildConfig(repoRoot) {
  const configPath = path.join(repoRoot, BUILD_DIR_NAME, BUILD_CONFIG_FILE_NAME);
  return mergeBuildConfig(tryReadJson(configPath));
}

function repoHasNbgv(repoRoot, buildConfig) {
  const versionJsonFileName = buildConfig?.[VERSION_SECTION_KEY]?.[PROVIDER_NBGV]?.versionJsonFileName || VERSION_JSON_FILE_NAME;
  return fileExists(resolvePath(repoRoot, versionJsonFileName));
}

function repoHasNodejs(repoRoot, buildConfig) {
  const packageJsonPath = buildConfig?.[VERSION_SECTION_KEY]?.[PROVIDER_NODEJS]?.packageJsonPath || PACKAGE_JSON_FILE_NAME;
  return fileExists(resolvePath(repoRoot, packageJsonPath));
}

function repoHasDotnet(repoRoot, buildConfig) {
  const dotnetConfig = buildConfig?.[VERSION_SECTION_KEY]?.[PROVIDER_DOTNET] || {};
  const configuredPaths = [
    dotnetConfig.mainAssemblyInfoFilePath,
    ...(dotnetConfig.assemblyInfoFilePaths || []),
    ...(dotnetConfig.versionInfoFilePaths || []),
    ...(dotnetConfig.projectFilePaths || []),
    ...(dotnetConfig.csprojFilePaths || [])
  ].filter(Boolean);

  if (configuredPaths.some(filePath => fileExists(resolvePath(repoRoot, filePath)))) {
    return true;
  }

  if (dotnetConfig.autoDiscover === false) {
    return false;
  }

  return discoverFiles(
    repoRoot,
    filePath => REGEX_DOTNET_DISCOVERY.test(filePath),
    { maxFiles: DEFAULT_MAX_FILES }
  ).length > 0;
}

function repoHasEnvVersion(buildConfig, env) {
  const envConfig = buildConfig?.[VERSION_SECTION_KEY]?.[PROVIDER_ENV] || {};
  const versionVar = (envConfig.versionVar && String(envConfig.versionVar).trim()) || DEFAULT_ENV_VERSION_VAR;
  const envVersion = (env || process.env)[versionVar];
  const inlineVersion = envConfig.version && String(envConfig.version).trim();
  return Boolean(envVersion || inlineVersion);
}

function detectProviderName(repoRoot, buildConfig, env) {
  if (repoHasNbgv(repoRoot, buildConfig)) {
    return PROVIDER_NBGV;
  }

  if (repoHasNodejs(repoRoot, buildConfig)) {
    return PROVIDER_NODEJS;
  }

  if (repoHasDotnet(repoRoot, buildConfig)) {
    return PROVIDER_DOTNET;
  }

  if (repoHasEnvVersion(buildConfig, env)) {
    return PROVIDER_ENV;
  }

  throw new Error(
    `Could not auto-detect version provider. Add .dockship/dockship.json with '${VERSION_SECTION_KEY}.provider' or add a supported version source file.`
  );
}

function getProviderName(buildConfig, repoRoot, env) {
  const provider = buildConfig?.[VERSION_SECTION_KEY]?.provider;

  if (!provider || !String(provider).trim()) {
    return detectProviderName(repoRoot, buildConfig, env);
  }

  const normalizedProvider = String(provider).trim().toLowerCase();

  if (normalizedProvider === PROVIDER_AUTO) {
    return detectProviderName(repoRoot, buildConfig, env);
  }

  return normalizedProvider;
}

const REGEX_RELATIVE_PATH = /^\.\.[/\\]|^\.[/\\]/;

function loadProvider(providerName, providerConfig, repoRoot) {
  const errors = [];

  // 1. Try bundled provider first (nodejs, dotnet, nbgv)
  try {
    const bundledPath = path.join(__dirname, PROVIDERS_FOLDER, providerName, "index.cjs");
    return require(bundledPath);
  } catch (e) {
    errors.push(`Bundled: ${e.message}`);
  }

  // 2. Try @agile-north scoped package (e.g., @agile-north/docker-ci-provider-python)
  try {
    return require(`@agile-north/docker-ci-provider-${providerName}`);
  } catch (e) {
    errors.push(`@agile-north scoped: ${e.message}`);
  }

  // 3. Try custom package specified in build.json providerPackage field
  const customPackage = providerConfig?.providerPackage;
  if (customPackage) {
    try {
      // Relative paths (e.g. "./my-provider.cjs") are resolved against the
      // client repo root so consumers can reference local files predictably.
      const resolvedPackage = REGEX_RELATIVE_PATH.test(customPackage) && repoRoot
        ? path.resolve(repoRoot, customPackage)
        : customPackage;
      return require(resolvedPackage);
    } catch (e) {
      errors.push(`Custom package '${customPackage}': ${e.message}`);
    }
  }

  throw new Error(`Provider '${providerName}' not found. Tried: ${errors.join("; ")}`);
}

function isAutoProviderMode(buildConfig) {
  const provider = buildConfig?.[VERSION_SECTION_KEY]?.provider;

  if (!provider || !String(provider).trim()) {
    return true;
  }

  return String(provider).trim().toLowerCase() === PROVIDER_AUTO;
}

function runProvider(context, providerName, runtimeEnv) {
  const providerConfig = context.buildConfig?.[VERSION_SECTION_KEY]?.[providerName] || {};
  const providerModule = loadProvider(providerName, providerConfig, context.repoRoot);

  if (!providerModule || typeof providerModule.resolveVersion !== "function") {
    throw new Error(`Version provider '${providerName}' does not export resolveVersion(context)`);
  }

  const versionInfo = providerModule.resolveVersion({
    ...context,
    env: runtimeEnv,
    providerName,
    providerConfig
  });

  validateVersionInfo(versionInfo);
  return versionInfo;
}

function resolveVersion(context) {
  const runtimeEnv = context.env || process.env;
  const providerName = getProviderName(context.buildConfig, context.repoRoot, runtimeEnv);

  try {
    return runProvider(context, providerName, runtimeEnv);
  } catch (primaryError) {
    const shouldFallbackToEnv =
      providerName !== PROVIDER_ENV &&
      isAutoProviderMode(context.buildConfig) &&
      repoHasEnvVersion(context.buildConfig, runtimeEnv);

    if (!shouldFallbackToEnv) {
      throw primaryError;
    }

    try {
      return runProvider(context, PROVIDER_ENV, runtimeEnv);
    } catch (envFallbackError) {
      throw new Error(
        `Primary provider '${providerName}' failed (${primaryError.message || String(primaryError)}). ` +
        `Env fallback also failed (${envFallbackError.message || String(envFallbackError)}).`
      );
    }
  }
}

function buildContext(startDir = process.cwd()) {
  const repoRoot = findRepoRoot(startDir);
  const buildConfig = getBuildConfig(repoRoot);

  return {
    cwd: startDir,
    repoRoot,
    buildConfig,
    env: process.env
  };
}

function main() {
  const context = buildContext();
  const versionInfo = resolveVersion(context);
  process.stdout.write(`${JSON.stringify(versionInfo, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  buildContext,
  getBuildConfig,
  resolveVersion
};
