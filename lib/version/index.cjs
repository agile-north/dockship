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
const PACKAGE_JSON_FILE_NAME = "package.json";
const VERSION_JSON_FILE_NAME = "version.json";
const DOTNET_TOOL_MANIFEST_RELATIVE_PATH = ".config/dotnet-tools.json";
const MODE_FIXED = "fixed";
const EMPTY_STRING = "";
const DEFAULT_MAX_FILES = 10000;
const REGEX_DOTNET_DISCOVERY = /(?:^|[\\/])(AssemblyInfo\.cs|VersionInfo\.cs|[^\\/]+\.csproj)$/i;

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
        csprojFilePaths: [],
        autoDiscover: true
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

function detectProviderName(repoRoot, buildConfig) {
  if (repoHasNbgv(repoRoot, buildConfig)) {
    return PROVIDER_NBGV;
  }

  if (repoHasNodejs(repoRoot, buildConfig)) {
    return PROVIDER_NODEJS;
  }

  if (repoHasDotnet(repoRoot, buildConfig)) {
    return PROVIDER_DOTNET;
  }

  throw new Error(
    `Could not auto-detect version provider. Add .dockship/dockship.json with '${VERSION_SECTION_KEY}.provider' or add a supported version source file.`
  );
}

function getProviderName(buildConfig, repoRoot) {
  const provider = buildConfig?.[VERSION_SECTION_KEY]?.provider;

  if (!provider || !String(provider).trim()) {
    return detectProviderName(repoRoot, buildConfig);
  }

  const normalizedProvider = String(provider).trim().toLowerCase();

  if (normalizedProvider === PROVIDER_AUTO) {
    return detectProviderName(repoRoot, buildConfig);
  }

  return normalizedProvider;
}

function loadProvider(providerName, providerConfig) {
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
      return require(customPackage);
    } catch (e) {
      errors.push(`Custom package '${customPackage}': ${e.message}`);
    }
  }

  throw new Error(`Provider '${providerName}' not found. Tried: ${errors.join("; ")}`);
}

function resolveVersion(context) {
  const providerName = getProviderName(context.buildConfig, context.repoRoot);
  const providerConfig = context.buildConfig?.[VERSION_SECTION_KEY]?.[providerName] || {};
  const providerModule = loadProvider(providerName, providerConfig);

  if (!providerModule || typeof providerModule.resolveVersion !== "function") {
    throw new Error(`Version provider '${providerName}' does not export resolveVersion(context)`);
  }

  const versionInfo = providerModule.resolveVersion({
    ...context,
    providerName,
    providerConfig
  });

  validateVersionInfo(versionInfo);
  return versionInfo;
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
