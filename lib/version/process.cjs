const cp = require("child_process");

const COMMAND_WHERE_WINDOWS = "where";
const COMMAND_WHERE_UNIX = "which";

function tryExec(command, args, options = {}) {
  try {
    const result = cp.spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      shell: false
    });

    return {
      ok: result.status === 0,
      status: result.status,
      stdout: (result.stdout || "").trim(),
      stderr: (result.stderr || "").trim(),
      error: result.error || null
    };
  } catch (error) {
    return {
      ok: false,
      status: -1,
      stdout: "",
      stderr: "",
      error
    };
  }
}

function execOrThrow(command, args, options = {}) {
  const result = tryExec(command, args, options);

  if (!result.ok) {
    throw new Error(result.stderr || result.error?.message || `${command} failed`);
  }

  return result.stdout;
}

function commandExists(command, options = {}) {
  const checker = process.platform === "win32"
    ? COMMAND_WHERE_WINDOWS
    : COMMAND_WHERE_UNIX;

  const result = tryExec(checker, [command], options);
  return result.ok && !!result.stdout;
}

module.exports = {
  commandExists,
  execOrThrow,
  tryExec
};
