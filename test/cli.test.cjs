const assert = require("assert/strict");
const cp = require("child_process");
const path = require("path");
const test = require("node:test");

const {
  createTempRepo,
  runNodeScript,
  writeJson,
  writeText
} = require("./helpers.cjs");

const CLI_PATH = path.resolve(__dirname, "..", "cli.cjs");
const CLI_MODULE_PATH = require.resolve("../cli.cjs");
const SAMPLE_PACKAGE_NAME = "sample-app";
const DEFAULT_VERSION = "1.2.3";
const CLI_ENV_KEYS = [
  "DOCKER_TARGET_REGISTRY",
  "DOCKER_TARGET_REPOSITORY",
  "DOCKER_PUSH_ENABLED",
  "DOCKER_PUSH_BRANCHES",
  "DOCKER_TAG_LATEST",
  "DOCKER_CONTEXT",
  "DOCKERFILE_PATH",
  "DOCKER_PLATFORM",
  "DOCKER_BUILD_ARGS",
  "GITHUB_HEAD_REF",
  "GITHUB_REF_NAME",
  "BUILD_SOURCEBRANCHNAME",
  "BUILD_SOURCEBRANCH",
  "BRANCH_NAME",
  "CI_COMMIT_REF_NAME",
  "TEAMCITY_BUILD_BRANCH",
  "GIT_BRANCH"
];

function seedNodeRepo(repoRoot, version = DEFAULT_VERSION) {
  writeJson(path.join(repoRoot, "package.json"), {
    name: SAMPLE_PACKAGE_NAME,
    version
  });
}

function runCliMain(repoRoot, command, options = {}) {
  const originalSpawnSync = cp.spawnSync;
  const originalArgv = process.argv.slice();
  const originalCwd = process.cwd();
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalEnv = { ...process.env };
  const stdout = [];
  const stderr = [];
  const dockerCommands = [];

  delete require.cache[CLI_MODULE_PATH];

  cp.spawnSync = (spawnCommand, args, spawnOptions = {}) => {
    if (spawnCommand === "docker") {
      dockerCommands.push(args);
      return {
        status: 0,
        stdout: "",
        stderr: ""
      };
    }

    return originalSpawnSync(spawnCommand, args, spawnOptions);
  };

  process.argv = [process.execPath, CLI_PATH, command];
  process.chdir(repoRoot);

  for (const key of CLI_ENV_KEYS) {
    delete process.env[key];
  }

  Object.assign(process.env, options.env || {});

  console.log = (...args) => {
    stdout.push(args.join(" "));
  };

  console.error = (...args) => {
    stderr.push(args.join(" "));
  };

  try {
    const cli = require("../cli.cjs");
    cli.main();

    return {
      status: 0,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
      dockerCommands
    };
  } catch (error) {
    return {
      status: 1,
      stdout: stdout.join("\n"),
      stderr: [stderr.join("\n"), error && error.message ? error.message : String(error)].filter(Boolean).join("\n"),
      dockerCommands
    };
  } finally {
    cp.spawnSync = originalSpawnSync;
    process.argv = originalArgv;
    process.chdir(originalCwd);

    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }

    Object.assign(process.env, originalEnv);
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    delete require.cache[CLI_MODULE_PATH];
  }
}

test("tags command returns version, major, major.minor, and latest", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      tags: {
        latest: true
      }
    }
  });

  const result = runNodeScript(CLI_PATH, ["tags"], { cwd: repoRoot });

  assert.equal(result.status, 0, result.stderr || "Expected cli tags command to succeed");
  assert.deepEqual(JSON.parse(result.stdout), ["1.2.3", "1", "1.2", "latest"]);
});

test("build command passes expected docker arguments", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      tags: {
        latest: true
      },
      platform: "linux/amd64",
      buildArgs: {
        SHOULD_NOT: "win"
      }
    }
  });

  const result = runCliMain(repoRoot, "build", {
    env: {
      DOCKER_BUILD_ARGS: JSON.stringify({ FROM_ENV: "yes" })
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.equal(result.dockerCommands.length, 1);
  assert.deepEqual(result.dockerCommands[0], [
    "build",
    "--progress",
    "plain",
    "-f",
    "Dockerfile",
    "--platform",
    "linux/amd64",
    "--build-arg",
    "FROM_ENV=yes",
    "--build-arg",
    "APP_VERSION=1.2.3",
    "-t",
    "ghcr.io/acme/widget:1.2.3",
    "-t",
    "ghcr.io/acme/widget:1",
    "-t",
    "ghcr.io/acme/widget:1.2",
    "-t",
    "ghcr.io/acme/widget:latest",
    "."
  ]);
});

test("push command skips docker pushes for disallowed branches", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      push: {
        enabled: true,
        branches: ["main"]
      },
      tags: {
        latest: true
      }
    }
  });

  const result = runCliMain(repoRoot, "push", {
    env: {
      GITHUB_REF_NAME: "feature/demo"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli push command to succeed");
  assert.match(result.stdout, /Push skipped: branch 'feature\/demo' does not match \[main\]/);
  assert.deepEqual(result.dockerCommands, []);
});

test("push command pushes all tags for allowed branches", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      push: {
        enabled: true,
        branches: ["main"]
      },
      tags: {
        latest: true
      }
    }
  });

  const result = runCliMain(repoRoot, "push", {
    env: {
      GITHUB_REF_NAME: "main"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli push command to succeed");
  assert.deepEqual(result.dockerCommands, [
    ["push", "ghcr.io/acme/widget:1.2.3"],
    ["push", "ghcr.io/acme/widget:1"],
    ["push", "ghcr.io/acme/widget:1.2"],
    ["push", "ghcr.io/acme/widget:latest"]
  ]);
});

test("build command loads docker settings from .env", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeText(path.join(repoRoot, ".env"), [
    "DOCKER_TARGET_REGISTRY=env.example.com",
    "DOCKER_TARGET_REPOSITORY=team/service",
    "DOCKER_TAG_LATEST=true"
  ].join("\n"));

  const result = runCliMain(repoRoot, "build");

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.equal(result.dockerCommands.length, 1);
  assert.ok(result.dockerCommands[0].includes("env.example.com/team/service:1.2.3"));
  assert.ok(result.dockerCommands[0].includes("env.example.com/team/service:latest"));
});