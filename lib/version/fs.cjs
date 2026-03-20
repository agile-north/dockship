const fs = require("fs");
const path = require("path");

const GIT_DIR_NAME = ".git";
const DEFAULT_REPO_ROOT_FALLBACK = ".";

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function ensureFileExists(filePath, message) {
  if (!fileExists(filePath)) {
    throw new Error(message || `File not found: ${filePath}`);
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function tryReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function resolvePath(rootPath, candidatePath) {
  if (!candidatePath) {
    return "";
  }

  return path.isAbsolute(candidatePath)
    ? path.normalize(candidatePath)
    : path.resolve(rootPath, candidatePath);
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function parsePathList(value) {
  if (!value || !String(value).trim()) {
    return [];
  }

  return String(value)
    .split(/[;,]/)
    .map(x => x.trim())
    .filter(Boolean);
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir || DEFAULT_REPO_ROOT_FALLBACK);

  while (true) {
    if (fileExists(path.join(current, GIT_DIR_NAME))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir || DEFAULT_REPO_ROOT_FALLBACK);
    }

    current = parent;
  }
}

function discoverFiles(rootPath, predicate, options = {}) {
  const ignoreDirs = new Set(options.ignoreDirs || [
    ".git",
    ".idea",
    ".vs",
    ".vscode",
    ".teamcity",
    "node_modules",
    "bin",
    "obj",
    "dist",
    "build",
    "out"
  ]);
  const maxFiles = Number(options.maxFiles || 10000);

  const queue = [rootPath];
  const results = [];
  let seenFiles = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    let entries;

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (ignoreDirs.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      seenFiles += 1;
      if (seenFiles > maxFiles) {
        return results;
      }

      if (predicate(fullPath, entry)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

module.exports = {
  discoverFiles,
  ensureFileExists,
  fileExists,
  findRepoRoot,
  isDirectory,
  parsePathList,
  readJson,
  readText,
  resolvePath,
  tryReadJson,
  unique
};
