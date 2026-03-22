const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TEMP_PREFIX = "dockship-test-";
const GIT_DIR_NAME = ".git";
const DEFAULT_ENCODING = "utf8";
const NODE_COMMAND = process.execPath;
const WINDOWS_PLATFORM = "win32";
const WINDOWS_PATH_EXTENSIONS = ".CMD;.BAT;.EXE;.COM";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, DEFAULT_ENCODING);
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createTempRepo(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  ensureDir(path.join(repoRoot, GIT_DIR_NAME));
  t.after(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  return repoRoot;
}

function createFakeCommand(binDir, name, scriptSource) {
  ensureDir(binDir);

  const scriptPath = path.join(binDir, `${name}.js`);
  writeText(scriptPath, `${scriptSource.trim()}\n`);

  if (process.platform === WINDOWS_PLATFORM) {
    const wrapperPath = path.join(binDir, `${name}.cmd`);
    writeText(wrapperPath, `@echo off\r\n"${NODE_COMMAND}" "%~dp0\\${name}.js" %*\r\n`);
    return wrapperPath;
  }

  const wrapperPath = path.join(binDir, name);
  writeText(wrapperPath, `#!/usr/bin/env sh\n"${NODE_COMMAND}" "$(dirname "$0")/${name}.js" "$@"\n`);
  fs.chmodSync(wrapperPath, 0o755);
  return wrapperPath;
}

function createCommandEnv(binDir, overrides = {}) {
  const basePath = overrides.PATH || process.env.PATH || "";
  const pathext = overrides.PATHEXT || process.env.PATHEXT || WINDOWS_PATH_EXTENSIONS;

  return {
    ...process.env,
    ...overrides,
    PATH: `${binDir}${path.delimiter}${basePath}`,
    PATHEXT: process.platform === WINDOWS_PLATFORM ? WINDOWS_PATH_EXTENSIONS : pathext
  };
}

function runNodeScript(scriptPath, args, options = {}) {
  const result = cp.spawnSync(NODE_COMMAND, [scriptPath, ...(args || [])], {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    encoding: DEFAULT_ENCODING,
    stdio: ["ignore", "pipe", "pipe"]
  });

  return {
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    error: result.error || null
  };
}

module.exports = {
  createCommandEnv,
  createFakeCommand,
  createTempRepo,
  ensureDir,
  runNodeScript,
  writeJson,
  writeText
};