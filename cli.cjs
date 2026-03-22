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
const FLAG_JSON = "--json";
const FLAG_OUTPUT = "--output";

// Output modes
const OUTPUT_MODE_HUMAN = "human";
const OUTPUT_MODE_JSON = "json";

// Result statuses
const STATUS_SUCCESS = "success";
const STATUS_SKIPPED = "skipped";
const STATUS_PARTIAL = "partial";
const STATUS_FAILED = "failed";

// Exit codes
const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

// JSON envelope
const SCHEMA_VERSION = "1";
const TOOL_NAME = "dockship";
const UNKNOWN_VALUE = "unknown";
const NULL_VALUE = null;

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
const ENV_DOCKER_CLEANUP_LOCAL = "DOCKER_CLEANUP_LOCAL";
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
const ENV_CI = "CI";
const ENV_GITHUB_ACTIONS = "GITHUB_ACTIONS";
const ENV_GITLAB_CI = "GITLAB_CI";
const ENV_TF_BUILD = "TF_BUILD";
const ENV_BUILDKITE = "BUILDKITE";
const ENV_TEAMCITY_VERSION = "TEAMCITY_VERSION";
const ENV_JENKINS_URL = "JENKINS_URL";

// Defaults
const DEFAULT_DOCKERFILE = "Dockerfile";
const DEFAULT_CONTEXT = ".";
const DEFAULT_PROGRESS = "plain";
const DEFAULT_CLEANUP_LOCAL_MODE = "auto";
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
const DOCKER_IMAGE = "image";
const DOCKER_RM = "rm";
const DOCKER_FLAG_TAG = "-t";
const DOCKER_FLAG_FILE = "-f";
const DOCKER_FLAG_PLATFORM = "--platform";
const DOCKER_FLAG_BUILD_ARG = "--build-arg";
const DOCKER_FLAG_PROGRESS = "--progress";
const DOCKER_FLAG_USERNAME = "--username";
const DOCKER_FLAG_PASSWORD_STDIN = "--password-stdin";

// Cleanup modes
const CLEANUP_MODE_AUTO = "auto";
const CLEANUP_MODE_TRUE = "true";
const CLEANUP_MODE_FALSE = "false";

// Git args
const GIT_CMD = "git";
const GIT_REV_PARSE = "rev-parse";
const GIT_ABBREV_REF = "--abbrev-ref";
const GIT_SHORT = "--short";
const GIT_CONFIG = "config";
const GIT_GET = "--get";
const GIT_REMOTE_ORIGIN_URL = "remote.origin.url";

const STATUS_ERROR_CODE_CONFIG = "CONFIG_ERROR";
const STATUS_ERROR_CODE_DOCKER_BUILD = "DOCKER_BUILD_FAILED";
const STATUS_ERROR_CODE_DOCKER_PUSH = "DOCKER_PUSH_FAILED";
const STATUS_ERROR_CODE_USAGE = "USAGE_ERROR";
const STATUS_ERROR_CODE_UNKNOWN = "UNKNOWN_ERROR";

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
      cleanup: {
        local: DEFAULT_CLEANUP_LOCAL_MODE
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

function normalizeTriStateBoolean(value, fallback = CLEANUP_MODE_AUTO) {
  if (value === undefined || value === null || value === EMPTY_STRING) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value ? CLEANUP_MODE_TRUE : CLEANUP_MODE_FALSE;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return CLEANUP_MODE_TRUE;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return CLEANUP_MODE_FALSE;
  }

  if (normalized === CLEANUP_MODE_AUTO) {
    return CLEANUP_MODE_AUTO;
  }

  throw new Error(
    `Unsupported cleanup.local value: ${value}. Supported values: ${CLEANUP_MODE_AUTO}, ${CLEANUP_MODE_TRUE}, ${CLEANUP_MODE_FALSE}`
  );
}

function isCiEnvironment(env) {
  const ciSignals = [
    ENV_CI,
    ENV_GITHUB_ACTIONS,
    ENV_GITLAB_CI,
    ENV_TF_BUILD,
    ENV_BUILDKITE,
    ENV_TEAMCITY_VERSION,
    ENV_JENKINS_URL
  ];

  return ciSignals.some(key => {
    const value = getString(env[key]);
    return value && value.toLowerCase() !== CLEANUP_MODE_FALSE;
  });
}

function resolveCleanupLocal(env, cleanupConfig) {
  const mode = normalizeTriStateBoolean(
    env[ENV_DOCKER_CLEANUP_LOCAL],
    normalizeTriStateBoolean(cleanupConfig, DEFAULT_CLEANUP_LOCAL_MODE)
  );

  if (mode === CLEANUP_MODE_AUTO) {
    return isCiEnvironment(env);
  }

  return mode === CLEANUP_MODE_TRUE;
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

function parseOutputMode(value) {
  const mode = getString(value).toLowerCase();

  if (!mode) {
    throw new Error(`${FLAG_OUTPUT} requires a value (${OUTPUT_MODE_HUMAN}|${OUTPUT_MODE_JSON})`);
  }

  if (mode !== OUTPUT_MODE_HUMAN && mode !== OUTPUT_MODE_JSON) {
    throw new Error(`Unsupported output mode: ${value}. Supported values: ${OUTPUT_MODE_HUMAN}, ${OUTPUT_MODE_JSON}`);
  }

  return mode;
}

function hasJsonOutputFlag(argv) {
  const args = Array.isArray(argv) ? argv : [];

  for (let i = 0; i < args.length; i += 1) {
    const token = getString(args[i]);

    if (token === FLAG_JSON) {
      return true;
    }

    if (token === FLAG_OUTPUT) {
      const nextValue = getString(args[i + 1]).toLowerCase();

      if (nextValue === OUTPUT_MODE_JSON) {
        return true;
      }
    }

    if (token.startsWith(`${FLAG_OUTPUT}=`) && token.slice(`${FLAG_OUTPUT}=`.length).toLowerCase() === OUTPUT_MODE_JSON) {
      return true;
    }
  }

  return false;
}

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  let command = EMPTY_STRING;
  let outputMode = OUTPUT_MODE_HUMAN;

  for (let i = 0; i < args.length; i += 1) {
    const token = getString(args[i]);

    if (!token) {
      continue;
    }

    if (token === FLAG_HELP || token === FLAG_HELP_SHORT) {
      return {
        command: CMD_HELP,
        outputMode
      };
    }

    if (token === FLAG_JSON) {
      outputMode = OUTPUT_MODE_JSON;
      continue;
    }

    if (token === FLAG_OUTPUT) {
      const nextValue = args[i + 1];

      if (nextValue === undefined) {
        throw new Error(`${FLAG_OUTPUT} requires a value (${OUTPUT_MODE_HUMAN}|${OUTPUT_MODE_JSON})`);
      }

      outputMode = parseOutputMode(nextValue);
      i += 1;
      continue;
    }

    if (token.startsWith(`${FLAG_OUTPUT}=`)) {
      outputMode = parseOutputMode(token.slice(`${FLAG_OUTPUT}=`.length));
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }

    if (!command) {
      command = token.toLowerCase();
      continue;
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  return {
    command: command || CMD_BUILD,
    outputMode
  };
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

function runCommand(command, args, options = {}) {
  const outputMode = options.outputMode || OUTPUT_MODE_HUMAN;

  if (outputMode === OUTPUT_MODE_HUMAN) {
    console.log([command, ...(options.logArgs || args)].join(" "));
  }

  const spawnOptions = {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    input: options.input,
  };

  if (outputMode === OUTPUT_MODE_JSON) {
    spawnOptions.stdio = options.input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"];
    spawnOptions.encoding = "utf8";
  } else {
    spawnOptions.stdio = options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"];
  }

  const res = cp.spawnSync(command, args, spawnOptions);
  const stdout = getString(res.stdout);
  const stderr = getString(res.stderr);

  if (outputMode === OUTPUT_MODE_JSON) {
    if (stdout) {
      process.stderr.write(`${stdout}${stdout.endsWith("\n") ? EMPTY_STRING : "\n"}`);
    }

    if (stderr) {
      process.stderr.write(`${stderr}${stderr.endsWith("\n") ? EMPTY_STRING : "\n"}`);
    }
  }

  return {
    ok: res.status === 0,
    status: res.status,
    stdout,
    stderr,
  };
}

function exec(command, args, options = {}) {
  const result = runCommand(command, args, options);

  if (!result.ok) {
    throw new Error(`${command} failed`);
  }

  return result;
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

function getCurrentBranchInfo(repoRoot, env) {
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
    return {
      branch: normalizedEnvBranch,
      source: "env",
      inputBranch: getString(envBranch)
    };
  }

  try {
    const branch = execCapture(GIT_CMD, [GIT_REV_PARSE, GIT_ABBREV_REF, GIT_HEAD], { cwd: repoRoot });
    const normalizedBranch = normalizeBranchName(branch);

    if (normalizedBranch === GIT_HEAD || !normalizedBranch) {
      return {
        branch: EMPTY_STRING,
        source: UNKNOWN_VALUE,
        inputBranch: getString(branch)
      };
    }

    return {
      branch: normalizedBranch,
      source: "git",
      inputBranch: getString(branch)
    };
  } catch {
    return {
      branch: EMPTY_STRING,
      source: UNKNOWN_VALUE,
      inputBranch: EMPTY_STRING
    };
  }
}

function tryGetCurrentBranch(repoRoot, env) {
  return getCurrentBranchInfo(repoRoot, env).branch;
}

function tryGetCommit(repoRoot) {
  try {
    return execCapture(GIT_CMD, [GIT_REV_PARSE, GIT_SHORT, GIT_HEAD], { cwd: repoRoot });
  } catch {
    return EMPTY_STRING;
  }
}

function tryGetRemoteUrl(repoRoot) {
  try {
    return execCapture(GIT_CMD, [GIT_CONFIG, GIT_GET, GIT_REMOTE_ORIGIN_URL], { cwd: repoRoot });
  } catch {
    return EMPTY_STRING;
  }
}

function parseRepositoryFromRemote(remoteUrl) {
  const url = getString(remoteUrl);

  if (!url) {
    return EMPTY_STRING;
  }

  const normalized = url
    .replace(/^git@github\.com:/i, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/")
    .replace(/\.git$/i, EMPTY_STRING);

  const match = normalized.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i);

  if (!match) {
    return EMPTY_STRING;
  }

  return `${match[1]}/${match[2]}`;
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
  const cleanup = docker.cleanup || {};

  const registry = getString(env[ENV_DOCKER_REGISTRY], getNestedValue(target.registry, docker.targetRegistry));
  const repo = getString(env[ENV_DOCKER_REPOSITORY], getNestedValue(target.repository, docker.targetRepository));
  const branchInfo = getCurrentBranchInfo(repoRoot, env);
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
    currentBranch: branchInfo.branch,
    currentBranchSource: branchInfo.source,
    inputBranch: branchInfo.inputBranch,
    latest: normalizeBool(env[ENV_DOCKER_TAG_LATEST], getNestedValue(tags.latest, docker.tagLatest)),
    cleanupLocal: resolveCleanupLocal(env, getNestedValue(cleanup.local, DEFAULT_CLEANUP_LOCAL_MODE)),
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

function dockerBuild(repoRoot, version, settings, env, outputMode = OUTPUT_MODE_HUMAN) {
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

  exec(DOCKER_CMD, args, { cwd: repoRoot, env, outputMode });
}

function dockerPush(repoRoot, version, settings, env, outputMode = OUTPUT_MODE_HUMAN) {
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
    exec(DOCKER_CMD, [DOCKER_PUSH, `${settings.image}:${t}`], { cwd: repoRoot, env, outputMode });
  });
}

function dockerCleanupLocalImages(repoRoot, version, settings, env, outputMode = OUTPUT_MODE_HUMAN) {
  if (!settings.cleanupLocal) {
    return [];
  }

  const tags = getTags(version, settings);
  const removed = [];

  tags.forEach(tag => {
    const reference = `${settings.image}:${tag}`;
    exec(DOCKER_CMD, [DOCKER_IMAGE, DOCKER_RM, reference], { cwd: repoRoot, env, outputMode });
    removed.push(reference);
  });

  return removed;
}

function getToolVersion() {
  try {
    return require("./package.json").version || EMPTY_STRING;
  } catch {
    return EMPTY_STRING;
  }
}

function createError(code, message, details = {}) {
  return {
    code,
    message,
    details
  };
}

function getStatusExitCode(status, usageError = false) {
  if (usageError) {
    return EXIT_USAGE;
  }

  if (status === STATUS_SUCCESS || status === STATUS_SKIPPED) {
    return EXIT_OK;
  }

  return EXIT_FAILED;
}

function buildVersionResult(version) {
  const patch = getString(version.build);

  return {
    ...version,
    patch,
    components: {
      major: getString(version.major),
      minor: getString(version.minor),
      patch,
      suffix: getString(version.suffix)
    }
  };
}

function buildArtifact(version, settings, digestValue = NULL_VALUE) {
  const registry = getString(settings.registry);
  const repository = getString(settings.repository);
  const imageName = registry && repository ? `${registry}/${repository}` : EMPTY_STRING;
  const tags = getTags(version, settings);
  const primaryTag = tags[0] || getString(version.version);
  const reference = imageName && primaryTag ? `${imageName}:${primaryTag}` : NULL_VALUE;
  const references = imageName
    ? tags.map(tag => `${imageName}:${tag}`)
    : [];
  const digestReference = imageName && digestValue ? `${imageName}@${digestValue}` : NULL_VALUE;

  return {
    version: getString(version.version),
    id: digestReference,
    image: {
      registry: registry || NULL_VALUE,
      repository: repository || NULL_VALUE,
      reference,
      primaryTag,
      tag: primaryTag,
      tags,
      references,
      digest: {
        value: digestValue || NULL_VALUE,
        reference: digestReference
      }
    }
  };
}

function buildMetadata(settings) {
  const platform = getString(settings.platform);

  return {
    platforms: platform ? [platform] : []
  };
}

function getGitContext(repoRoot, env) {
  const branchInfo = getCurrentBranchInfo(repoRoot, env);
  const remoteUrl = tryGetRemoteUrl(repoRoot);

  return {
    branch: branchInfo.branch || NULL_VALUE,
    branchSource: branchInfo.source || UNKNOWN_VALUE,
    commit: tryGetCommit(repoRoot) || NULL_VALUE,
    repository: parseRepositoryFromRemote(remoteUrl) || NULL_VALUE,
    remoteUrl: remoteUrl || NULL_VALUE
  };
}

function createEnvelope(command, outputMode, status, startedAt, repoRoot, env, result, warnings, errors) {
  return {
    schemaVersion: SCHEMA_VERSION,
    command,
    outputMode,
    success: status === STATUS_SUCCESS || status === STATUS_SKIPPED,
    status,
    timestamp: new Date().toISOString(),
    durationMs: Math.max(0, Date.now() - startedAt),
    tool: {
      name: TOOL_NAME,
      version: getToolVersion()
    },
    context: {
      repoRoot,
      git: getGitContext(repoRoot, env)
    },
    result,
    warnings,
    errors
  };
}

function executePushDetailed(repoRoot, version, settings, env, commandType, outputMode, warnings, errors) {
  const artifact = buildArtifact(version, settings);
  const requestedReferences = artifact.image.references;
  const pushedReferences = [];
  const failedReferences = [];
  let skipped = false;
  let skipReason = NULL_VALUE;

  if (!settings.pushEnabled) {
    skipped = true;
    skipReason = "push_disabled";

    if (outputMode === OUTPUT_MODE_HUMAN) {
      console.log("Push disabled");
    }
  } else if (!isBranchAllowed(settings.currentBranch, settings.pushBranches)) {
    skipped = true;

    if (!settings.currentBranch) {
      skipReason = "branch_unknown";

      if (outputMode === OUTPUT_MODE_HUMAN) {
        console.log("Push skipped: unable to determine current branch");
      }
    } else {
      skipReason = "branch_not_allowed";

      if (outputMode === OUTPUT_MODE_HUMAN) {
        console.log(
          `Push skipped: branch '${settings.currentBranch}' does not match [${settings.pushBranches.join(", ")}]`
        );
      }
    }
  } else {
    requestedReferences.forEach(reference => {
      const result = runCommand(DOCKER_CMD, [DOCKER_PUSH, reference], {
        cwd: repoRoot,
        env,
        outputMode
      });

      if (result.ok) {
        pushedReferences.push(reference);
        return;
      }

      failedReferences.push(reference);
      errors.push(createError(STATUS_ERROR_CODE_DOCKER_PUSH, `Failed to push ${reference}`, { reference }));
    });
  }

  let status = STATUS_SUCCESS;

  if (skipped) {
    status = STATUS_SKIPPED;
  } else if (failedReferences.length > 0 && pushedReferences.length > 0) {
    status = STATUS_PARTIAL;
  } else if (failedReferences.length > 0) {
    status = STATUS_FAILED;
  }

  if (!skipped) {
    const knownReferences = new Set([...pushedReferences, ...failedReferences]);
    const missingReferences = requestedReferences.filter(reference => !knownReferences.has(reference));

    if (missingReferences.length > 0) {
      status = STATUS_FAILED;
      errors.push(
        createError(STATUS_ERROR_CODE_DOCKER_PUSH, "Push results missing requested references", {
          missingReferences
        })
      );
    }
  }

  return {
    status,
    artifact,
    operation: {
      type: commandType,
      performed: !skipped,
      skipped,
      skipReason,
      push: {
        requestedReferences,
        pushedReferences,
        failedReferences
      },
      policy: {
        pushEnabled: settings.pushEnabled,
        branch: settings.currentBranch || NULL_VALUE,
        branchSource: settings.currentBranchSource || UNKNOWN_VALUE,
        inputBranch: settings.inputBranch || NULL_VALUE
      }
    },
    metadata: buildMetadata(settings)
  };
}

function executeJsonCommand(command, root, config, version, env) {
  const warnings = [];
  const errors = [];

  switch (command) {
    case CMD_VERSION: {
      return {
        status: STATUS_SUCCESS,
        result: buildVersionResult(version),
        warnings,
        errors
      };
    }

    case CMD_TAGS: {
      const docker = getDockerSettings(config, env, root);

      return {
        status: STATUS_SUCCESS,
        result: {
          artifact: buildArtifact(version, docker),
          latestIncluded: getTags(version, docker).includes("latest")
        },
        warnings,
        errors
      };
    }

    case CMD_BUILD: {
      const docker = getDockerSettings(config, env, root, { requireImageTarget: true });
      let removedReferences = [];

      withDockerAuth(root, env, docker, authEnv => {
        try {
          dockerBuild(root, version, docker, authEnv, OUTPUT_MODE_JSON);
        } finally {
          removedReferences = dockerCleanupLocalImages(root, version, docker, authEnv, OUTPUT_MODE_JSON);
        }
      });

      return {
        status: STATUS_SUCCESS,
        result: {
          artifact: buildArtifact(version, docker),
          operation: {
            type: CMD_BUILD,
            performed: true,
            cleanup: {
              enabled: docker.cleanupLocal,
              removedReferences
            }
          },
          metadata: buildMetadata(docker)
        },
        warnings,
        errors
      };
    }

    case CMD_PUSH:
    case CMD_SHIP: {
      const docker = getDockerSettings(config, env, root, { requireImageTarget: true });
      let pushResult;

      withDockerAuth(root, env, docker, authEnv => {
        pushResult = executePushDetailed(root, version, docker, authEnv, command, OUTPUT_MODE_JSON, warnings, errors);
      });

      return {
        status: pushResult.status,
        result: {
          artifact: pushResult.artifact,
          operation: pushResult.operation,
          metadata: pushResult.metadata
        },
        warnings,
        errors
      };
    }

    case CMD_ALL: {
      const docker = getDockerSettings(config, env, root, { requireImageTarget: true });
      const stepStartedAtBuild = Date.now();
      let buildStep;
      let pushStep;
      let removedReferences = [];

      withDockerAuth(root, env, docker, authEnv => {
        try {
          dockerBuild(root, version, docker, authEnv, OUTPUT_MODE_JSON);
          buildStep = {
            durationMs: Math.max(0, Date.now() - stepStartedAtBuild),
            artifact: buildArtifact(version, docker),
            operation: {
              type: CMD_BUILD,
              performed: true,
              cleanup: {
                enabled: docker.cleanupLocal,
                removedReferences: []
              }
            },
            metadata: buildMetadata(docker)
          };

          const stepStartedAtPush = Date.now();
          pushStep = executePushDetailed(root, version, docker, authEnv, CMD_PUSH, OUTPUT_MODE_JSON, warnings, errors);
          pushStep = {
            durationMs: Math.max(0, Date.now() - stepStartedAtPush),
            artifact: pushStep.artifact,
            operation: pushStep.operation,
            metadata: pushStep.metadata,
            status: pushStep.status
          };
        } finally {
          removedReferences = dockerCleanupLocalImages(root, version, docker, authEnv, OUTPUT_MODE_JSON);
        }
      });

      if (buildStep) {
        buildStep.operation.cleanup.removedReferences = removedReferences;
      }

      let status = STATUS_SUCCESS;

      if (pushStep && pushStep.status === STATUS_FAILED) {
        status = STATUS_FAILED;
      } else if (pushStep && pushStep.status === STATUS_PARTIAL) {
        status = STATUS_PARTIAL;
      }

      const topArtifact = pushStep && pushStep.operation && !pushStep.operation.skipped
        ? pushStep.artifact
        : buildStep.artifact;

      return {
        status,
        result: {
          artifact: topArtifact,
          steps: {
            build: {
              durationMs: buildStep.durationMs,
              artifact: buildStep.artifact,
              operation: buildStep.operation,
              metadata: buildStep.metadata
            },
            push: {
              durationMs: pushStep.durationMs,
              artifact: pushStep.artifact,
              operation: pushStep.operation,
              metadata: pushStep.metadata
            }
          }
        },
        warnings,
        errors
      };
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
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
  dock [COMMAND] [--json|--output json|--output human]

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
  dock build --json       # Emit machine-readable JSON envelope
  dock --output json all  # Build and push with JSON output
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
  DOCKER_CLEANUP_LOCAL        Remove locally built image tags after build/all (auto/true/false)
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
  const rawArgs = process.argv.slice(2);
  let parsed;

  try {
    parsed = parseCliArgs(rawArgs);
  } catch (err) {
    if (!hasJsonOutputFlag(rawArgs)) {
      throw err;
    }

    const startedAt = Date.now();
    const repoRoot = findRepoRoot(process.cwd());
    const errorMessage = err && err.message ? err.message : String(err);
    const envelope = createEnvelope(
      CMD_HELP,
      OUTPUT_MODE_JSON,
      STATUS_FAILED,
      startedAt,
      repoRoot,
      process.env,
      {},
      [],
      [createError(STATUS_ERROR_CODE_USAGE, errorMessage, {})]
    );

    console.log(JSON.stringify(envelope, null, 2));
    process.exitCode = EXIT_USAGE;
    return envelope;
  }

  const cmd = parsed.command;
  const outputMode = parsed.outputMode;
  const startedAt = Date.now();

  // Handle help flags/command early
  if (cmd === CMD_HELP || cmd === FLAG_HELP || cmd === FLAG_HELP_SHORT) {
    showHelp();
    return;
  }

  const root = findRepoRoot(process.cwd());

  const config = tryReadJson(path.join(root, BUILD_DIR, BUILD_CONFIG_FILE)) || getDefaultBuildConfig();


  loadDotEnv(root);

  const version = getVersion(root);

  if (outputMode === OUTPUT_MODE_JSON) {
    try {
      const executed = executeJsonCommand(cmd, root, config, version, process.env);
      const envelope = createEnvelope(
        cmd,
        OUTPUT_MODE_JSON,
        executed.status,
        startedAt,
        root,
        process.env,
        executed.result,
        executed.warnings,
        executed.errors
      );

      console.log(JSON.stringify(envelope, null, 2));
      process.exitCode = getStatusExitCode(executed.status);
      return envelope;
    } catch (err) {
      const errorMessage = err && err.message ? err.message : String(err);
      const usageError = /^Unknown command:|^Unknown option:|^Unexpected argument:|^--output requires|^Unsupported output mode:/.test(errorMessage);
      const envelope = createEnvelope(
        cmd,
        OUTPUT_MODE_JSON,
        STATUS_FAILED,
        startedAt,
        root,
        process.env,
        {},
        [],
        [
          createError(
            usageError ? STATUS_ERROR_CODE_USAGE : STATUS_ERROR_CODE_UNKNOWN,
            errorMessage,
            {}
          )
        ]
      );

      console.log(JSON.stringify(envelope, null, 2));
      process.exitCode = getStatusExitCode(STATUS_FAILED, usageError);
      return envelope;
    }
  }

  switch (cmd) {
    case CMD_BUILD: {
      const docker = getDockerSettings(config, process.env, root, { requireImageTarget: true });
      withDockerAuth(root, process.env, docker, authEnv => {
        try {
          dockerBuild(root, version, docker, authEnv, OUTPUT_MODE_HUMAN);
        } finally {
          dockerCleanupLocalImages(root, version, docker, authEnv, OUTPUT_MODE_HUMAN);
        }
      });
      break;
    }

    case CMD_PUSH:
    case CMD_SHIP: {
      const docker = getDockerSettings(config, process.env, root, { requireImageTarget: true });
      withDockerAuth(root, process.env, docker, authEnv => {
        dockerPush(root, version, docker, authEnv, OUTPUT_MODE_HUMAN);
      });
      break;
    }

    case CMD_ALL: {
      const docker = getDockerSettings(config, process.env, root, { requireImageTarget: true });
      withDockerAuth(root, process.env, docker, authEnv => {
        try {
          dockerBuild(root, version, docker, authEnv, OUTPUT_MODE_HUMAN);
          dockerPush(root, version, docker, authEnv, OUTPUT_MODE_HUMAN);
        } finally {
          dockerCleanupLocalImages(root, version, docker, authEnv, OUTPUT_MODE_HUMAN);
        }
      });
      break;
    }

    case CMD_VERSION:
      console.log(JSON.stringify(buildVersionResult(version), null, 2));
      break;

    case CMD_TAGS: {
      const docker = getDockerSettings(config, process.env, root);
      console.log(JSON.stringify(getTags(version, docker), null, 2));
      break;
    }

    default:
      console.error(`Unknown command: ${cmd}`);
      showHelp();
      process.exit(EXIT_USAGE);
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
