#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

//
// =======================
// CONSTANTS (NO MAGIC STRINGS)
// =======================
//

// Commands
const CMD_BUILD = "build";
const CMD_PUSH = "push";
const CMD_SHIP = "ship";
const CMD_ALL = "all";
const CMD_VERSION = "version";
const CMD_TAGS = "tags";
const CMD_HELP = "help";
const FLAG_HELP = "--help";
const FLAG_HELP_SHORT = "-h";

// Paths
const BUILD_DIR = ".dockship";
const BUILD_CONFIG_FILE = "dockship.json";
const VERSION_SCRIPT_PATH = ["lib", "version", "index.cjs"];

const ENV_FILE_NAME = ".env";

// Env vars
const ENV_DOCKER_REGISTRY = "DOCKER_TARGET_REGISTRY";
const ENV_DOCKER_REPOSITORY = "DOCKER_TARGET_REPOSITORY";
const ENV_DOCKER_PUSH_ENABLED = "DOCKER_PUSH_ENABLED";
const ENV_DOCKER_PUSH_BRANCHES = "DOCKER_PUSH_BRANCHES";
const ENV_DOCKER_TAG_LATEST = "DOCKER_TAG_LATEST";
const ENV_DOCKER_CONTEXT = "DOCKER_CONTEXT";
const ENV_DOCKERFILE_PATH = "DOCKERFILE_PATH";
const ENV_DOCKER_PLATFORM = "DOCKER_PLATFORM";
const ENV_DOCKER_BUILD_ARGS = "DOCKER_BUILD_ARGS";
const ENV_DOCKER_LOGIN_USERNAME = "DOCKER_LOGIN_USERNAME";
const ENV_DOCKER_LOGIN_PASSWORD = "DOCKER_LOGIN_PASSWORD";
const ENV_DOCKER_LOGIN_REGISTRY = "DOCKER_LOGIN_REGISTRY";
const LEGACY_ENV_DOCKER_AUTH_USERNAME = "DOCKER_AUTH_USERNAME";
const LEGACY_ENV_DOCKER_AUTH_PASSWORD = "DOCKER_AUTH_PASSWORD";
const LEGACY_ENV_DOCKER_AUTH_REGISTRY = "DOCKER_AUTH_REGISTRY";
const ENV_DOCKER_CONFIG = "DOCKER_CONFIG";
const ENV_GITHUB_HEAD_REF = "GITHUB_HEAD_REF";
const ENV_GITHUB_REF_NAME = "GITHUB_REF_NAME";
const ENV_BUILD_SOURCEBRANCHNAME = "BUILD_SOURCEBRANCHNAME";
const ENV_BUILD_SOURCEBRANCH = "BUILD_SOURCEBRANCH";
const ENV_BRANCH_NAME = "BRANCH_NAME";
const ENV_CI_COMMIT_REF_NAME = "CI_COMMIT_REF_NAME";
const ENV_TEAMCITY_BUILD_BRANCH = "TEAMCITY_BUILD_BRANCH";
const ENV_GIT_BRANCH = "GIT_BRANCH";

// Defaults
const DEFAULT_DOCKERFILE = "Dockerfile";
const DEFAULT_CONTEXT = ".";
const DEFAULT_PROGRESS = "plain";
const TEMP_DOCKER_CONFIG_PREFIX = "dockship-docker-config-";
const EMPTY_STRING = "";
const GIT_HEAD = "HEAD";
const GIT_REFS_HEADS_PREFIX = "refs/heads/";
const GIT_REMOTES_ORIGIN_PREFIX = "origin/";

// Docker args
const DOCKER_CMD = "docker";
const DOCKER_BUILD = "build";
const DOCKER_LOGIN = "login";
const DOCKER_PUSH = "push";
const DOCKER_FLAG_TAG = "-t";
const DOCKER_FLAG_FILE = "-f";
const DOCKER_FLAG_PLATFORM = "--platform";
const DOCKER_FLAG_BUILD_ARG = "--build-arg";
const DOCKER_FLAG_PROGRESS = "--progress";
const DOCKER_FLAG_USERNAME = "--username";
const DOCKER_FLAG_PASSWORD_STDIN = "--password-stdin";

// Git args
const GIT_CMD = "git";
const GIT_REV_PARSE = "rev-parse";
const GIT_ABBREV_REF = "--abbrev-ref";

function getDefaultBuildConfig() {
  return {
    docker: {
      file: DEFAULT_DOCKERFILE,
      context: DEFAULT_CONTEXT,
      target: {
        registry: EMPTY_STRING,
        repository: EMPTY_STRING
      },
      login: {
        registry: EMPTY_STRING
      },
      push: {
        enabled: false,
        branches: []
      },
      tags: {
        latest: false
      },
      platform: EMPTY_STRING,
      buildArgs: {}
    }
  };
}


function loadDotEnv(repoRoot) {
  const envPath = path.join(repoRoot, ENV_FILE_NAME);

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");

  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const idx = trimmed.indexOf("=");
    if (idx === -1) {
      return;
    }

    const key = trimmed.substring(0, idx).trim();
    let value = trimmed.substring(idx + 1).trim();

    // remove quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // don't override existing env (CI should win)
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

//
// =======================
// HELPERS
// =======================
//

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function tryReadJson(p) {
  try {
    return JSON.parse(readText(p));
  } catch {
    return null;
  }
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);

  while (true) {
    if (fileExists(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

function normalizeBool(v, def = false) {
  if (v === undefined || v === null || v === "") return def;
  return ["1", "true", "yes", "y", "on"].includes(String(v).toLowerCase());
}

function getString(v, def = "") {
  return v === undefined || v === null ? def : String(v).trim();
}

function getFirstDefinedString(env, keys, def = EMPTY_STRING) {
  for (const key of keys) {
    const value = getString(env[key]);

    if (value) {
      return value;
    }
  }

  return def;
}

function getStringArray(v, def = []) {
  const source = v === undefined || v === null || v === "" ? def : v;

  if (Array.isArray(source)) {
    return source
      .map(item => getString(item))
      .filter(Boolean);
  }

  return getString(source)
    .split(/[;,\r\n]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function splitCommandArgs(value) {
  const input = getString(value);

  if (!input) {
    return [];
  }

  const parts = [];
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/g;
  let match;

  while ((match = regex.exec(input)) !== null) {
    parts.push(match[1] || match[2] || match[3] || EMPTY_STRING);
  }

  return parts.filter(Boolean);
}

function parseBuildArgsEnv(value) {
  const trimmed = value.trim();

  if (trimmed.startsWith("{")) {
    let obj;

    try {
      obj = JSON.parse(trimmed);
    } catch {
      throw new Error(`${ENV_DOCKER_BUILD_ARGS} looks like JSON but could not be parsed`);
    }

    return Object.entries(obj).flatMap(([k, v]) => [DOCKER_FLAG_BUILD_ARG, `${k}=${v}`]);
  }

  // Semicolon/newline-delimited KEY=value pairs
  return trimmed.split(/[;\n]+/).flatMap(pair => {
    const p = pair.trim();

    return p ? [DOCKER_FLAG_BUILD_ARG, p] : [];
  });
}

function resolveBuildArgs(env, docker) {
  // Priority 1: DOCKER_BUILD_ARGS env var (JSON object or KEY=value;KEY2=value2)
  const envValue = getString(env[ENV_DOCKER_BUILD_ARGS]);

  if (envValue) {
    return parseBuildArgsEnv(envValue);
  }

  // Priority 2: docker.buildArgs in config (object or legacy raw string)
  const configArgs = docker.buildArgs;

  if (configArgs !== null && configArgs !== undefined && typeof configArgs === "object") {
    return Object.entries(configArgs).flatMap(([k, v]) => [DOCKER_FLAG_BUILD_ARG, `${k}=${v}`]);
  }

  if (typeof configArgs === "string" && configArgs) {
    // Legacy: raw CLI passthrough, e.g. "--build-arg ENV=prod --build-arg FOO=bar"
    return splitCommandArgs(configArgs);
  }

  return [];
}

function exec(command, args, options = {}) {
  console.log([command, ...(options.logArgs || args)].join(" "));
  const res = cp.spawnSync(command, args, {
    stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    input: options.input,
  });

  if (res.status !== 0) {
    throw new Error(`${command} failed`);
  }
}

function execCapture(command, args, options = {}) {
  const res = cp.spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    encoding: "utf8",
  });

  if (res.status !== 0) {
    throw new Error(res.stderr || `${command} failed`);
  }

  return res.stdout.trim();
}

//
// =======================
// VERSION
// =======================
//

function getVersion(repoRoot) {
  const scriptPath = path.join(__dirname, ...VERSION_SCRIPT_PATH);

  if (!fileExists(scriptPath)) {
    throw new Error(`Missing version script: ${scriptPath}`);
  }

  const output = execCapture(process.execPath, [scriptPath], { cwd: repoRoot });

  const json = JSON.parse(output);

  if (!json.version) throw new Error("Invalid version output");

  return json;
}

//
// =======================
// DOCKER
// =======================
//

function getNestedValue(primary, legacy) {
  return primary === undefined ? legacy : primary;
}

function normalizeBranchName(branchName) {
  const branch = getString(branchName, EMPTY_STRING);

  if (!branch) {
    return EMPTY_STRING;
  }

  if (branch.startsWith(GIT_REFS_HEADS_PREFIX)) {
    return branch.slice(GIT_REFS_HEADS_PREFIX.length);
  }

  if (branch.startsWith(GIT_REMOTES_ORIGIN_PREFIX)) {
    return branch.slice(GIT_REMOTES_ORIGIN_PREFIX.length);
  }

  return branch;
}

function tryGetCurrentBranch(repoRoot, env) {
  const envBranch =
    env[ENV_GITHUB_HEAD_REF] ||
    env[ENV_GITHUB_REF_NAME] ||
    env[ENV_BUILD_SOURCEBRANCHNAME] ||
    env[ENV_BUILD_SOURCEBRANCH] ||
    env[ENV_BRANCH_NAME] ||
    env[ENV_CI_COMMIT_REF_NAME] ||
    env[ENV_TEAMCITY_BUILD_BRANCH] ||
    env[ENV_GIT_BRANCH];

  const normalizedEnvBranch = normalizeBranchName(envBranch);

  if (normalizedEnvBranch) {
    return normalizedEnvBranch;
  }

  try {
    const branch = execCapture(GIT_CMD, [GIT_REV_PARSE, GIT_ABBREV_REF, GIT_HEAD], { cwd: repoRoot });
    const normalizedBranch = normalizeBranchName(branch);

    return normalizedBranch === GIT_HEAD ? EMPTY_STRING : normalizedBranch;
  } catch {
    return EMPTY_STRING;
  }
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function branchPatternToRegex(pattern) {
  return new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, ".*")}$`);
}

function isBranchAllowed(branch, patterns) {
  if (!patterns.length) {
    return true;
  }

  if (!branch) {
    return false;
  }

  return patterns.some(pattern => branchPatternToRegex(pattern).test(branch));
}

function getDockerSettings(config, env, repoRoot, options = {}) {
  const requireImageTarget = options.requireImageTarget === true;
  const docker = config.docker || {};
  const target = docker.target || {};
  const login = docker.login || {};
  const push = docker.push || {};
  const tags = docker.tags || {};

  const registry = getString(env[ENV_DOCKER_REGISTRY], getNestedValue(target.registry, docker.targetRegistry));
  const repo = getString(env[ENV_DOCKER_REPOSITORY], getNestedValue(target.repository, docker.targetRepository));
  const currentBranch = tryGetCurrentBranch(repoRoot, env);
  const pushBranches = getStringArray(
    env[ENV_DOCKER_PUSH_BRANCHES],
    getNestedValue(push.branches, docker.pushBranches)
  );

  if (requireImageTarget && !registry) throw new Error(`${ENV_DOCKER_REGISTRY} required`);
  if (requireImageTarget && !repo) throw new Error(`${ENV_DOCKER_REPOSITORY} required`);

  return {
    registry,
    repository: repo,
    loginRegistry: getString(login.registry),
    image: registry && repo ? `${registry}/${repo}` : EMPTY_STRING,
    context: getString(env[ENV_DOCKER_CONTEXT], docker.context || DEFAULT_CONTEXT),
    file: getString(env[ENV_DOCKERFILE_PATH], getNestedValue(docker.file, docker.dockerfile) || DEFAULT_DOCKERFILE),
    pushEnabled: normalizeBool(env[ENV_DOCKER_PUSH_ENABLED], getNestedValue(push.enabled, docker.pushEnabled)),
    pushBranches,
    currentBranch,
    latest: normalizeBool(env[ENV_DOCKER_TAG_LATEST], getNestedValue(tags.latest, docker.tagLatest)),
    platform: getString(env[ENV_DOCKER_PLATFORM], docker.platform),
    buildArgFlags: resolveBuildArgs(env, docker),
  };
}

function getTags(version, settings) {
  const tags = new Set();

  tags.add(version.version);

  if (version.major) tags.add(version.major);
  if (version.major && version.minor) tags.add(`${version.major}.${version.minor}`);

  if (settings.latest) tags.add("latest");

  return [...tags];
}

function getDockerAuthSettings(env, settings) {
  const username = getFirstDefinedString(env, [ENV_DOCKER_LOGIN_USERNAME, LEGACY_ENV_DOCKER_AUTH_USERNAME]);
  const password = getFirstDefinedString(env, [ENV_DOCKER_LOGIN_PASSWORD, LEGACY_ENV_DOCKER_AUTH_PASSWORD]);
  const registry = getFirstDefinedString(
    env,
    [ENV_DOCKER_LOGIN_REGISTRY, LEGACY_ENV_DOCKER_AUTH_REGISTRY],
    settings.loginRegistry || settings.registry
  );

  if ((username && !password) || (!username && password)) {
    throw new Error(`${ENV_DOCKER_LOGIN_USERNAME} and ${ENV_DOCKER_LOGIN_PASSWORD} must both be set`);
  }

  if ((username || password) && !registry) {
    throw new Error(`${ENV_DOCKER_LOGIN_REGISTRY} or ${ENV_DOCKER_REGISTRY} required when docker login credentials are provided`);
  }

  return {
    enabled: Boolean(username && password),
    username,
    password,
    registry
  };
}

function dockerLogin(repoRoot, auth, env) {
  exec(
    DOCKER_CMD,
    [DOCKER_LOGIN, auth.registry, DOCKER_FLAG_USERNAME, auth.username, DOCKER_FLAG_PASSWORD_STDIN],
    {
      cwd: repoRoot,
      env,
      input: `${auth.password}\n`
    }
  );
}

function withDockerAuth(repoRoot, env, settings, action) {
  const auth = getDockerAuthSettings(env, settings);

  if (!auth.enabled) {
    return action(env);
  }

  const dockerConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_DOCKER_CONFIG_PREFIX));
  const authEnv = {
    ...env,
    [ENV_DOCKER_CONFIG]: dockerConfigDir
  };

  try {
    dockerLogin(repoRoot, auth, authEnv);
    return action(authEnv);
  } finally {
    fs.rmSync(dockerConfigDir, { recursive: true, force: true });
  }
}

function dockerBuild(repoRoot, version, settings, env) {
  const tags = getTags(version, settings);

  const args = [
    DOCKER_BUILD,
    DOCKER_FLAG_PROGRESS,
    DEFAULT_PROGRESS,
    DOCKER_FLAG_FILE,
    settings.file,
  ];

  if (settings.platform) {
    args.push(DOCKER_FLAG_PLATFORM, settings.platform);
  }

  args.push(...settings.buildArgFlags);

  args.push(DOCKER_FLAG_BUILD_ARG, `APP_VERSION=${version.full}`);

  tags.forEach(t => {
    args.push(DOCKER_FLAG_TAG, `${settings.image}:${t}`);
  });

  args.push(settings.context);

  exec(DOCKER_CMD, args, { cwd: repoRoot, env });
}

function dockerPush(repoRoot, version, settings, env) {
  if (!settings.pushEnabled) {
    console.log("Push disabled");
    return;
  }

  if (!isBranchAllowed(settings.currentBranch, settings.pushBranches)) {
    if (!settings.currentBranch) {
      console.log("Push skipped: unable to determine current branch");
      return;
    }

    console.log(
      `Push skipped: branch '${settings.currentBranch}' does not match [${settings.pushBranches.join(", ")}]`
    );
    return;
  }

  const tags = getTags(version, settings);

  tags.forEach(t => {
    exec(DOCKER_CMD, [DOCKER_PUSH, `${settings.image}:${t}`], { cwd: repoRoot, env });
  });
}

//
// =======================
// MAIN
// =======================
//

function showHelp() {
  const help = `
dock - Docker image versioning, building, and pushing CLI

USAGE:
  dock [COMMAND]

COMMANDS:
  build          Build Docker image(s) with version tags (default)
  ship, push     Push existing image tags to registry
  all            Build image(s), then push them to registry
  version        Output resolved version information as JSON
  tags           Output computed Docker tags as JSON
  help, --help   Show this help menu

EXAMPLES:
  dock build              # Build image with automatic version detection
  dock ship               # Push image to configured registry
  dock all                # Build and push in one command
  dock version            # Display resolved version info
  dock tags               # Show what tags will be applied
  dock --help             # Show help menu

CONFIGURATION:
  Configuration can be set via:
  1. Environment variables (highest priority)
  2. .env file in repo root
  3. .dockship/dockship.json in repo root
  4. Built-in defaults (lowest priority)

ENVIRONMENT VARIABLES:
  DOCKER_TARGET_REGISTRY      Docker registry URL (e.g., docker.io)
  DOCKER_TARGET_REPOSITORY    Image repository (e.g., myorg/myrepo)
  DOCKER_PUSH_ENABLED         Enable/disable push (true/false)
  DOCKER_PUSH_BRANCHES        Branches that trigger push (comma-separated)
  DOCKER_TAG_LATEST           Tag image as 'latest' (true/false)
  DOCKER_CONTEXT              Docker build context (default: .)
  DOCKERFILE_PATH             Path to Dockerfile (default: Dockerfile)
  DOCKER_PLATFORM             Target platform (e.g., linux/amd64)
  DOCKER_BUILD_ARGS           Build args as KEY=value pairs
  DOCKER_LOGIN_USERNAME       Optional registry login username
  DOCKER_LOGIN_PASSWORD       Optional registry login password/token
  DOCKER_LOGIN_REGISTRY       Optional login registry override

VERSION DETECTION:
  Providers (run in order): Node.js (package.json) → .NET (.csproj) → Nerdbank.GitVersioning
  Custom providers can be configured in .dockship/dockship.json

DOCKER LOGIN:
  When DOCKER_LOGIN_USERNAME and DOCKER_LOGIN_PASSWORD are set, dock uses
  a temporary isolated Docker config for login during that invocation only.
  DOCKER_LOGIN_REGISTRY defaults to docker.login.registry, then DOCKER_TARGET_REGISTRY.

LEGACY COMPATIBILITY:
  DOCKER_AUTH_USERNAME, DOCKER_AUTH_PASSWORD, and DOCKER_AUTH_REGISTRY
  remain supported as aliases for the DOCKER_LOGIN_* variables.

For more information, visit: https://github.com/agile-north/dockship
`;

  console.log(help);
}

function main() {
  const cmd = (process.argv[2] || CMD_BUILD).toLowerCase();

  // Handle help flags/command early
  if (cmd === CMD_HELP || cmd === FLAG_HELP || cmd === FLAG_HELP_SHORT) {
    showHelp();
    return;
  }

  const root = findRepoRoot(process.cwd());

  const config = tryReadJson(path.join(root, BUILD_DIR, BUILD_CONFIG_FILE)) || getDefaultBuildConfig();


  loadDotEnv(root);

  const version = getVersion(root);

  switch (cmd) {
    case CMD_BUILD: {
      const docker = getDockerSettings(config, process.env, root, { requireImageTarget: true });
      withDockerAuth(root, process.env, docker, authEnv => {
        dockerBuild(root, version, docker, authEnv);
      });
      break;
    }

    case CMD_PUSH:
    case CMD_SHIP: {
      const docker = getDockerSettings(config, process.env, root, { requireImageTarget: true });
      withDockerAuth(root, process.env, docker, authEnv => {
        dockerPush(root, version, docker, authEnv);
      });
      break;
    }

    case CMD_ALL: {
      const docker = getDockerSettings(config, process.env, root, { requireImageTarget: true });
      withDockerAuth(root, process.env, docker, authEnv => {
        dockerBuild(root, version, docker, authEnv);
        dockerPush(root, version, docker, authEnv);
      });
      break;
    }

    case CMD_VERSION:
      console.log(JSON.stringify(version, null, 2));
      break;

    case CMD_TAGS: {
      const docker = getDockerSettings(config, process.env, root);
      console.log(JSON.stringify(getTags(version, docker), null, 2));
      break;
    }

    default:
      console.error(`Unknown command: ${cmd}`);
      showHelp();
      process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

module.exports = {
  main
};
