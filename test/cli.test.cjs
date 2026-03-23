const assert = require("assert/strict");
const cp = require("child_process");
const fs = require("fs");
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
  "DOCKER_CLEANUP_LOCAL",
  "DOCKER_CONTEXT",
  "DOCKERFILE_PATH",
  "DOCKER_PLATFORM",
  "DOCKER_BUILD_ARGS",
  "DOCKER_RUNNER",
  "DOCKER_LOGIN_USERNAME",
  "DOCKER_LOGIN_PASSWORD",
  "DOCKER_LOGIN_REGISTRY",
  "DOCKER_AUTH_USERNAME",
  "DOCKER_AUTH_PASSWORD",
  "DOCKER_AUTH_REGISTRY",
  "DOCKER_CONFIG",
  "GITHUB_HEAD_REF",
  "GITHUB_REF_NAME",
  "BUILD_SOURCEBRANCHNAME",
  "BUILD_SOURCEBRANCH",
  "BRANCH_NAME",
  "CI_COMMIT_REF_NAME",
  "TEAMCITY_BUILD_BRANCH",
  "GIT_BRANCH",
  "CI",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "TF_BUILD",
  "BUILDKITE",
  "TEAMCITY_VERSION",
  "JENKINS_URL"
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
  const originalExitCode = process.exitCode;
  const stdout = [];
  const stderr = [];
  const dockerCommands = [];
  const dockerInvocations = [];

  delete require.cache[CLI_MODULE_PATH];

  cp.spawnSync = (spawnCommand, args, spawnOptions = {}) => {
    if (spawnCommand === "docker") {
      dockerCommands.push(args);
      dockerInvocations.push({
        args,
        cwd: spawnOptions.cwd,
        env: spawnOptions.env || process.env,
        input: spawnOptions.input
      });

      if (typeof options.dockerResultFactory === "function") {
        return options.dockerResultFactory(args, spawnOptions);
      }

      return {
        status: 0,
        stdout: "",
        stderr: ""
      };
    }

    return originalSpawnSync(spawnCommand, args, spawnOptions);
  };

  const commandArgs = Array.isArray(command) ? command : [command];
  process.argv = [process.execPath, CLI_PATH, ...commandArgs];
  process.chdir(repoRoot);
  process.exitCode = 0;

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

    const statusCode = process.exitCode || 0;

    return {
      status: statusCode,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
      dockerCommands,
      dockerInvocations
    };
  } catch (error) {
    return {
      status: 1,
      stdout: stdout.join("\n"),
      stderr: [stderr.join("\n"), error && error.message ? error.message : String(error)].filter(Boolean).join("\n"),
      dockerCommands,
      dockerInvocations
    };
  } finally {
    cp.spawnSync = originalSpawnSync;
    process.argv = originalArgv;
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;

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

test("version command supports --json envelope with patch/build compatibility", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const result = runNodeScript(CLI_PATH, ["version", "--json"], { cwd: repoRoot });

  assert.equal(result.status, 0, result.stderr || "Expected cli version --json command to succeed");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.schemaVersion, "1");
  assert.equal(payload.command, "version");
  assert.equal(payload.outputMode, "json");
  assert.equal(payload.success, true);
  assert.equal(payload.status, "success");
  assert.equal(payload.result.build, "3");
  assert.equal(payload.result.patch, "3");
  assert.equal(payload.result.components.patch, payload.result.patch);
});

test("tags command supports --output json envelope", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      tags: {
        latest: true
      }
    }
  });

  const result = runNodeScript(CLI_PATH, ["tags", "--output", "json"], { cwd: repoRoot });

  assert.equal(result.status, 0, result.stderr || "Expected cli tags --output json command to succeed");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.schemaVersion, "1");
  assert.equal(payload.command, "tags");
  assert.equal(payload.outputMode, "json");
  assert.equal(payload.success, true);
  assert.deepEqual(payload.result.artifact.image.tags, ["1.2.3", "1", "1.2", "latest"]);
  assert.equal(payload.result.latestIncluded, true);
});

test("push --json reports partial status when some refs fail", t => {
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

  const result = runCliMain(repoRoot, ["push", "--json"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget",
      DOCKER_PUSH_ENABLED: "true",
      GITHUB_REF_NAME: "main"
    },
    dockerResultFactory: args => {
      const target = args[1] || "";

      if (args[0] === "push" && target.endsWith(":1")) {
        return {
          status: 1,
          stdout: "",
          stderr: ""
        };
      }

      return {
        status: 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  assert.equal(result.status, 1, "Expected partial push to exit with code 1");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.command, "push");
  assert.equal(payload.status, "partial");
  assert.equal(payload.success, false);
  assert.ok(payload.result.operation.push.pushedReferences.length > 0);
  assert.ok(payload.result.operation.push.failedReferences.length > 0);
});

test("all --json exposes top-level artifact equal to push artifact when push performed", t => {
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

  const result = runCliMain(repoRoot, ["all", "--json"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget",
      DOCKER_PUSH_ENABLED: "true",
      GITHUB_REF_NAME: "main"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected all --json command to succeed");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.command, "all");
  assert.equal(payload.status, "success");
  assert.equal(payload.result.steps.push.operation.skipped, false);
  assert.deepEqual(payload.result.artifact, payload.result.steps.push.artifact);
});

test("json usage errors return USAGE_ERROR with exit code 2", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const result = runNodeScript(CLI_PATH, ["--json", "--output", "nope"], { cwd: repoRoot });

  assert.equal(result.status, 2, "Expected usage errors to return exit code 2 in json mode");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.outputMode, "json");
  assert.equal(payload.status, "failed");
  assert.equal(payload.success, false);
  assert.equal(payload.errors[0].code, "USAGE_ERROR");
});

test("push --json returns skipped when push is disabled", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const result = runCliMain(repoRoot, ["push", "--json"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget",
      DOCKER_PUSH_ENABLED: "false",
      GITHUB_REF_NAME: "main"
    }
  });

  assert.equal(result.status, 0, "Expected skipped push to exit with code 0");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.command, "push");
  assert.equal(payload.status, "skipped");
  assert.equal(payload.success, true);
  assert.equal(payload.result.operation.performed, false);
  assert.equal(payload.result.operation.skipped, true);
  assert.equal(payload.result.operation.skipReason, "push_disabled");
});

test("push --json returns skipped for disallowed branch", t => {
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
      }
    }
  });

  const result = runCliMain(repoRoot, ["push", "--json"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget",
      GITHUB_REF_NAME: "feature/demo"
    }
  });

  assert.equal(result.status, 0, "Expected skipped branch push to exit with code 0");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.status, "skipped");
  assert.equal(payload.result.operation.skipped, true);
  assert.equal(payload.result.operation.skipReason, "branch_not_allowed");
  assert.equal(payload.result.operation.policy.branch, "feature/demo");
});

test("ship --json uses operation type ship", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const result = runCliMain(repoRoot, ["ship", "--json"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget",
      DOCKER_PUSH_ENABLED: "true",
      GITHUB_REF_NAME: "main"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected ship --json command to succeed");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.command, "ship");
  assert.equal(payload.result.operation.type, "ship");
});

test("all --json with skipped push keeps success and uses build artifact as top artifact", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const result = runCliMain(repoRoot, ["all", "--json"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget",
      DOCKER_PUSH_ENABLED: "false",
      GITHUB_REF_NAME: "main"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected all --json command to succeed when push is skipped");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.status, "success");
  assert.equal(payload.result.steps.push.operation.skipped, true);
  assert.equal(payload.result.steps.push.operation.skipReason, "push_disabled");
  assert.deepEqual(payload.result.artifact, payload.result.steps.build.artifact);
});

test("build --json reports cleanup removed references when enabled", t => {
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
      cleanup: {
        local: true
      }
    }
  });

  const result = runCliMain(repoRoot, ["build", "--json"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected build --json command to succeed");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.result.operation.type, "build");
  assert.equal(payload.result.operation.cleanup.enabled, true);
  assert.ok(payload.result.operation.cleanup.removedReferences.length >= 3);
  assert.ok(payload.result.operation.cleanup.removedReferences.includes("ghcr.io/acme/widget:1.2.3"));
});

test("build --json cleanup ignores no such image errors on repeated removal", t => {
  const repoRoot = createTempRepo(t);

  writeJson(path.join(repoRoot, "package.json"), {
    name: SAMPLE_PACKAGE_NAME,
    version: "1.0.11.39659"
  });

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      tags: {
        latest: false
      },
      cleanup: {
        local: true
      }
    }
  });

  const result = runCliMain(repoRoot, ["build", "--json"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget"
    },
    dockerResultFactory: args => {
      if (args[0] === "image" && args[1] === "rm" && args[2] === "ghcr.io/acme/widget:1.0.11.39659") {
        return { status: 1, stdout: "", stderr: "Error response from daemon: No such image: ghcr.io/acme/widget:1.0.11.39659" };
      }

      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected build --json to succeed even if one cleanup tag is already gone");
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.status, "success");
  assert.equal(payload.result.operation.cleanup.enabled, true);
  assert.ok(payload.result.operation.cleanup.removedReferences.includes("ghcr.io/acme/widget:1"));
  assert.ok(payload.result.operation.cleanup.removedReferences.includes("ghcr.io/acme/widget:1.0"));
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
      buildTarget: "export-stage",
      buildOutput: "type=local,dest=./out",
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
    "--target",
    "export-stage",
    "--output",
    "type=local,dest=./out",
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

test("stage command executes configured stage target and output", t => {
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
      stages: {
        validate: {
          target: "validate",
          output: "type=local,dest=./stage-validate"
        }
      }
    }
  });

  const result = runCliMain(repoRoot, ["stage", "validate"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected stage command to succeed");
  assert.equal(result.dockerCommands[0][0], "build");
  assert.ok(result.dockerCommands[0].includes("--target"));
  assert.ok(result.dockerCommands[0].includes("validate"));
  assert.ok(result.dockerCommands[0].includes("--output"));

});

test("stage all runs configured stages sequentially", t => {
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
      stages: {
        validate: { target: "validate", output: "type=local,dest=./stage-validate" },
        test: { target: "test", output: "type=local,dest=./stage-test" }
      }
    }
  });

  const result = runCliMain(repoRoot, ["stage", "all"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected stage all to succeed");
  assert.equal(result.dockerCommands.length, 3);
  assert.equal(result.dockerCommands[0][result.dockerCommands[0].indexOf("--target") + 1], "validate");
  assert.equal(result.dockerCommands[1][result.dockerCommands[1].indexOf("--target") + 1], "test");
  assert.equal(result.dockerCommands[2].includes("--target"), false, "fallback final build should not include --target");
});

test("stage all with no stages configured falls back to one build", t => {
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
      }
    }
  });

  const result = runCliMain(repoRoot, ["stage", "all"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected stage all fallback to succeed");
  assert.equal(result.dockerCommands.length, 1);
});


test("stage all reads stage definitions from DOCKER_STAGES env", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const envStages = JSON.stringify({
    validate: { target: "validate", output: "type=local,dest=./stage-validate" },
    test: { target: "test", output: "type=local,dest=./stage-test" }
  });

  const result = runCliMain(repoRoot, ["stage", "all"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget",
      DOCKER_STAGES: envStages
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected stage all env-based stage config to succeed");
  assert.equal(result.dockerCommands.length, 3);
  assert.equal(result.dockerCommands[0][result.dockerCommands[0].indexOf("--target") + 1], "validate");
  assert.equal(result.dockerCommands[1][result.dockerCommands[1].indexOf("--target") + 1], "test");
  assert.equal(result.dockerCommands[2].includes("--target"), false, "fallback final build should not include target");
});


test("all --json with stages runs push before local cleanup", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      stages: {
        "test-results": {
          target: "validated",
          output: "type=local,dest=TestResults"
        }
      },
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      push: {
        branches: ["release/*", "deploy/*"]
      },
      cleanup: {
        local: true
      }
    }
  });

  const result = runCliMain(repoRoot, ["all", "--json"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget",
      DOCKER_PUSH_ENABLED: "true",
      GITHUB_REF_NAME: "release/1.0"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected all --json to succeed");

  const commands = result.dockerCommands.map(args => args.join(" "));
  const firstPushIndex = commands.findIndex(c => c.startsWith("push "));
  const firstRmIndex = commands.findIndex(c => c.startsWith("image rm "));

  assert.ok(firstPushIndex !== -1, "No push command executed");
  assert.ok(firstRmIndex !== -1, "No cleanup image rm command executed");
  assert.ok(firstPushIndex < firstRmIndex, "Cleanup should happen after push");
});


test("build command uses docker buildx when runner is configured", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      runner: "buildx"
    }
  });

  const result = runCliMain(repoRoot, "build");

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.deepEqual(result.dockerCommands[0], [
    "buildx",
    "build",
    "--progress",
    "plain",
    "-f",
    "Dockerfile",
    "--build-arg",
    "APP_VERSION=1.2.3",
    "-t",
    "ghcr.io/acme/widget:1.2.3",
    "-t",
    "ghcr.io/acme/widget:1",
    "-t",
    "ghcr.io/acme/widget:1.2",
    "."
  ]);
});

test("build command allows DOCKER_RUNNER env var to override config", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      runner: "buildx"
    }
  });

  const result = runCliMain(repoRoot, "build", {
    env: {
      DOCKER_RUNNER: "build"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.equal(result.dockerCommands[0][0], "build");
});

test("build command with auto runner prefers buildx when available", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      runner: "auto"
    }
  });

  const result = runCliMain(repoRoot, "build", {
    dockerResultFactory: args => {
      if (args[0] === "buildx" && args[1] === "version") {
        return {
          status: 0,
          stdout: "buildx 0.13.1",
          stderr: ""
        };
      }

      return {
        status: 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.deepEqual(result.dockerCommands[0], ["buildx", "version"]);
  assert.equal(result.dockerCommands[1][0], "buildx");
  assert.equal(result.dockerCommands[1][1], "build");
});

test("build command with auto runner falls back to build when buildx is unavailable", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      runner: "auto"
    }
  });

  const result = runCliMain(repoRoot, "build", {
    dockerResultFactory: args => {
      if (args[0] === "buildx" && args[1] === "version") {
        return {
          status: 1,
          stdout: "",
          stderr: "buildx not installed"
        };
      }

      return {
        status: 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.deepEqual(result.dockerCommands[0], ["buildx", "version"]);
  assert.equal(result.dockerCommands[1][0], "build");
});

test("build command fails for unsupported docker runner", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      runner: "kaniko"
    }
  });

  const result = runCliMain(repoRoot, "build");

  assert.equal(result.status, 1, "Expected unsupported runner to fail");
  assert.match(result.stderr, /Unsupported docker runner: kaniko/);
  assert.match(result.stderr, /Supported values: build, buildx, auto/);
});

test("build command removes local image tags when cleanup is enabled", t => {
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
      cleanup: {
        local: true
      }
    }
  });

  const result = runCliMain(repoRoot, "build");

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.deepEqual(result.dockerCommands, [
    [
      "build",
      "--progress",
      "plain",
      "-f",
      "Dockerfile",
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
    ],
    ["image", "rm", "ghcr.io/acme/widget:1.2.3"],
    ["image", "rm", "ghcr.io/acme/widget:1"],
    ["image", "rm", "ghcr.io/acme/widget:1.2"],
    ["image", "rm", "ghcr.io/acme/widget:latest"]
  ]);
});

test("build command allows DOCKER_CLEANUP_LOCAL env var to enable cleanup", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      }
    }
  });

  const result = runCliMain(repoRoot, "build", {
    env: {
      DOCKER_CLEANUP_LOCAL: "true"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.deepEqual(result.dockerCommands, [
    [
      "build",
      "--progress",
      "plain",
      "-f",
      "Dockerfile",
      "--build-arg",
      "APP_VERSION=1.2.3",
      "-t",
      "ghcr.io/acme/widget:1.2.3",
      "-t",
      "ghcr.io/acme/widget:1",
      "-t",
      "ghcr.io/acme/widget:1.2",
      "."
    ],
    ["image", "rm", "ghcr.io/acme/widget:1.2.3"],
    ["image", "rm", "ghcr.io/acme/widget:1"],
    ["image", "rm", "ghcr.io/acme/widget:1.2"]
  ]);
});

test("build command auto-cleans local image tags in CI by default", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      }
    }
  });

  const result = runCliMain(repoRoot, "build", {
    env: {
      CI: "true"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.deepEqual(result.dockerCommands, [
    [
      "build",
      "--progress",
      "plain",
      "-f",
      "Dockerfile",
      "--build-arg",
      "APP_VERSION=1.2.3",
      "-t",
      "ghcr.io/acme/widget:1.2.3",
      "-t",
      "ghcr.io/acme/widget:1",
      "-t",
      "ghcr.io/acme/widget:1.2",
      "."
    ],
    ["image", "rm", "ghcr.io/acme/widget:1.2.3"],
    ["image", "rm", "ghcr.io/acme/widget:1"],
    ["image", "rm", "ghcr.io/acme/widget:1.2"]
  ]);
});

test("build command allows DOCKER_CLEANUP_LOCAL=false to disable CI auto cleanup", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      }
    }
  });

  const result = runCliMain(repoRoot, "build", {
    env: {
      CI: "true",
      DOCKER_CLEANUP_LOCAL: "false"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.deepEqual(result.dockerCommands, [
    [
      "build",
      "--progress",
      "plain",
      "-f",
      "Dockerfile",
      "--build-arg",
      "APP_VERSION=1.2.3",
      "-t",
      "ghcr.io/acme/widget:1.2.3",
      "-t",
      "ghcr.io/acme/widget:1",
      "-t",
      "ghcr.io/acme/widget:1.2",
      "."
    ]
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

test("all command removes local image tags after push or push skip when cleanup is enabled", t => {
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
      cleanup: {
        local: true
      }
    }
  });

  const result = runCliMain(repoRoot, "all", {
    env: {
      GITHUB_REF_NAME: "feature/demo"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli all command to succeed");
  assert.match(result.stdout, /Push skipped: branch 'feature\/demo' does not match \[main\]/);
  assert.deepEqual(result.dockerCommands, [
    [
      "build",
      "--progress",
      "plain",
      "-f",
      "Dockerfile",
      "--build-arg",
      "APP_VERSION=1.2.3",
      "-t",
      "ghcr.io/acme/widget:1.2.3",
      "-t",
      "ghcr.io/acme/widget:1",
      "-t",
      "ghcr.io/acme/widget:1.2",
      "."
    ],
    ["image", "rm", "ghcr.io/acme/widget:1.2.3"],
    ["image", "rm", "ghcr.io/acme/widget:1"],
    ["image", "rm", "ghcr.io/acme/widget:1.2"]
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

test("build command uses isolated docker login when login env vars are provided", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      }
    }
  });

  const result = runCliMain(repoRoot, "build", {
    env: {
      DOCKER_LOGIN_USERNAME: "ci-user",
      DOCKER_LOGIN_PASSWORD: "secret-token"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.equal(result.dockerCommands.length, 2);
  assert.deepEqual(result.dockerCommands[0], ["login", "ghcr.io", "--username", "ci-user", "--password-stdin"]);
  assert.equal(result.dockerCommands[1][0], "build");
  assert.equal(result.dockerInvocations[0].input, "secret-token\n");
  assert.equal(result.dockerInvocations[0].env.DOCKER_CONFIG, result.dockerInvocations[1].env.DOCKER_CONFIG);
  assert.ok(result.dockerInvocations[0].env.DOCKER_CONFIG);
  assert.equal(fs.existsSync(result.dockerInvocations[0].env.DOCKER_CONFIG), false);
});

test("build command rejects partial docker login configuration", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      }
    }
  });

  const result = runCliMain(repoRoot, "build", {
    env: {
      DOCKER_LOGIN_USERNAME: "ci-user"
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DOCKER_LOGIN_USERNAME and DOCKER_LOGIN_PASSWORD must both be set/);
  assert.deepEqual(result.dockerCommands, []);
});

test("build command still supports legacy docker auth env vars", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      }
    }
  });

  const result = runCliMain(repoRoot, "build", {
    env: {
      DOCKER_AUTH_USERNAME: "ci-user",
      DOCKER_AUTH_PASSWORD: "secret-token"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.deepEqual(result.dockerCommands[0], ["login", "ghcr.io", "--username", "ci-user", "--password-stdin"]);
});

test("build command uses docker.login.registry from config as login default", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      login: {
        registry: "registry.internal.example"
      }
    }
  });

  const result = runCliMain(repoRoot, "build", {
    env: {
      DOCKER_LOGIN_USERNAME: "ci-user",
      DOCKER_LOGIN_PASSWORD: "secret-token"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected cli build command to succeed");
  assert.deepEqual(result.dockerCommands[0], ["login", "registry.internal.example", "--username", "ci-user", "--password-stdin"]);
});