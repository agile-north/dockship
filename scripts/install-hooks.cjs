const cp = require("child_process");
const path = require("path");

const GIT_COMMAND = "git";
const IS_INSIDE_WORK_TREE_ARGS = ["rev-parse", "--is-inside-work-tree"];
const SET_HOOKS_PATH_ARGS = ["config", "core.hooksPath", ".githooks"];
const DEFAULT_ENCODING = "utf8";
const EXPECTED_TRUE = "true";

function runGit(args) {
  return cp.spawnSync(GIT_COMMAND, args, {
    encoding: DEFAULT_ENCODING,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function isGitRepo() {
  const result = runGit(IS_INSIDE_WORK_TREE_ARGS);

  if (result.error || result.status !== 0) {
    return false;
  }

  return String(result.stdout || "").trim().toLowerCase() === EXPECTED_TRUE;
}

function installHooksPath() {
  const result = runGit(SET_HOOKS_PATH_ARGS);

  if (result.error || result.status !== 0) {
    const details = String(result.stderr || result.error?.message || "git config failed").trim();
    throw new Error(`Unable to configure Git hooks path: ${details}`);
  }
}

function main() {
  if (!isGitRepo()) {
    process.stdout.write("Skipping hook install: not inside a Git work tree.\n");
    return;
  }

  installHooksPath();
  process.stdout.write(`Configured Git hooks path to '${path.normalize(".githooks")}'.\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  }
}
