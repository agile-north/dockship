#!/usr/bin/env node

const fs = require("fs");
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

// Paths
const BUILD_DIR = ".dockship";
const BUILD_CONFIG_FILE = "dockship.json";
const VERSION_SCRIPT_PATH = ["lib", "version", "index.cjs"];

const ENV_FILE_NAME = ".env";

// Env vars
const ENV_DOCKER_REGISTRY = "DOCKER_TARGET_REGISTRY";
const ENV_DOCKER_REPOSITORY = "DOCKER_TARGET_REPOSITORY";
const ENV_DOCKER_PUSH_ENABLED = "DOCKER_PUSH_ENABLED";
const ENV_DOCKER_TAG_LATEST = "DOCKER_TAG_LATEST";
const ENV_DOCKER_CONTEXT = "DOCKER_CONTEXT";
const ENV_DOCKERFILE_PATH = "DOCKERFILE_PATH";
const ENV_DOCKER_PLATFORM = "DOCKER_PLATFORM";
const ENV_DOCKER_BUILD_ARGS = "DOCKER_BUILD_ARGS";

// Defaults
const DEFAULT_DOCKERFILE = "Dockerfile";
const DEFAULT_CONTEXT = ".";
const DEFAULT_PROGRESS = "plain";

// Docker args
const DOCKER_CMD = "docker";
const DOCKER_BUILD = "build";
const DOCKER_PUSH = "push";
const DOCKER_FLAG_TAG = "-t";
const DOCKER_FLAG_FILE = "-f";
const DOCKER_FLAG_PLATFORM = "--platform";
const DOCKER_FLAG_BUILD_ARG = "--build-arg";
const DOCKER_FLAG_PROGRESS = "--progress";


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

function exec(command, args, options = {}) {
  console.log([command, ...args].join(" "));
  const res = cp.spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
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

function getDockerSettings(config, env) {
  const docker = config.docker || {};

  const registry = getString(env[ENV_DOCKER_REGISTRY], docker.targetRegistry);
  const repo = getString(env[ENV_DOCKER_REPOSITORY], docker.targetRepository);

  if (!registry) throw new Error(`${ENV_DOCKER_REGISTRY} required`);
  if (!repo) throw new Error(`${ENV_DOCKER_REPOSITORY} required`);

  return {
    image: `${registry}/${repo}`,
    context: getString(env[ENV_DOCKER_CONTEXT], docker.context || DEFAULT_CONTEXT),
    dockerfile: getString(env[ENV_DOCKERFILE_PATH], docker.dockerfile || DEFAULT_DOCKERFILE),
    push: normalizeBool(env[ENV_DOCKER_PUSH_ENABLED], docker.pushEnabled),
    latest: normalizeBool(env[ENV_DOCKER_TAG_LATEST], docker.tagLatest),
    platform: getString(env[ENV_DOCKER_PLATFORM], docker.platform),
    buildArgs: getString(env[ENV_DOCKER_BUILD_ARGS]),
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

function dockerBuild(repoRoot, version, settings) {
  const tags = getTags(version, settings);

  const args = [
    DOCKER_BUILD,
    DOCKER_FLAG_PROGRESS,
    DEFAULT_PROGRESS,
    DOCKER_FLAG_FILE,
    settings.dockerfile,
  ];

  if (settings.platform) {
    args.push(DOCKER_FLAG_PLATFORM, settings.platform);
  }

  args.push(DOCKER_FLAG_BUILD_ARG, `APP_VERSION=${version.full}`);

  tags.forEach(t => {
    args.push(DOCKER_FLAG_TAG, `${settings.image}:${t}`);
  });

  args.push(settings.context);

  exec(DOCKER_CMD, args, { cwd: repoRoot });
}

function dockerPush(repoRoot, version, settings) {
  if (!settings.push) {
    console.log("Push disabled");
    return;
  }

  const tags = getTags(version, settings);

  tags.forEach(t => {
    exec(DOCKER_CMD, [DOCKER_PUSH, `${settings.image}:${t}`], { cwd: repoRoot });
  });
}

//
// =======================
// MAIN
// =======================
//

function main() {
  const cmd = (process.argv[2] || CMD_BUILD).toLowerCase();
  const root = findRepoRoot(process.cwd());

  const config = tryReadJson(path.join(root, BUILD_DIR, BUILD_CONFIG_FILE));
  if (!config) throw new Error("Missing .dockship/dockship.json");


  loadDotEnv(root);

  const version = getVersion(root);
  const docker = getDockerSettings(config, process.env);

  switch (cmd) {
    case CMD_BUILD:
      dockerBuild(root, version, docker);
      break;

    case CMD_PUSH:
    case CMD_SHIP:
      dockerPush(root, version, docker);
      break;

    case CMD_ALL:
      dockerBuild(root, version, docker);
      dockerPush(root, version, docker);
      break;

    case CMD_VERSION:
      console.log(JSON.stringify(version, null, 2));
      break;

    case CMD_TAGS:
      console.log(JSON.stringify(getTags(version, docker), null, 2));
      break;

    case CMD_HELP:
    default:
      console.log("Commands: build | ship (push) | all | version | tags | help");
      break;
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
