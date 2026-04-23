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
const CMD_STAGE = "stage";
const CMD_TARGET = "target";
const CMD_ALL = "all";
const CMD_VERSION = "version";
const CMD_TAGS = "tags";
const CMD_TAG = "tag";
const CMD_PLAN = "plan";
const CMD_HELP = "help";
const FLAG_HELP = "--help";
const FLAG_HELP_SHORT = "-h";
const FLAG_JSON = "--json";
const FLAG_OUTPUT = "--output";
const FLAG_OUTPUT_FILE = "--output-file";
const FLAG_JSON_FILE = "--json-file";
const FLAG_OUTPUT_JSON_FILE = "--output-json-file";

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
const BUILD_CONFIG_RELATIVE_PATH = `${BUILD_DIR}/${BUILD_CONFIG_FILE}`;

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
const ENV_DOCKER_BUILD_TARGET = "DOCKER_BUILD_TARGET";
const ENV_DOCKER_BUILD_OUTPUT = "DOCKER_BUILD_OUTPUT";
const ENV_DOCKER_RUNNER = "DOCKER_RUNNER";
const ENV_DOCKER_STAGES = "DOCKER_STAGES";
const ENV_DOCKER_LOGIN_USERNAME = "DOCKER_LOGIN_USERNAME";
const ENV_DOCKER_LOGIN_PASSWORD = "DOCKER_LOGIN_PASSWORD";
const ENV_DOCKER_LOGIN_REGISTRY = "DOCKER_LOGIN_REGISTRY";
const ENV_DOCKSHIP_STRICT_CONFIG = "DOCKSHIP_STRICT_CONFIG";
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
const DEFAULT_DOCKER_RUNNER = "build";
const TEMP_DOCKER_CONFIG_PREFIX = "dockship-docker-config-";
const EMPTY_STRING = "";
const GIT_HEAD = "HEAD";
const GIT_REFS_HEADS_PREFIX = "refs/heads/";
const GIT_REMOTES_ORIGIN_PREFIX = "origin/";

// Docker args
const DOCKER_CMD = "docker";
const DOCKER_BUILD = "build";
const DOCKER_BUILDX = "buildx";
const DOCKER_LOGIN = "login";
const DOCKER_PUSH = "push";
const DOCKER_TAG = "tag";
const DOCKER_IMAGE = "image";
const DOCKER_RM = "rm";
const DOCKER_FLAG_TAG = "-t";
const DOCKER_FLAG_FILE = "-f";
const DOCKER_FLAG_PLATFORM = "--platform";
const DOCKER_FLAG_BUILD_ARG = "--build-arg";
const DOCKER_FLAG_PROGRESS = "--progress";
const DOCKER_FLAG_USERNAME = "--username";
const DOCKER_FLAG_PASSWORD_STDIN = "--password-stdin";
const DOCKER_VERSION = "version";
const DOCKER_RUNNER_BUILD = "build";
const DOCKER_RUNNER_BUILDX = "buildx";
const DOCKER_RUNNER_AUTO = "auto";

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

// Tag policy
const TAG_KIND_FULL = "full";
const TAG_KIND_MAJOR = "major";
const TAG_KIND_MAJOR_MINOR = "majorMinor";
const TAG_KIND_LATEST = "latest";
const TAG_TRANSFORM_MODE_APPEND = "append";
const TAG_TRANSFORM_MODE_REPLACE = "replace";
const NON_PUBLIC_MODE_FULL_ONLY = "full-only";
const NON_PUBLIC_GUARDRAIL_SUFFIX = "-pre";
const BRANCH_CLASS_PUBLIC = "public";
const BRANCH_CLASS_NON_PUBLIC = "non-public";
const BRANCH_CLASS_NONE = "none";
const BUILD_TYPE_SOURCE_EXPLICIT = "config.explicit";
const BUILD_TYPE_SOURCE_BRANCH = "branch.classification";
const BUILD_TYPE_SOURCE_SUFFIX = "version.suffix";
const PATTERN_TYPE_WILDCARD = "wildcard";
const PATTERN_TYPE_REGEX = "regex";
const PATTERN_REGEX_PREFIX = "regex:";
const ALIAS_SANITIZE_NONE = "none";
const ALIAS_SANITIZE_BRANCH = "branch";
const ALIAS_SANITIZE_SANITIZED = "sanitized";
const ALIAS_RULE_SELECTION_MODE = "first-match-wins";
const DEFAULT_ALIAS_NON_PUBLIC_PREFIX = "";
const TEMPLATE_TOKEN_BRANCH = "$BRANCH";
const TEMPLATE_TOKEN_BRANCH_SANITIZED = "$BRANCH_SANITIZED";

const PUSH_SKIP_REASON_PUSH_DISABLED = "push_disabled";
const PUSH_SKIP_REASON_BRANCH_UNKNOWN = "branch_unknown";
const PUSH_SKIP_REASON_BRANCH_NOT_ALLOWED = "branch_not_allowed";
const PUSH_SKIP_REASON_NON_PUBLIC_DENIED = "non_public_denied";

const WARNING_PREFIX = "Warning:";
const STRICT_CONFIG_PARSE_ERROR_PREFIX = "Strict config mode enabled; failed to parse";
const STRICT_CONFIG_LEGACY_ERROR_PREFIX = "Strict config mode does not allow legacy config keys";

const LEGACY_CONFIG_KEYS = [
  { section: "docker", key: "dockerfile", replacement: "docker.file" },
  { section: "docker", key: "targetRegistry", replacement: "docker.target.registry" },
  { section: "docker", key: "targetRepository", replacement: "docker.target.repository" },
  { section: "docker", key: "loginRegistry", replacement: "docker.login.registry" },
  { section: "docker", key: "pushEnabled", replacement: "docker.push.enabled" },
  { section: "docker", key: "pushBranches", replacement: "docker.push.branches" },
  { section: "docker", key: "tagLatest", replacement: "docker.tags.latest" },
  { section: "git", key: "qaBranches", replacement: "git.nonPublicBranches" },
  { section: "git", key: "nextBranches", replacement: "git.nonPublicBranches" }
];

const OPERATION_TYPE_TAG = "tag";
const OPERATION_TYPE_PLAN = "plan";

function getDefaultBuildConfig() {
  return {
    strictConfig: false,
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
        branches: [],
        branchesShortcut: EMPTY_STRING,
        denyNonPublicPush: false
      },
      tags: {
        latest: false
      },
      tagPolicy: {
        public: [TAG_KIND_FULL, TAG_KIND_MAJOR_MINOR, TAG_KIND_MAJOR],
        nonPublic: [TAG_KIND_FULL, TAG_KIND_MAJOR_MINOR, TAG_KIND_MAJOR]
      },
      nonPublicMode: EMPTY_STRING,
      aliases: {
        branch: false,
        sanitizedBranch: false,
        sanitize: false,
        prefix: EMPTY_STRING,
        suffix: EMPTY_STRING,
        maxLength: 0,
        nonPublicPrefix: DEFAULT_ALIAS_NON_PUBLIC_PREFIX,
        rules: []
      },
      cleanup: {
        local: DEFAULT_CLEANUP_LOCAL_MODE
      },
      runner: DEFAULT_DOCKER_RUNNER,
      platform: EMPTY_STRING,
      buildTarget: EMPTY_STRING,
      buildOutput: EMPTY_STRING,
      buildArgs: {},
      build: {
        public: NULL_VALUE
      }
    },
    git: {
      publicBranches: [],
      publicBranchesShortcut: EMPTY_STRING,
      nonPublicBranches: [],
      nonPublicBranchesShortcut: EMPTY_STRING
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

function objectHasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function resolveStrictConfigMode(config, env) {
  const envStrict = getString(env && env[ENV_DOCKSHIP_STRICT_CONFIG]);

  if (envStrict) {
    return normalizeBool(envStrict, false);
  }

  return normalizeBool(config && config.strictConfig, false);
}

function loadBuildConfig(repoRoot, env = process.env) {
  const configPath = path.join(repoRoot, BUILD_DIR, BUILD_CONFIG_FILE);
  const defaultConfig = getDefaultBuildConfig();

  if (!fileExists(configPath)) {
    return {
      config: defaultConfig,
      warnings: [],
      strictConfigMode: resolveStrictConfigMode(defaultConfig, env)
    };
  }

  try {
    const parsed = JSON.parse(readText(configPath));

    return {
      config: parsed || defaultConfig,
      warnings: [],
      strictConfigMode: resolveStrictConfigMode(parsed, env)
    };
  } catch (err) {
    const errorMessage = err && err.message ? err.message : String(err);
    const strictConfigMode = resolveStrictConfigMode(null, env);

    if (strictConfigMode) {
      throw new Error(`${STRICT_CONFIG_PARSE_ERROR_PREFIX} ${BUILD_CONFIG_RELATIVE_PATH}. ${errorMessage}`);
    }

    return {
      config: defaultConfig,
      warnings: [
        `${WARNING_PREFIX} Failed to parse ${BUILD_CONFIG_RELATIVE_PATH}; using defaults. ${errorMessage}`
      ],
      strictConfigMode
    };
  }
}

function getLegacyConfigWarnings(config, strictConfigMode = false) {
  const warnings = [];
  const root = config && typeof config === "object" ? config : {};
  const legacyKeyNames = [];

  LEGACY_CONFIG_KEYS.forEach(entry => {
    const sectionValue = root[entry.section];

    if (!sectionValue || typeof sectionValue !== "object") {
      return;
    }

    if (objectHasOwn(sectionValue, entry.key)) {
      legacyKeyNames.push(`${entry.section}.${entry.key}`);
      warnings.push(
        `${WARNING_PREFIX} Legacy config key '${entry.section}.${entry.key}' is deprecated; use '${entry.replacement}' instead.`
      );
    }
  });

  if (strictConfigMode && legacyKeyNames.length > 0) {
    throw new Error(`${STRICT_CONFIG_LEGACY_ERROR_PREFIX}: ${legacyKeyNames.join(", ")}.`);
  }

  return warnings;
}

function mergePatternLists(...sources) {
  const values = [];

  sources.forEach(source => {
    getStringArray(source, []).forEach(value => pushUnique(values, value));
  });

  return values;
}

function emitWarnings(warnings) {
  const values = Array.isArray(warnings) ? warnings : [];

  values.forEach(message => {
    const text = getString(message);

    if (text) {
      console.error(text);
    }
  });
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

function normalizeDockerRunner(value, fallback = DEFAULT_DOCKER_RUNNER) {
  if (value === undefined || value === null || value === EMPTY_STRING) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (
    normalized === DOCKER_RUNNER_BUILD ||
    normalized === DOCKER_RUNNER_BUILDX ||
    normalized === DOCKER_RUNNER_AUTO
  ) {
    return normalized;
  }

  throw new Error(
    `Unsupported docker runner: ${value}. Supported values: ${DOCKER_RUNNER_BUILD}, ${DOCKER_RUNNER_BUILDX}, ${DOCKER_RUNNER_AUTO}`
  );
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

    if (token === FLAG_JSON || token === FLAG_OUTPUT_FILE || token === FLAG_JSON_FILE || token === FLAG_OUTPUT_JSON_FILE) {
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

    if (token.startsWith(`${FLAG_OUTPUT_JSON_FILE}=`)) {
      return true;
    }
  }

  return false;
}

function getOutputFileArg(argv) {
  const args = Array.isArray(argv) ? argv : [];

  for (let i = 0; i < args.length; i += 1) {
    const token = getString(args[i]);

    if (token === FLAG_OUTPUT_FILE || token === FLAG_JSON_FILE || token === FLAG_OUTPUT_JSON_FILE) {
      return getString(args[i + 1]);
    }

    if (token.startsWith(`${FLAG_OUTPUT_FILE}=`)) {
      return token.slice(`${FLAG_OUTPUT_FILE}=`.length);
    }

    if (token.startsWith(`${FLAG_JSON_FILE}=`)) {
      return token.slice(`${FLAG_JSON_FILE}=`.length);
    }

    if (token.startsWith(`${FLAG_OUTPUT_JSON_FILE}=`)) {
      return token.slice(`${FLAG_OUTPUT_JSON_FILE}=`.length);
    }
  }

  return EMPTY_STRING;
}

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  let command = EMPTY_STRING;
  let commandArg = EMPTY_STRING;
  let outputMode = OUTPUT_MODE_HUMAN;
  let outputFile = EMPTY_STRING;

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

    if (token === FLAG_OUTPUT_FILE || token === FLAG_JSON_FILE || token === FLAG_OUTPUT_JSON_FILE) {
      const nextValue = args[i + 1];

      if (!nextValue) {
        throw new Error(`${token} requires a file path`);
      }

      outputFile = nextValue;
      outputMode = OUTPUT_MODE_JSON;

      i += 1;
      continue;
    }

    if (token.startsWith(`${FLAG_OUTPUT_FILE}=`)) {
      outputFile = token.slice(`${FLAG_OUTPUT_FILE}=`.length);
      continue;
    }

    if (token.startsWith(`${FLAG_JSON_FILE}=`)) {
      outputFile = token.slice(`${FLAG_JSON_FILE}=`.length);
      continue;
    }

    if (token.startsWith(`${FLAG_OUTPUT_JSON_FILE}=`)) {
      outputFile = token.slice(`${FLAG_OUTPUT_JSON_FILE}=`.length);
      outputMode = OUTPUT_MODE_JSON;
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }

    if (!command) {
      command = token.toLowerCase();
      continue;
    }

    if (!commandArg) {
      commandArg = token.toLowerCase();
      continue;
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  return {
    command: command || CMD_BUILD,
    commandArg,
    outputMode,
    outputFile
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

function resolveBuildOutput(env, docker) {
  const envValue = getString(env[ENV_DOCKER_BUILD_OUTPUT]);

  if (envValue) {
    return splitCommandArgs(envValue);
  }

  const configValue = docker.buildOutput;

  if (Array.isArray(configValue)) {
    return configValue.flatMap(item => splitCommandArgs(String(item)));
  }

  if (typeof configValue === "string" && configValue.trim()) {
    return splitCommandArgs(configValue);
  }

  return [];
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
    const details = [result.stderr, result.stdout].filter(Boolean).join(" | ");
    throw new Error(`${command} failed${details ? `: ${details}` : ""}`);
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

  if (options.forwardStderr === true) {
    const stderr = getString(res.stderr);

    if (stderr) {
      process.stderr.write(stderr.endsWith("\n") ? stderr : `${stderr}\n`);
    }
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

  const output = execCapture(process.execPath, [scriptPath], {
    cwd: repoRoot,
    forwardStderr: true
  });

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

function normalizeRegexFlags(flags, caseInsensitive = false) {
  const input = getString(flags).toLowerCase();
  const entries = [];

  input.split(EMPTY_STRING).forEach(flag => {
    if (!flag || entries.includes(flag)) {
      return;
    }

    entries.push(flag);
  });

  if (caseInsensitive && !entries.includes("i")) {
    entries.push("i");
  }

  return entries.join(EMPTY_STRING);
}

function branchPatternToRegex(pattern, options = {}) {
  const flags = normalizeRegexFlags(EMPTY_STRING, options.caseInsensitive === true);
  return new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, ".*")}$`, flags);
}

function parseRegexPattern(rawPattern) {
  const source = getString(rawPattern);

  if (!source.toLowerCase().startsWith(PATTERN_REGEX_PREFIX)) {
    return null;
  }

  const body = source.slice(PATTERN_REGEX_PREFIX.length).trim();

  if (!body) {
    return null;
  }

  const literalMatch = body.match(/^\/(.*)\/([a-z]*)$/i);

  if (literalMatch) {
    return {
      pattern: literalMatch[1],
      flags: literalMatch[2] || EMPTY_STRING
    };
  }

  return {
    pattern: body,
    flags: EMPTY_STRING
  };
}

function getBranchPatternMatcher(pattern, options = {}) {
  const raw = getString(pattern);
  const caseInsensitive = options.caseInsensitive === true;
  const regexParts = parseRegexPattern(raw);

  if (regexParts) {
    try {
      return {
        type: PATTERN_TYPE_REGEX,
        raw,
        matcher: new RegExp(regexParts.pattern, normalizeRegexFlags(regexParts.flags, caseInsensitive)),
        valid: true
      };
    } catch {
      return {
        type: PATTERN_TYPE_REGEX,
        raw,
        matcher: null,
        valid: false
      };
    }
  }

  return {
    type: PATTERN_TYPE_WILDCARD,
    raw,
    matcher: branchPatternToRegex(raw, { caseInsensitive }),
    valid: true
  };
}

function getPatternMatcher(pattern, options = {}) {
  return getBranchPatternMatcher(pattern, options);
}

function matchPatternWithDetails(value, pattern, options = {}) {
  const entry = getPatternMatcher(pattern, options);
  const text = getString(value);

  if (!text || !entry.valid || !entry.matcher) {
    return {
      pattern: entry.raw,
      type: entry.type,
      valid: entry.valid,
      matched: false,
      captures: {
        values: [],
        $0: EMPTY_STRING
      }
    };
  }

  entry.matcher.lastIndex = 0;
  const match = entry.matcher.exec(text);

  return {
    pattern: entry.raw,
    type: entry.type,
    valid: entry.valid,
    matched: Boolean(match),
    captures: {
      values: match ? match.slice(1) : [],
      $0: match ? getString(match[0]) : EMPTY_STRING
    }
  };
}

function matchBranchPatternWithDetails(branch, pattern, options = {}) {
  return matchPatternWithDetails(branch, pattern, options);
}

function evaluateBranchPatterns(branch, patterns) {
  const branchName = getString(branch);
  const normalizedPatterns = getStringArray(patterns, []);
  const evaluations = normalizedPatterns.map(pattern => {
    const entry = getBranchPatternMatcher(pattern);
    const matched = Boolean(branchName) && entry.valid && entry.matcher.test(branchName);

    return {
      pattern: entry.raw,
      type: entry.type,
      valid: entry.valid,
      matched
    };
  });

  return {
    branch: branchName || NULL_VALUE,
    configured: normalizedPatterns.length > 0,
    matched: evaluations.some(item => item.matched),
    matchedPatterns: evaluations.filter(item => item.matched).map(item => item.pattern),
    invalidPatterns: evaluations.filter(item => !item.valid).map(item => item.pattern),
    evaluations
  };
}

function isBranchAllowed(branch, patterns) {
  const normalizedPatterns = getStringArray(patterns, []);

  if (!normalizedPatterns.length) {
    return true;
  }

  if (!getString(branch)) {
    return false;
  }

  return evaluateBranchPatterns(branch, normalizedPatterns).matched;
}

function pushUnique(values, value) {
  if (!value) {
    return;
  }

  if (!values.includes(value)) {
    values.push(value);
  }
}

function normalizePositiveInt(value, fallback = 0) {
  if (value === undefined || value === null || value === EMPTY_STRING) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function truncateDeterministic(value, maxLength) {
  const input = getString(value);

  if (!input) {
    return EMPTY_STRING;
  }

  if (!maxLength || maxLength < 1 || input.length <= maxLength) {
    return input;
  }

  return input.slice(0, maxLength);
}

function normalizeAliasSanitizeMode(value, fallback = ALIAS_SANITIZE_SANITIZED) {
  const mode = getString(value, fallback).toLowerCase();

  if ([ALIAS_SANITIZE_NONE, ALIAS_SANITIZE_BRANCH, ALIAS_SANITIZE_SANITIZED].includes(mode)) {
    return mode;
  }

  return fallback;
}

function applyAliasSanitize(value, mode) {
  const input = getString(value);

  if (!input) {
    return EMPTY_STRING;
  }

  if (mode === ALIAS_SANITIZE_NONE) {
    return input;
  }

  if (mode === ALIAS_SANITIZE_BRANCH) {
    return normalizeBranchAlias(input);
  }

  return normalizeBranchAlias(input, { lowercase: true });
}

function normalizeBranchAliasFragment(branch, options = {}) {
  const value = getString(branch);

  if (!value) {
    return EMPTY_STRING;
  }

  const lower = options.lowercase === true;
  let normalized = value;

  normalized = normalized
    .replace(/^refs[\\/]+heads[\\/]+/i, EMPTY_STRING)
    .replace(/^origin[\\/]+/i, EMPTY_STRING)
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-");

  if (lower) {
    normalized = normalized
      .replace(/[_.]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
  }

  return normalized;
}

function applyAliasSanitizeFragment(value, mode) {
  const input = getString(value);

  if (!input) {
    return EMPTY_STRING;
  }

  if (mode === ALIAS_SANITIZE_NONE) {
    return input;
  }

  if (mode === ALIAS_SANITIZE_BRANCH) {
    return normalizeBranchAliasFragment(input);
  }

  return normalizeBranchAliasFragment(input, { lowercase: true });
}

function expandAliasTemplate(template, branch, captures = []) {
  let expanded = getString(template);

  if (!expanded) {
    return EMPTY_STRING;
  }

  const branchRaw = getString(branch);
  const branchSanitized = normalizeBranchAlias(branchRaw, { lowercase: true });
  const captureValues = Array.isArray(captures)
    ? captures
    : (captures && Array.isArray(captures.values) ? captures.values : []);
  const matchedValue = getString(
    Array.isArray(captures)
      ? branchRaw
      : (captures && captures.$0 ? captures.$0 : branchRaw)
  );

  expanded = expanded
    .split(TEMPLATE_TOKEN_BRANCH_SANITIZED)
    .join(branchSanitized)
    .split(TEMPLATE_TOKEN_BRANCH)
    .join(branchRaw);

  expanded = expanded.split("$0").join(matchedValue);

  captureValues.forEach((capture, index) => {
    const token = `$${index + 1}`;
    expanded = expanded.split(token).join(getString(capture));
  });

  return expanded;
}

function matchBranchPatternWithDetails(branch, pattern, options = {}) {
  const entry = getBranchPatternMatcher(pattern, options);
  const branchValue = getString(branch);

  if (!branchValue || !entry.valid || !entry.matcher) {
    return {
      pattern: entry.raw,
      type: entry.type,
      valid: entry.valid,
      matched: false,
      captures: {
        values: [],
        $0: EMPTY_STRING
      }
    };
  }

  entry.matcher.lastIndex = 0;
  const match = entry.matcher.exec(branchValue);

  return {
    pattern: entry.raw,
    type: entry.type,
    valid: entry.valid,
    matched: Boolean(match),
    captures: {
      values: match ? match.slice(1) : [],
      $0: match ? getString(match[0]) : EMPTY_STRING
    }
  };
}

function normalizeAliasRule(rawRule, index) {
  if (!rawRule || typeof rawRule !== "object") {
    return null;
  }

  const rawMatch = rawRule.match;
  const matchBranch = getString(rawRule.matchBranch || (typeof rawMatch === "object" ? rawMatch.branch : rawMatch));
  const matchVersion = getString(rawRule.matchVersion || (typeof rawMatch === "object" ? rawMatch.version : EMPTY_STRING));

  if (!matchBranch && !matchVersion) {
    return null;
  }

  const staticAliases = getStringArray(rawRule.aliases, []);
  const singleAlias = getString(rawRule.alias);
  const aliases = singleAlias ? [singleAlias, ...staticAliases] : staticAliases;

  return {
    id: getString(rawRule.id, `rule-${index + 1}`),
    match: rawMatch,
    matchBranch,
    matchVersion,
    caseInsensitive: normalizeBool(rawRule.caseInsensitive, false),
    template: getString(rawRule.template),
    aliases,
    prefix: getString(rawRule.prefix),
    suffix: getString(rawRule.suffix),
    sanitize: rawRule.sanitize,
    maxLength: normalizePositiveInt(rawRule.maxLength, 0),
    nonPublicPrefix: getString(rawRule.nonPublicPrefix),
    tagPrefix: getString(rawRule.tagPrefix),
    tagSuffix: getString(rawRule.tagSuffix),
    tagMaxLength: normalizePositiveInt(rawRule.tagMaxLength, 0),
    tagNonPublicPrefix: getString(rawRule.tagNonPublicPrefix),
    tagMode: normalizeTagTransformMode(rawRule.tagMode, TAG_TRANSFORM_MODE_REPLACE)
  };
}

function normalizeAliasRules(rawRules) {
  if (!Array.isArray(rawRules)) {
    return [];
  }

  const normalized = [];

  rawRules.forEach((rule, index) => {
    const item = normalizeAliasRule(rule, index);

    if (item) {
      normalized.push(item);
    }
  });

  return normalized;
}

function applyAliasFormatting(baseAlias, options = {}) {
  const sanitizeMode = normalizeAliasSanitizeMode(options.sanitize, ALIAS_SANITIZE_SANITIZED);
  const prefix = getString(options.prefix);
  const suffix = getString(options.suffix);
  const maxLength = normalizePositiveInt(options.maxLength, 0);
  const nonPublicPrefix = getString(options.nonPublicPrefix);
  const applyNonPublicPrefix = options.applyNonPublicPrefix === true;

  let formatted = `${prefix}${getString(baseAlias)}${suffix}`;

  if (applyNonPublicPrefix && nonPublicPrefix) {
    formatted = `${nonPublicPrefix}${formatted}`;
  }

  if (!formatted) {
    return EMPTY_STRING;
  }

  formatted = applyAliasSanitize(formatted, sanitizeMode);

  return truncateDeterministic(formatted, maxLength);
}

function normalizeTagTransformMode(value, fallback = TAG_TRANSFORM_MODE_REPLACE) {
  const mode = getString(value, fallback).toLowerCase();

  if ([TAG_TRANSFORM_MODE_APPEND, TAG_TRANSFORM_MODE_REPLACE].includes(mode)) {
    return mode;
  }

  return fallback;
}

function applySemanticTagFormatting(baseTag, options = {}) {
  const sanitizeMode = normalizeAliasSanitizeMode(options.sanitize, ALIAS_SANITIZE_NONE);
  const tagMode = normalizeTagTransformMode(options.tagMode, TAG_TRANSFORM_MODE_REPLACE);
  let prefix = getString(options.prefix);
  let suffix = getString(options.suffix);
  const versionSuffix = getString(options.versionSuffix);
  const stripVersionSuffix = options.stripVersionSuffix === true;
  const maxLength = normalizePositiveInt(options.maxLength, 0);
  let nonPublicPrefix = getString(options.nonPublicPrefix);
  const applyNonPublicPrefix = options.applyNonPublicPrefix === true;
  let formatted = `${baseTag}`;

  if (stripVersionSuffix && tagMode === TAG_TRANSFORM_MODE_REPLACE && versionSuffix && formatted.endsWith(versionSuffix)) {
    formatted = formatted.slice(0, -versionSuffix.length);
  }

  if (sanitizeMode !== ALIAS_SANITIZE_NONE) {
    prefix = applyAliasSanitizeFragment(prefix, sanitizeMode);
    suffix = applyAliasSanitizeFragment(suffix, sanitizeMode);
    nonPublicPrefix = applyAliasSanitizeFragment(nonPublicPrefix, sanitizeMode);
  }

  if (tagMode === TAG_TRANSFORM_MODE_APPEND) {
    formatted = `${formatted}${prefix}${suffix}`;
  } else {
    formatted = `${prefix}${formatted}${suffix}`;
  }

  if (applyNonPublicPrefix && nonPublicPrefix) {
    formatted = `${nonPublicPrefix}${formatted}`;
  }

  if (!formatted) {
    return EMPTY_STRING;
  }

  return truncateDeterministic(formatted, maxLength);
}

function resolveAliasDefaultSanitizeMode(settings) {
  return settings.aliasSanitize ? ALIAS_SANITIZE_SANITIZED : ALIAS_SANITIZE_NONE;
}

function resolveAliasRuleSanitizeMode(rule, defaultSanitizeMode) {
  if (rule && typeof rule.sanitize === "boolean") {
    return rule.sanitize ? ALIAS_SANITIZE_SANITIZED : ALIAS_SANITIZE_NONE;
  }

  const ruleSanitize = getString(rule && rule.sanitize);

  if (ruleSanitize) {
    return normalizeAliasSanitizeMode(ruleSanitize, defaultSanitizeMode);
  }

  return defaultSanitizeMode;
}

function resolveAliasRuleTransformSanitizeMode(rule, defaultSanitizeMode) {
  if (rule && typeof rule.sanitize === "boolean") {
    return rule.sanitize ? ALIAS_SANITIZE_SANITIZED : ALIAS_SANITIZE_NONE;
  }

  const ruleSanitize = getString(rule && rule.sanitize);

  if (ruleSanitize) {
    return normalizeAliasSanitizeMode(ruleSanitize, defaultSanitizeMode);
  }

  return defaultSanitizeMode;
}

function getAliasPolicy(settings, buildType) {
  const isPublicBuild = buildType ? buildType.isPublic : true;
  const applyNonPublicPrefix = !isPublicBuild;

  return {
    emitBranchAlias: settings.aliasBranch,
    emitSanitizedBranchAlias: settings.aliasSanitizedBranch,
    defaultSanitizeMode: resolveAliasDefaultSanitizeMode(settings),
    globalFormatting: {
      prefix: settings.aliasPrefix,
      suffix: settings.aliasSuffix,
      maxLength: settings.aliasMaxLength,
      nonPublicPrefix: settings.aliasNonPublicPrefix,
      applyNonPublicPrefix
    },
    nonPublicPrefixApplied: applyNonPublicPrefix && Boolean(settings.aliasNonPublicPrefix)
  };
}

function computeRuleTagTransform(rule, aliasPolicy, branch, captures, sanitizeMode) {
  return {
    enabled: Boolean(
      getString(rule.tagPrefix) ||
      getString(rule.tagSuffix) ||
      rule.tagMaxLength > 0 ||
      getString(rule.tagNonPublicPrefix)
    ),
    prefix: expandAliasTemplate(getString(rule.tagPrefix), branch, captures),
    suffix: expandAliasTemplate(getString(rule.tagSuffix), branch, captures),
    maxLength: rule.tagMaxLength > 0 ? rule.tagMaxLength : aliasPolicy.globalFormatting.maxLength,
    nonPublicPrefix: expandAliasTemplate(
      getString(rule.tagNonPublicPrefix) || aliasPolicy.globalFormatting.nonPublicPrefix,
      branch,
      captures
    ),
    sanitizeMode,
    tagMode: normalizeTagTransformMode(rule.tagMode, TAG_TRANSFORM_MODE_REPLACE),
    stripVersionSuffix: Boolean(rule.matchVersion)
  };
}

function selectAliasRule(branch, version, rules, aliasPolicy) {
  const evaluations = [];
  let selectedRuleId = NULL_VALUE;

  for (const rule of rules) {
    const branchMatchResult = rule.matchBranch
      ? matchBranchPatternWithDetails(branch, rule.matchBranch, { caseInsensitive: rule.caseInsensitive })
      : {
        pattern: EMPTY_STRING,
        type: PATTERN_TYPE_WILDCARD,
        valid: true,
        matched: true,
        captures: { values: [], $0: EMPTY_STRING }
      };

    const versionMatchResult = rule.matchVersion
      ? matchPatternWithDetails(version, rule.matchVersion, { caseInsensitive: rule.caseInsensitive })
      : {
        pattern: EMPTY_STRING,
        type: PATTERN_TYPE_WILDCARD,
        valid: true,
        matched: true,
        captures: { values: [], $0: EMPTY_STRING }
      };

    const matchResult = {
      branch: branchMatchResult,
      version: versionMatchResult,
      captures: branchMatchResult.matched ? branchMatchResult.captures : versionMatchResult.captures,
      matched: branchMatchResult.matched && versionMatchResult.matched,
      valid: branchMatchResult.valid && versionMatchResult.valid
    };
    const sanitizeMode = resolveAliasRuleSanitizeMode(rule, aliasPolicy.defaultSanitizeMode);
    const transformSanitizeMode = resolveAliasRuleTransformSanitizeMode(rule, aliasPolicy.defaultSanitizeMode);
    const tagTransform = computeRuleTagTransform(rule, aliasPolicy, branch, matchResult.captures, transformSanitizeMode);

    if (matchResult.matched && selectedRuleId === NULL_VALUE) {
      selectedRuleId = rule.id;
    }

    evaluations.push({
      rule,
      matchResult,
      sanitizeMode,
      tagTransform,
      selected: false,
      baseCandidates: [],
      aliases: []
    });
  }

  const selected = evaluations.find(item => item.rule.id === selectedRuleId) || null;

  if (selected) {
    selected.selected = true;
  }

  return {
    selectedRuleId,
    selected,
    evaluations
  };
}

function computeAliasOutputsFromRuleSelection(selection, aliasPolicy, branch) {
  if (!selection || !selection.selected) {
    return {
      aliases: [],
      tagTransform: null
    };
  }

  const selected = selection.selected;
  const rule = selected.rule;
  const captures = selected.matchResult.captures;
  const baseCandidates = [];
  const aliases = [];

  if (rule.template) {
    pushUnique(baseCandidates, expandAliasTemplate(rule.template, branch, captures));
  }

  rule.aliases.forEach(value => pushUnique(baseCandidates, value));

  baseCandidates.forEach(candidate => {
    const formatted = applyAliasFormatting(candidate, {
      ...aliasPolicy.globalFormatting,
      prefix: `${getString(rule.prefix)}${aliasPolicy.globalFormatting.prefix}`,
      suffix: `${aliasPolicy.globalFormatting.suffix}${getString(rule.suffix)}`,
      maxLength: rule.maxLength > 0 ? rule.maxLength : aliasPolicy.globalFormatting.maxLength,
      nonPublicPrefix: getString(rule.nonPublicPrefix) || aliasPolicy.globalFormatting.nonPublicPrefix,
      sanitize: selected.sanitizeMode
    });
    pushUnique(aliases, formatted);
  });

  selected.baseCandidates = baseCandidates;
  selected.aliases = aliases;

  return {
    aliases,
    tagTransform: selected.tagTransform.enabled ? selected.tagTransform : null
  };
}

function getAliasComputation(version, settings, buildType) {
  const branch = getString(settings.currentBranch);
  const isPublicBuild = buildType ? buildType.isPublic : evaluateBuildType(version, settings).isPublic;
  const aliasPolicy = getAliasPolicy(settings, { isPublic: isPublicBuild });
  const aliases = [];
  let selectedTagTransform = null;

  if (aliasPolicy.emitBranchAlias) {
    const simpleAlias = applyAliasFormatting(normalizeBranchAlias(branch), {
      ...aliasPolicy.globalFormatting,
      sanitize: aliasPolicy.defaultSanitizeMode
    });
    pushUnique(aliases, simpleAlias);
  }

  if (aliasPolicy.emitSanitizedBranchAlias) {
    const simpleSanitizedAlias = applyAliasFormatting(normalizeBranchAlias(branch, { lowercase: true }), {
      ...aliasPolicy.globalFormatting,
      sanitize: ALIAS_SANITIZE_NONE
    });
    pushUnique(aliases, simpleSanitizedAlias);
  }

  const versionText = getString(version.semVer2) || `${getString(version.version)}${getString(version.suffix)}`;
  const ruleSelection = selectAliasRule(branch, versionText, settings.aliasRules, aliasPolicy);
  const emittedFromRuleSelection = computeAliasOutputsFromRuleSelection(ruleSelection, aliasPolicy, branch);
  selectedTagTransform = emittedFromRuleSelection.tagTransform || selectedTagTransform;
  emittedFromRuleSelection.aliases.forEach(aliasTag => pushUnique(aliases, aliasTag));

  const ruleTrace = ruleSelection.evaluations.map(item => {
    const useBranchMatch = Boolean(item.rule.matchBranch);
    const matchValue = useBranchMatch ? item.matchResult.branch.captures.$0 : item.matchResult.version.captures.$0;
    const matchType = useBranchMatch ? item.matchResult.branch.type : item.matchResult.version.type;

    return {
      id: item.rule.id,
      match: item.rule.match,
      caseInsensitive: item.rule.caseInsensitive,
      type: matchType,
      valid: item.matchResult.valid,
      matched: item.matchResult.matched,
      selected: item.selected,
      captures: item.matchResult.captures.values,
      matchValue,
      baseCandidates: item.baseCandidates,
      aliases: item.aliases,
      sanitizeMode: item.sanitizeMode,
      tagTransform: item.tagTransform
    };
  });

  return {
    enabled: settings.aliasPolicyEnabled,
    aliases,
    selectionMode: ALIAS_RULE_SELECTION_MODE,
    selectedRuleId: ruleSelection.selectedRuleId,
    tagTransform: selectedTagTransform,
    defaultSanitizeMode: aliasPolicy.defaultSanitizeMode,
    nonPublicPrefixApplied: aliasPolicy.nonPublicPrefixApplied,
    globalFormatting: {
      prefix: settings.aliasPrefix,
      suffix: settings.aliasSuffix,
      maxLength: settings.aliasMaxLength,
      nonPublicPrefix: settings.aliasNonPublicPrefix
    },
    rules: ruleTrace
  };
}

function normalizeTagPolicyKinds(value, fallback) {
  const rawKinds = getStringArray(value, fallback);
  const normalizedKinds = [];
  const supportedKinds = [TAG_KIND_FULL, TAG_KIND_MAJOR_MINOR, TAG_KIND_MAJOR, TAG_KIND_LATEST];

  rawKinds.forEach(kind => {
    const normalized = getString(kind);

    if (!supportedKinds.includes(normalized)) {
      return;
    }

    pushUnique(normalizedKinds, normalized);
  });

  if (normalizedKinds.length === 0) {
    return [TAG_KIND_FULL];
  }

  return normalizedKinds;
}

function normalizeBranchAlias(branch, options = {}) {
  const value = getString(branch);

  if (!value) {
    return EMPTY_STRING;
  }

  const lower = options.lowercase === true;
  let normalized = value;

  normalized = normalized
    .replace(/^refs[\\/]+heads[\\/]+/i, EMPTY_STRING)
    .replace(/^origin[\\/]+/i, EMPTY_STRING)
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, EMPTY_STRING)
    .replace(/-+/g, "-");

  if (lower) {
    normalized = normalized
      .replace(/[_.]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, EMPTY_STRING)
      .toLowerCase();
  }

  return normalized;
}

function classifyBranch(branch, gitConfig) {
  const branchName = getString(branch);

  if (!branchName) {
    return BRANCH_CLASS_NONE;
  }

  const publicBranches = getStringArray(gitConfig && gitConfig.publicBranches, []);
  const nonPublicBranches = getStringArray(gitConfig && gitConfig.nonPublicBranches, []);
  const legacyQaBranches = getStringArray(gitConfig && gitConfig.qaBranches, []);
  const legacyNextBranches = getStringArray(gitConfig && gitConfig.nextBranches, []);
  const combinedNonPublicBranches = [...nonPublicBranches, ...legacyQaBranches, ...legacyNextBranches];

  if (publicBranches.length > 0 && evaluateBranchPatterns(branchName, publicBranches).matched) {
    return BRANCH_CLASS_PUBLIC;
  }

  if (combinedNonPublicBranches.length > 0 && evaluateBranchPatterns(branchName, combinedNonPublicBranches).matched) {
    return BRANCH_CLASS_NON_PUBLIC;
  }

  return BRANCH_CLASS_NONE;
}

function getBooleanOrNull(value) {
  if (value === undefined || value === null || value === EMPTY_STRING) {
    return NULL_VALUE;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return NULL_VALUE;
}

function evaluateBuildType(version, settings) {
  const explicitPublic = getBooleanOrNull(settings.explicitPublicBuild);
  const hasSuffix = Boolean(getString(version.suffix));

  if (explicitPublic !== NULL_VALUE) {
    return {
      isPublic: explicitPublic,
      source: BUILD_TYPE_SOURCE_EXPLICIT,
      branchClass: settings.branchClass || BRANCH_CLASS_NONE,
      nonPublicGuardrailApplied: !explicitPublic && !hasSuffix
    };
  }

  if (settings.branchClass && settings.branchClass !== BRANCH_CLASS_NONE) {
    return {
      isPublic: settings.branchClass === BRANCH_CLASS_PUBLIC,
      source: BUILD_TYPE_SOURCE_BRANCH,
      branchClass: settings.branchClass,
      nonPublicGuardrailApplied: settings.branchClass === BRANCH_CLASS_NON_PUBLIC && !hasSuffix
    };
  }

  return {
    isPublic: !hasSuffix,
    source: BUILD_TYPE_SOURCE_SUFFIX,
    branchClass: settings.branchClass || BRANCH_CLASS_NONE,
    nonPublicGuardrailApplied: hasSuffix === false
  };
}

function evaluatePushPolicy(version, settings) {
  const buildType = evaluateBuildType(version, settings);
  const pushAllowedByBranch = isBranchAllowed(settings.currentBranch, settings.pushBranches);
  let eligible = settings.pushEnabled;
  let reason = NULL_VALUE;

  if (!settings.pushEnabled) {
    eligible = false;
    reason = PUSH_SKIP_REASON_PUSH_DISABLED;
  } else if (settings.denyNonPublicPush && !buildType.isPublic) {
    eligible = false;
    reason = PUSH_SKIP_REASON_NON_PUBLIC_DENIED;
  } else if (!pushAllowedByBranch) {
    eligible = false;
    reason = settings.currentBranch
      ? PUSH_SKIP_REASON_BRANCH_NOT_ALLOWED
      : PUSH_SKIP_REASON_BRANCH_UNKNOWN;
  }

  return {
    eligible,
    reason,
    buildType,
    pushAllowedByBranch
  };
}

function buildPolicySummary(version, settings, pushPolicy) {
  const tagComputation = getTagComputation(version, settings);
  const evaluatedPushPolicy = pushPolicy || evaluatePushPolicy(version, settings);

  return {
    buildType: tagComputation.buildType.isPublic ? BRANCH_CLASS_PUBLIC : BRANCH_CLASS_NON_PUBLIC,
    buildTypeSource: tagComputation.buildType.source,
    branchClass: tagComputation.buildType.branchClass,
    nonPublicGuardrailApplied: tagComputation.buildType.nonPublicGuardrailApplied,
    effectiveSuffix: tagComputation.effectiveSuffix,
    tagKinds: tagComputation.tagKinds,
    pushEnabled: settings.pushEnabled,
    denyNonPublicPush: settings.denyNonPublicPush,
    pushEligible: evaluatedPushPolicy.eligible,
    pushSkipReason: evaluatedPushPolicy.reason
  };
}

function getEffectiveSuffix(version, buildType) {
  const suffix = getString(version.suffix);

  if (suffix) {
    return suffix;
  }

  if (!buildType.isPublic) {
    return NON_PUBLIC_GUARDRAIL_SUFFIX;
  }

  return EMPTY_STRING;
}

function getTagKindsForBuildType(settings, buildType) {
  const selected = buildType.isPublic ? settings.tagPolicyPublic : settings.tagPolicyNonPublic;

  if (!buildType.isPublic && settings.nonPublicMode === NON_PUBLIC_MODE_FULL_ONLY) {
    return [TAG_KIND_FULL];
  }

  return selected;
}

function getTagComputation(version, settings) {
  const buildType = evaluateBuildType(version, settings);
  const effectiveSuffix = getEffectiveSuffix(version, buildType);
  const tagKinds = getTagKindsForBuildType(settings, buildType);
  const baseTags = [];

  if (tagKinds.includes(TAG_KIND_FULL)) {
    const fullTag = getString(version.version);
    const shouldPreserveSuffix = Boolean(getString(version.suffix)) && !fullTag.endsWith(effectiveSuffix);
    pushUnique(baseTags, shouldPreserveSuffix ? `${fullTag}${effectiveSuffix}` : fullTag);
  }

  if (tagKinds.includes(TAG_KIND_MAJOR) && version.major) {
    pushUnique(baseTags, `${version.major}${effectiveSuffix}`);
  }

  if (tagKinds.includes(TAG_KIND_MAJOR_MINOR) && version.major && version.minor) {
    pushUnique(baseTags, `${version.major}.${version.minor}${effectiveSuffix}`);
  }

  const aliasComputation = getAliasComputation(version, settings, buildType);
  const tags = [];

  const transform = aliasComputation.tagTransform;
  const hasTagTransform = transform && transform.enabled;

  baseTags.forEach(tag => {
    const transformed = hasTagTransform
      ? applySemanticTagFormatting(tag, {
        prefix: transform.prefix,
        suffix: transform.suffix,
        maxLength: transform.maxLength,
        nonPublicPrefix: transform.nonPublicPrefix,
        applyNonPublicPrefix: !buildType.isPublic,
        sanitize: transform.sanitizeMode || ALIAS_SANITIZE_NONE,
        tagMode: transform.tagMode,
        versionSuffix: getString(version.suffix),
        stripVersionSuffix: transform.stripVersionSuffix
      })
      : tag;

    pushUnique(tags, transformed);
  });

  if (settings.latest && (tagKinds.includes(TAG_KIND_LATEST) || buildType.isPublic)) {
    pushUnique(tags, "latest");
  }

  aliasComputation.aliases.forEach(aliasTag => pushUnique(tags, aliasTag));

  return {
    buildType,
    effectiveSuffix,
    tagKinds,
    tags,
    aliasComputation
  };
}

function getDockerSettings(config, env, repoRoot, options = {}) {
  const requireImageTarget = options.requireImageTarget === true;
  const docker = config.docker || {};
  const target = docker.target || {};
  const login = docker.login || {};
  const push = docker.push || {};
  const tags = docker.tags || {};
  const tagPolicy = docker.tagPolicy || {};
  const tagAliases = tags.aliases || {};
  const aliases = {
    ...tagAliases,
    ...(docker.aliases || {})
  };
  const cleanup = docker.cleanup || {};
  const git = config.git || {};
  const publicBranches = mergePatternLists(git.publicBranches, git.publicBranchesShortcut);
  const nonPublicBranches = mergePatternLists(git.nonPublicBranches, git.nonPublicBranchesShortcut);
  const legacyQaBranches = getStringArray(git.qaBranches, []);
  const legacyNextBranches = getStringArray(git.nextBranches, []);
  const combinedNonPublicBranches = [...nonPublicBranches, ...legacyQaBranches, ...legacyNextBranches];
  const classificationConfig = {
    ...git,
    publicBranches,
    nonPublicBranches,
    qaBranches: [],
    nextBranches: []
  };

  const registry = getString(env[ENV_DOCKER_REGISTRY], getNestedValue(target.registry, docker.targetRegistry));
  const repo = getString(env[ENV_DOCKER_REPOSITORY], getNestedValue(target.repository, docker.targetRepository));
  const branchInfo = getCurrentBranchInfo(repoRoot, env);
  const configuredPushBranches = mergePatternLists(
    getNestedValue(push.branches, docker.pushBranches),
    getNestedValue(push.branchesShortcut, docker.pushBranchesShortcut)
  );
  const pushBranches = getStringArray(env[ENV_DOCKER_PUSH_BRANCHES], configuredPushBranches);

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
    publicBranches,
    nonPublicBranches: combinedNonPublicBranches,
    currentBranch: branchInfo.branch,
    currentBranchSource: branchInfo.source,
    inputBranch: branchInfo.inputBranch,
    latest: normalizeBool(env[ENV_DOCKER_TAG_LATEST], getNestedValue(tags.latest, docker.tagLatest)),
    tagPolicyPublic: normalizeTagPolicyKinds(
      tagPolicy.public,
      [TAG_KIND_FULL, TAG_KIND_MAJOR_MINOR, TAG_KIND_MAJOR]
    ),
    tagPolicyNonPublic: normalizeTagPolicyKinds(
      tagPolicy.nonPublic,
      [TAG_KIND_FULL, TAG_KIND_MAJOR_MINOR, TAG_KIND_MAJOR]
    ),
    nonPublicMode: getString(docker.nonPublicMode).toLowerCase(),
    aliasBranch: normalizeBool(aliases.branch, false),
    aliasSanitizedBranch: normalizeBool(aliases.sanitizedBranch, false),
    aliasSanitize: normalizeBool(aliases.sanitize, false),
    aliasPrefix: getString(aliases.prefix),
    aliasSuffix: getString(aliases.suffix),
    aliasMaxLength: normalizePositiveInt(aliases.maxLength, 0),
    aliasNonPublicPrefix: getString(aliases.nonPublicPrefix, DEFAULT_ALIAS_NON_PUBLIC_PREFIX),
    aliasRules: normalizeAliasRules(aliases.rules),
    aliasPolicyEnabled: normalizeBool(aliases.branch, false)
      || normalizeBool(aliases.sanitizedBranch, false)
      || Boolean(getString(aliases.prefix))
      || Boolean(getString(aliases.suffix))
      || normalizePositiveInt(aliases.maxLength, 0) > 0
      || normalizeAliasRules(aliases.rules).length > 0,
    explicitPublicBuild: getNestedValue(getNestedValue(docker.publicBuild, docker.public), docker.build && docker.build.public),
    denyNonPublicPush: normalizeBool(push.denyNonPublicPush, false),
    branchClass: classifyBranch(branchInfo.branch, classificationConfig),
    cleanupLocal: resolveCleanupLocal(env, getNestedValue(cleanup.local, DEFAULT_CLEANUP_LOCAL_MODE)),
    runner: normalizeDockerRunner(env[ENV_DOCKER_RUNNER], normalizeDockerRunner(docker.runner, DEFAULT_DOCKER_RUNNER)),
    platform: getString(env[ENV_DOCKER_PLATFORM], docker.platform),
    buildTarget: getString(env[ENV_DOCKER_BUILD_TARGET], docker.buildTarget || ""),
    buildOutputFlags: resolveBuildOutput(env, docker),
    buildArgFlags: resolveBuildArgs(env, docker),
  };
}

function parseStageDefinitionsEnv(env) {
  const value = getString(env[ENV_DOCKER_STAGES]);

  if (!value) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    throw new Error(`${ENV_DOCKER_STAGES} must be valid JSON: ${err.message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${ENV_DOCKER_STAGES} must be a JSON object mapping stage names to configs`);
  }

  if (Array.isArray(parsed)) {
    // Optionally support array-of-stage objects with name field
    const stageMap = {};

    parsed.forEach(item => {
      if (item && typeof item === "object" && item.name) {
        stageMap[String(item.name).toLowerCase()] = item;
      }
    });

    return stageMap;
  }

  const result = {};

  Object.keys(parsed).forEach(k => {
    if (k) {
      result[k.toLowerCase()] = parsed[k];
    }
  });

  return result;
}

function getStageNames(config, env) {
  const envStages = parseStageDefinitionsEnv(env);

  if (envStages && Object.keys(envStages).length > 0) {
    return Object.keys(envStages);
  }

  const stages = config && config.docker && config.docker.stages;

  if (!stages) {
    return [];
  }

  if (Array.isArray(stages)) {
    return stages.map(stage => getString(stage)).filter(Boolean);
  }

  return Object.keys(stages).filter(Boolean);
}

function getStageDefinition(config, env, stageName) {
  if (!stageName) {
    return null;
  }

  const envStages = parseStageDefinitionsEnv(env);

  if (envStages) {
    const normalizedName = stageName.toLowerCase();

    if (envStages[normalizedName]) {
      return envStages[normalizedName];
    }

    const exactKey = Object.keys(envStages).find(k => k.toLowerCase() === normalizedName);
    if (exactKey) {
      return envStages[exactKey];
    }
  }

  if (!config || !config.docker || !config.docker.stages) {
    return null;
  }

  const stages = config.docker.stages;

  if (Array.isArray(stages)) {
    const match = stages.find(stage => stage && getString(stage.name).toLowerCase() === stageName.toLowerCase());
    return match || null;
  }

  if (stages[stageName]) {
    return stages[stageName];
  }

  const stageLower = stageName.toLowerCase();

  if (stages[stageLower]) {
    return stages[stageLower];
  }

  const key = Object.keys(stages).find(k => String(k).toLowerCase() === stageLower);

  return key ? stages[key] : null;
}

function resolveSettingsForStage(config, env, repoRoot, stageName) {
  const settings = getDockerSettings(config, env, repoRoot, { requireImageTarget: true });
  const stage = getStageDefinition(config, env, stageName);

  if (!stage) {
    throw new Error(`Undefined stage: ${stageName}`);
  }

  if (stage.target) {
    settings.buildTarget = getString(stage.target);
  }

  if (stage.buildTarget) {
    settings.buildTarget = getString(stage.buildTarget);
  }

  if (stage.output) {
    settings.buildOutputFlags = splitCommandArgs(stage.output);
  }

  if (stage.buildOutput) {
    settings.buildOutputFlags = splitCommandArgs(stage.buildOutput);
  }

  if (stage.runner) {
    settings.runner = normalizeDockerRunner(stage.runner, settings.runner);
  }

  return settings;
}

function runStage(repoRoot, version, config, env, stageName, outputMode, options = {}) {
  const settings = resolveSettingsForStage(config, env, repoRoot, stageName);
  const cleanup = options.cleanup !== false;
  let removedReferences = [];

  withDockerAuth(repoRoot, env, settings, authEnv => {
    try {
      dockerBuild(repoRoot, version, settings, authEnv, outputMode);
      if (cleanup && settings.cleanupLocal) {
        removedReferences = dockerCleanupLocalImages(repoRoot, version, settings, authEnv, outputMode);
      }
    } finally {
      if (!cleanup) {
        // If cleanup is disabled, do nothing here and leave images for potential push
      }
    }
  });

  return {
    status: STATUS_SUCCESS,
    result: {
      artifact: buildArtifact(version, settings),
      operation: {
        type: CMD_STAGE,
        stage: stageName,
        performed: true,
        cleanup: {
          enabled: cleanup && settings.cleanupLocal,
          removedReferences
        }
      },
      metadata: buildMetadata(settings)
    },
    warnings: [],
    errors: []
  };
}

function runStageAll(repoRoot, version, config, env, outputMode, options = {}) {
  const stageNames = getStageNames(config, env);
  const results = [];
  const cleanupStages = options.cleanupStages !== false;

  const shouldFallback = getString(config && config.docker && config.docker.stageFallback, "true").toLowerCase() !== "false";

  if (!stageNames.length) {
    const settings = getDockerSettings(config, env, repoRoot, { requireImageTarget: true });
    let removedReferences = [];

    withDockerAuth(repoRoot, env, settings, authEnv => {
      try {
        dockerBuild(repoRoot, version, settings, authEnv, outputMode);
      } finally {
        removedReferences = dockerCleanupLocalImages(repoRoot, version, settings, authEnv, outputMode);
      }
    });

    const result = {
      status: STATUS_SUCCESS,
      result: {
        artifact: buildArtifact(version, settings),
        steps: {
          build: {
            artifact: buildArtifact(version, settings),
            operation: {
              type: CMD_BUILD,
              performed: true,
              cleanup: {
                enabled: settings.cleanupLocal,
                removedReferences
              }
            },
            metadata: buildMetadata(settings)
          }
        }
      },
      warnings: [],
      errors: []
    };

    return result;
  }

  let overallStatus = STATUS_SUCCESS;
  let lastArtifact = null;

  stageNames.forEach(stageName => {
    const stageResult = runStage(repoRoot, version, config, env, stageName, outputMode, {
      cleanup: cleanupStages
    });
    results.push({ stage: stageName, result: stageResult.result });

    lastArtifact = stageResult.result.artifact;

    if (stageResult.status === STATUS_FAILED) {
      overallStatus = STATUS_FAILED;
    }
  });

  if (stageNames.length > 0 && overallStatus === STATUS_SUCCESS && shouldFallback) {
    const finalResult = runFallbackBuild(repoRoot, version, config, env, outputMode, { cleanup: cleanupStages });
    results.push({ stage: "final", result: finalResult.result });
    lastArtifact = finalResult.result.artifact;

    if (finalResult.status === STATUS_FAILED) {
      overallStatus = STATUS_FAILED;
    }
  }

  return {
    status: overallStatus,
    result: {
      artifact: lastArtifact,
      stages: results
    },
    warnings: [],
    errors: []
  };
}

function runFallbackBuild(repoRoot, version, config, env, outputMode, options = {}) {
  const cleanup = options.cleanup !== false;
  const settings = getDockerSettings(config, env, repoRoot, { requireImageTarget: true });
  let removedReferences = [];

  withDockerAuth(repoRoot, env, settings, authEnv => {
    try {
      dockerBuild(repoRoot, version, settings, authEnv, outputMode);
    } finally {
      if (cleanup && settings.cleanupLocal) {
        removedReferences = dockerCleanupLocalImages(repoRoot, version, settings, authEnv, outputMode);
      }
    }
  });

  return {
    status: STATUS_SUCCESS,
    result: {
      artifact: buildArtifact(version, settings),
      operation: {
        type: "stage-fallback",
        performed: true,
        cleanup: {
          enabled: settings.cleanupLocal,
          removedReferences
        }
      },
      metadata: buildMetadata(settings)
    },
    warnings: [],
    errors: []
  };
}

function getTags(version, settings) {
  return getTagComputation(version, settings).tags;
}

function dockerTagLocal(repoRoot, version, settings, env, outputMode = OUTPUT_MODE_HUMAN) {
  const artifact = buildArtifact(version, settings);
  const references = artifact.image.references;
  const sourceReference = references[0] || NULL_VALUE;

  if (!sourceReference) {
    throw new Error("Unable to compute source image reference for tagging");
  }

  const requestedReferences = references.slice(1);
  const taggedReferences = [];
  const failedReferences = [];

  requestedReferences.forEach(reference => {
    const result = runCommand(DOCKER_CMD, [DOCKER_TAG, sourceReference, reference], {
      cwd: repoRoot,
      env,
      outputMode
    });

    if (result.ok) {
      taggedReferences.push(reference);
      return;
    }

    failedReferences.push(reference);
  });

  let status = STATUS_SUCCESS;

  if (failedReferences.length > 0 && taggedReferences.length > 0) {
    status = STATUS_PARTIAL;
  } else if (failedReferences.length > 0) {
    status = STATUS_FAILED;
  }

  return {
    status,
    artifact,
    operation: {
      type: OPERATION_TYPE_TAG,
      performed: requestedReferences.length > 0,
      sourceReference,
      tag: {
        requestedReferences,
        taggedReferences,
        failedReferences
      }
    },
    metadata: buildMetadata(settings)
  };
}

function buildPlanResult(version, settings) {
  const artifact = buildArtifact(version, settings);
  const pushPolicy = evaluatePushPolicy(version, settings);
  const policy = buildPolicySummary(version, settings, pushPolicy);
  const buildType = evaluateBuildType(version, settings);
  const tagComputation = getTagComputation(version, settings);
  const publicBranchEvaluation = evaluateBranchPatterns(settings.currentBranch, settings.publicBranches || []);
  const nonPublicBranchEvaluation = evaluateBranchPatterns(settings.currentBranch, settings.nonPublicBranches || []);
  const pushBranchEvaluation = evaluateBranchPatterns(settings.currentBranch, settings.pushBranches || []);

  return {
    artifact,
    plan: {
      branch: settings.currentBranch || NULL_VALUE,
      branchSource: settings.currentBranchSource || UNKNOWN_VALUE,
      branchClass: policy.branchClass,
      buildType: policy.buildType,
      buildTypeSource: policy.buildTypeSource,
      nonPublicGuardrailApplied: policy.nonPublicGuardrailApplied,
      tagKinds: policy.tagKinds,
      push: {
        enabled: settings.pushEnabled,
        eligible: pushPolicy.eligible,
        reason: pushPolicy.reason,
        allowedBranches: settings.pushBranches
      },
      inputs: {
        version: {
          value: version.version,
          full: version.full,
          suffix: getString(version.suffix),
          hasSuffix: Boolean(getString(version.suffix))
        },
        explicitPublicBuild: settings.explicitPublicBuild,
        nonPublicMode: settings.nonPublicMode,
        aliases: {
          branch: settings.aliasBranch,
          sanitizedBranch: settings.aliasSanitizedBranch,
          sanitize: settings.aliasSanitize,
          prefix: settings.aliasPrefix,
          suffix: settings.aliasSuffix,
          maxLength: settings.aliasMaxLength,
          nonPublicPrefix: settings.aliasNonPublicPrefix,
          rulesConfigured: settings.aliasRules.length
        },
        tagPolicy: {
          public: settings.tagPolicyPublic,
          nonPublic: settings.tagPolicyNonPublic
        },
        pushPolicy: {
          enabled: settings.pushEnabled,
          denyNonPublicPush: settings.denyNonPublicPush,
          allowedBranches: settings.pushBranches
        }
      },
      tagComputation: {
        tags: tagComputation.tags,
        effectiveSuffix: tagComputation.effectiveSuffix,
        tagKinds: tagComputation.tagKinds,
        aliases: tagComputation.aliasComputation.aliases
      },
      aliasPolicy: {
        enabled: tagComputation.aliasComputation.enabled,
        selectionMode: tagComputation.aliasComputation.selectionMode,
        selectedRuleId: tagComputation.aliasComputation.selectedRuleId,
        nonPublicPrefixApplied: tagComputation.aliasComputation.nonPublicPrefixApplied,
        defaultSanitizeMode: tagComputation.aliasComputation.defaultSanitizeMode,
        globalFormatting: tagComputation.aliasComputation.globalFormatting,
        rules: tagComputation.aliasComputation.rules
      },
      branchMatching: {
        public: publicBranchEvaluation,
        nonPublic: nonPublicBranchEvaluation,
        pushAllowed: pushBranchEvaluation
      },
      decisionTrace: {
        buildTypeFrom: buildType.source,
        branchClassResolved: buildType.branchClass,
        guardrailApplied: buildType.nonPublicGuardrailApplied,
        pushEligible: pushPolicy.eligible,
        pushSkipReason: pushPolicy.reason
      }
    },
    metadata: buildMetadata(settings)
  };
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

function dockerBuildxAvailable(repoRoot, env) {
  const result = cp.spawnSync(DOCKER_CMD, [DOCKER_BUILDX, DOCKER_VERSION], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  });

  return result.status === 0;
}

function resolveDockerBuildRunner(repoRoot, settings, env) {
  const configuredRunner = settings.runner;

  if (configuredRunner !== DOCKER_RUNNER_AUTO) {
    return configuredRunner;
  }

  if (dockerBuildxAvailable(repoRoot, env)) {
    return DOCKER_RUNNER_BUILDX;
  }

  return DOCKER_RUNNER_BUILD;
}

function dockerBuild(repoRoot, version, settings, env, outputMode = OUTPUT_MODE_HUMAN) {
  const tags = getTags(version, settings);
  const resolvedRunner = resolveDockerBuildRunner(repoRoot, settings, env);
  settings.resolvedRunner = resolvedRunner;
  const buildRunnerArgs = resolvedRunner === DOCKER_RUNNER_BUILDX
    ? [DOCKER_BUILDX, DOCKER_BUILD]
    : [DOCKER_BUILD];

  const args = [
    ...buildRunnerArgs,
    DOCKER_FLAG_PROGRESS,
    DEFAULT_PROGRESS,
    DOCKER_FLAG_FILE,
    settings.file,
  ];

  if (settings.platform) {
    args.push(DOCKER_FLAG_PLATFORM, settings.platform);
  }

  if (settings.buildTarget) {
    args.push("--target", settings.buildTarget);
  }

  if (settings.buildOutputFlags && settings.buildOutputFlags.length) {
    args.push("--output", ...settings.buildOutputFlags);
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
  const pushPolicy = evaluatePushPolicy(version, settings);

  if (!pushPolicy.eligible) {
    if (pushPolicy.reason === PUSH_SKIP_REASON_PUSH_DISABLED) {
      console.log("Push disabled");
      return;
    }

    if (pushPolicy.reason === PUSH_SKIP_REASON_NON_PUBLIC_DENIED) {
      console.log("Push skipped: non-public pushes are denied by policy");
      return;
    }

    if (pushPolicy.reason === PUSH_SKIP_REASON_BRANCH_UNKNOWN) {
      console.log("Push skipped: unable to determine current branch");
      return;
    }

    if (pushPolicy.reason === PUSH_SKIP_REASON_BRANCH_NOT_ALLOWED) {
      console.log(
        `Push skipped: branch '${settings.currentBranch}' does not match [${settings.pushBranches.join(", ")}]`
      );
      return;
    }

    console.log("Push disabled");
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

    try {
      exec(DOCKER_CMD, [DOCKER_IMAGE, DOCKER_RM, reference], { cwd: repoRoot, env, outputMode });
      removed.push(reference);
    } catch (err) {
      const errMessage = err && err.message ? err.message : "";

      // Docker may already have cleaned the image for this tag; ignore missing-image errors.
      if (/No such image/i.test(errMessage) || /not found/i.test(errMessage)) {
        return;
      }

      // Preserve non-cleanup failures.
      throw err;
    }
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
  const runner = getString(settings.resolvedRunner || settings.runner, DEFAULT_DOCKER_RUNNER);

  return {
    platforms: platform ? [platform] : [],
    runner
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
  const pushPolicy = evaluatePushPolicy(version, settings);
  const policySummary = buildPolicySummary(version, settings, pushPolicy);
  let skipped = false;
  let skipReason = NULL_VALUE;

  if (!pushPolicy.eligible) {
    skipped = true;
    skipReason = pushPolicy.reason;

    if (outputMode === OUTPUT_MODE_HUMAN && skipReason === PUSH_SKIP_REASON_PUSH_DISABLED) {
      console.log("Push disabled");
    }

    if (outputMode === OUTPUT_MODE_HUMAN && skipReason === PUSH_SKIP_REASON_NON_PUBLIC_DENIED) {
      console.log("Push skipped: non-public pushes are denied by policy");
    }

    if (outputMode === OUTPUT_MODE_HUMAN && skipReason === PUSH_SKIP_REASON_BRANCH_UNKNOWN) {
      console.log("Push skipped: unable to determine current branch");
    }

    if (outputMode === OUTPUT_MODE_HUMAN && skipReason === PUSH_SKIP_REASON_BRANCH_NOT_ALLOWED) {
      console.log(
        `Push skipped: branch '${settings.currentBranch}' does not match [${settings.pushBranches.join(", ")}]`
      );
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
        denyNonPublicPush: settings.denyNonPublicPush,
        buildType: policySummary.buildType,
        buildTypeSource: policySummary.buildTypeSource,
        branchClass: policySummary.branchClass,
        nonPublicGuardrailApplied: policySummary.nonPublicGuardrailApplied,
        branch: settings.currentBranch || NULL_VALUE,
        branchSource: settings.currentBranchSource || UNKNOWN_VALUE,
        inputBranch: settings.inputBranch || NULL_VALUE,
        pushEligible: pushPolicy.eligible,
        pushSkipReason: pushPolicy.reason
      }
    },
    metadata: buildMetadata(settings)
  };
}

function executeJsonCommand(command, commandArg, root, config, version, env, commandOutputMode = OUTPUT_MODE_JSON) {
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

    case CMD_PLAN: {
      const docker = getDockerSettings(config, env, root);

      return {
        status: STATUS_SUCCESS,
        result: buildPlanResult(version, docker),
        warnings,
        errors
      };
    }

    case CMD_TAG: {
      const docker = getDockerSettings(config, env, root, { requireImageTarget: true });
      const tagResult = dockerTagLocal(root, version, docker, env, commandOutputMode);
      const policy = buildPolicySummary(version, docker);

      tagResult.operation.tag.failedReferences.forEach(reference => {
        errors.push(createError(STATUS_ERROR_CODE_DOCKER_BUILD, `Failed to tag ${reference}`, { reference }));
      });

      return {
        status: tagResult.status,
        result: {
          artifact: tagResult.artifact,
          operation: {
            ...tagResult.operation,
            policy
          },
          metadata: tagResult.metadata
        },
        warnings,
        errors
      };
    }

    case CMD_BUILD: {
      const docker = getDockerSettings(config, env, root, { requireImageTarget: true });
      const policy = buildPolicySummary(version, docker);
      let removedReferences = [];

      withDockerAuth(root, env, docker, authEnv => {
        try {
          dockerBuild(root, version, docker, authEnv, commandOutputMode);
        } finally {
          removedReferences = dockerCleanupLocalImages(root, version, docker, authEnv, commandOutputMode);
        }
      });

      return {
        status: STATUS_SUCCESS,
        result: {
          artifact: buildArtifact(version, docker),
          operation: {
            type: CMD_BUILD,
            performed: true,
            policy,
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

    case CMD_STAGE:
    case CMD_TARGET: {
      if (!commandArg) {
        throw new Error("stage/target command requires a stage name");
      }

      if (commandArg === CMD_ALL) {
        return runStageAll(root, version, config, env, commandOutputMode);
      }

      if (!getStageDefinition(config, env, commandArg)) {
        throw new Error(`Unknown stage: ${commandArg}`);
      }

      return runStage(root, version, config, env, commandArg, commandOutputMode);
    }

    case CMD_PUSH:
    case CMD_SHIP: {
      const docker = getDockerSettings(config, env, root, { requireImageTarget: true });
      let pushResult;

      withDockerAuth(root, env, docker, authEnv => {
        pushResult = executePushDetailed(root, version, docker, authEnv, command, commandOutputMode, warnings, errors);
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
      const policy = buildPolicySummary(version, docker);
      const stageNames = getStageNames(config, env);

      if (stageNames.length > 0) {
        const stageResult = runStageAll(root, version, config, env, commandOutputMode, { cleanupStages: false });
        let pushStep;

        withDockerAuth(root, env, docker, authEnv => {
          const stepStartedAtPush = Date.now();
          const p = executePushDetailed(root, version, docker, authEnv, CMD_PUSH, commandOutputMode, warnings, errors);
          pushStep = {
            durationMs: Math.max(0, Date.now() - stepStartedAtPush),
            artifact: p.artifact,
            operation: p.operation,
            metadata: p.metadata,
            status: p.status
          };

          if (docker.cleanupLocal) {
            dockerCleanupLocalImages(root, version, docker, authEnv, commandOutputMode);
          }
        });

        let status = stageResult.status;

        if (pushStep.status === STATUS_FAILED) {
          status = STATUS_FAILED;
        } else if (pushStep.status === STATUS_PARTIAL) {
          status = STATUS_PARTIAL;
        }

        const topArtifact = pushStep && !pushStep.operation.skipped ? pushStep.artifact : stageResult.result.artifact;

        return {
          status,
          result: {
            artifact: topArtifact,
            steps: {
              stages: stageResult.result.stages,
              push: pushStep
            }
          },
          warnings,
          errors
        };
      }

      // fallback path (no stages defined) continues existing behavior
      const stepStartedAtBuild = Date.now();
      let buildStep;
      let pushStep;
      let removedReferences = [];

      withDockerAuth(root, env, docker, authEnv => {
        try {
          dockerBuild(root, version, docker, authEnv, commandOutputMode);
          buildStep = {
            durationMs: Math.max(0, Date.now() - stepStartedAtBuild),
            artifact: buildArtifact(version, docker),
            operation: {
              type: CMD_BUILD,
              performed: true,
              policy,
              cleanup: {
                enabled: docker.cleanupLocal,
                removedReferences: []
              }
            },
            metadata: buildMetadata(docker)
          };

          const stepStartedAtPush = Date.now();
          const p = executePushDetailed(root, version, docker, authEnv, CMD_PUSH, commandOutputMode, warnings, errors);
          pushStep = {
            durationMs: Math.max(0, Date.now() - stepStartedAtPush),
            artifact: p.artifact,
            operation: p.operation,
            metadata: p.metadata,
            status: p.status
          };
        } finally {
          removedReferences = dockerCleanupLocalImages(root, version, docker, authEnv, commandOutputMode);
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
  tag            Tag local image using computed policy tags
  stage <name>   Build a named stage using docker --target + --output
  target <name>  Alias for stage command (Docker-compatible phrase)
  stage all      Run configured stages sequentially (definition in dockship.json)
  ship, push     Push existing image tags to registry
  all            Build image(s), then push them to registry
  plan           Show deterministic build/push plan without docker mutation
  version        Output resolved version information as JSON
  tags           Output computed Docker tags as JSON
  help, --help   Show this help menu

EXAMPLES:
  dock build              # Build image with automatic version detection
  dock tag                # Retag local image using computed tag policy
  dock stage validate     # Build Dockerfile stage named validate
  dock stage all          # Run all configured stages sequentially
  dock plan               # Preview branch-aware tags and push eligibility
  dock ship               # Push image to configured registry
  dock all                # Build and push in one command
  dock version            # Display resolved version info
  dock tags               # Show what tags will be applied
  dock build --json       # Emit machine-readable JSON envelope
  dock --json --output-file result.json  # Write JSON envelope to file (stdout remains clean)
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
  DOCKER_RUNNER               Docker runner: build, buildx, or auto (default: build)
  DOCKSHIP_STRICT_CONFIG      Fail fast on invalid/legacy config keys (true/false)
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

    const outputFile = getOutputFileArg(rawArgs);
    const envelopeText = JSON.stringify(envelope, null, 2);

    if (outputFile) {
      fs.writeFileSync(path.resolve(repoRoot, outputFile), `${envelopeText}\n`, "utf8");
    } else {
      console.log(envelopeText);
    }

    process.exitCode = EXIT_USAGE;
    return envelope;
  }

  const cmd = parsed.command;
  const outputMode = parsed.outputMode;
  const hasOutputFile = Boolean(parsed.outputFile);
  const startedAt = Date.now();
  const commandOutputMode = hasOutputFile ? OUTPUT_MODE_HUMAN : outputMode;

  // Handle help flags/command early
  if (cmd === CMD_HELP || cmd === FLAG_HELP || cmd === FLAG_HELP_SHORT) {
    showHelp();
    return;
  }

  const root = findRepoRoot(process.cwd());

  const loadedConfig = loadBuildConfig(root, process.env);
  const config = loadedConfig.config;
  const configWarnings = [...loadedConfig.warnings, ...getLegacyConfigWarnings(config, loadedConfig.strictConfigMode)];

  emitWarnings(configWarnings);


  loadDotEnv(root);

  const version = getVersion(root);

  if (outputMode === OUTPUT_MODE_JSON || hasOutputFile) {
    try {
      const executed = executeJsonCommand(cmd, parsed.commandArg, root, config, version, process.env, commandOutputMode);
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

      const envelopeText = JSON.stringify(envelope, null, 2);
      if (parsed.outputFile) {
        fs.writeFileSync(path.resolve(root, parsed.outputFile), `${envelopeText}\n`, "utf8");
      } else {
        console.log(envelopeText);
      }

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

      const envelopeText = JSON.stringify(envelope, null, 2);
      if (parsed.outputFile) {
        fs.writeFileSync(path.resolve(root, parsed.outputFile), `${envelopeText}\n`, "utf8");
      } else {
        console.log(envelopeText);
      }

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
      const stageNames = getStageNames(config, process.env);

      if (stageNames.length > 0) {
        const stageResult = runStageAll(root, version, config, process.env, OUTPUT_MODE_HUMAN, { cleanupStages: false });

        withDockerAuth(root, process.env, docker, authEnv => {
          try {
            dockerPush(root, version, docker, authEnv, OUTPUT_MODE_HUMAN);
          } finally {
            dockerCleanupLocalImages(root, version, docker, authEnv, OUTPUT_MODE_HUMAN);
          }
        });

        if (stageResult.status === STATUS_FAILED) {
          process.exitCode = EXIT_FAILED;
        }

        break;
      }

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

    case CMD_STAGE:
    case CMD_TARGET: {
      if (!parsed.commandArg) {
        throw new Error("stage/target command requires a stage name");
      }

      if (parsed.commandArg === CMD_ALL) {
        const stageResult = runStageAll(root, version, config, process.env, OUTPUT_MODE_HUMAN);

        if (stageResult.status === STATUS_FAILED) {
          process.exitCode = EXIT_FAILED;
        }

        break;
      }

      if (!getStageDefinition(config, process.env, parsed.commandArg)) {
        throw new Error(`Unknown stage: ${parsed.commandArg}`);
      }

      runStage(root, version, config, process.env, parsed.commandArg, OUTPUT_MODE_HUMAN);
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

    case CMD_PLAN: {
      const docker = getDockerSettings(config, process.env, root);
      const result = buildPlanResult(version, docker);
      const push = result.plan.push;

      console.log(`Branch: ${result.plan.branch || UNKNOWN_VALUE}`);
      console.log(`Public: ${String(result.plan.buildType === BRANCH_CLASS_PUBLIC)}`);
      console.log(`Version: ${version.version}`);
      console.log("Tags:");
      result.artifact.image.tags.forEach(tag => console.log(`  - ${tag}`));
      console.log(`Push: ${String(push.eligible)}`);

      if (!push.eligible && push.reason) {
        console.log(`Push reason: ${push.reason}`);
      }

      break;
    }

    case CMD_TAG: {
      const docker = getDockerSettings(config, process.env, root, { requireImageTarget: true });
      const tagResult = dockerTagLocal(root, version, docker, process.env, OUTPUT_MODE_HUMAN);

      if (tagResult.status === STATUS_FAILED || tagResult.status === STATUS_PARTIAL) {
        process.exitCode = EXIT_FAILED;
      }

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
