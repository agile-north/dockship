const path = require("path");
const { findRepoRoot, readJson } = require("./fs.cjs");
const { validateVersionInfo } = require("./model.cjs");

const BUILD_DIR_NAME = ".dockship";
const BUILD_CONFIG_FILE_NAME = "dockship.json";
const VERSION_SECTION_KEY = "version";
const PROVIDERS_FOLDER = "providers";

function getBuildConfig(repoRoot) {
  const configPath = path.join(repoRoot, BUILD_DIR_NAME, BUILD_CONFIG_FILE_NAME);
  return readJson(configPath);
}

function getProviderName(buildConfig) {
  const provider = buildConfig?.[VERSION_SECTION_KEY]?.provider;

  if (!provider || !String(provider).trim()) {
    throw new Error(`Missing 'version.provider' in .dockship/dockship.json`);
  }

  return String(provider).trim().toLowerCase();
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
  const providerName = getProviderName(context.buildConfig);
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
