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
  "DOCKSHIP_STRICT_CONFIG",
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

test("tags command preserves prerelease suffixes for major and major.minor tags", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3-beta.1");

  const result = runNodeScript(CLI_PATH, ["tags"], { cwd: repoRoot });

  assert.equal(result.status, 0, result.stderr || "Expected cli tags command to succeed");
  assert.deepEqual(JSON.parse(result.stdout), ["1.2.3-beta.1", "1-beta.1", "1.2-beta.1"]);
});

test("tags command uses standard defaults when alias policy is not configured", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  const result = runNodeScript(CLI_PATH, ["tags"], { cwd: repoRoot });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  assert.deepEqual(JSON.parse(result.stdout), ["1.2.3", "1", "1.2"]);
});

test("tags command supports simple alias formatting controls", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        branch: true,
        prefix: "alias-",
        suffix: "-candidate",
        maxLength: 28,
        nonPublicPrefix: "np-"
      }
    },
    git: {
      nonPublicBranches: ["feature/*"]
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "feature/customer-west"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("np-alias-feature-customer-we"));
});

test("tags command applies first matching alias rule with regex captures", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "2.7.4");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        rules: [
          {
            id: "release-lane",
            match: "regex:^release\\/(\\d+)\\.(\\d+)$",
            template: "rel-$1-$2",
            sanitize: "sanitized"
          },
          {
            id: "fallback",
            match: "*",
            alias: "should-not-be-used"
          }
        ]
      }
    },
    git: {
      publicBranches: ["release/*"]
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "release/2.7"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("rel-2-7"));
  assert.ok(!tags.includes("should-not-be-used"));
});

test("tags command applies branch-based suffix to all semantic tags", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.1.323");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        rules: [
          {
            id: "release-qa",
            match: "release/current-qa",
            tagSuffix: "-qa"
          }
        ]
      }
    },
    git: {
      publicBranches: ["release/*"]
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "release/current-qa"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("1.1.323-qa"));
  assert.ok(tags.includes("1-qa"));
  assert.ok(tags.includes("1.1-qa"));
  assert.ok(!tags.includes("1.1.323"));
  assert.ok(!tags.includes("1"));
  assert.ok(!tags.includes("1.1"));
});

test("tags command expands regex capture tokens in semantic tag transforms", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "0.0.0.710");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        rules: [
          {
            id: "topic-label-suffix",
            match: "regex:^topic\/([^/]+)$",
            tagSuffix: "-$1"
          }
        ]
      },
      nonPublicMode: "full-only"
    },
    git: {
      nonPublicBranches: ["topic/*"]
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "topic/auth"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("0.0.0.710-auth"));
  assert.ok(!tags.includes("topic-auth"));
});

test("tags command sanitizes transform-only semantic tag suffix output", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        rules: [
          {
            id: "topic-suffix-sanitize",
            match: "topic/*",
            tagSuffix: "-$0",
            sanitize: true
          }
        ]
      }
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "topic/auth"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("1.2.3-topic-auth"));
  assert.ok(tags.includes("1-topic-auth"));
  assert.ok(tags.includes("1.2-topic-auth"));
  assert.ok(!tags.includes("1.2.3topic-auth"));
});

test("tags command preserves full version suffix when full version is separate from semver suffix", t => {
  const repoRoot = createTempRepo(t);

  writeText(path.join(repoRoot, "provider.js"), `module.exports = {
    resolveVersion() {
      return {
        source: "custom",
        version: "0.0.0.710",
        full: "0.0.0.710",
        major: "0",
        minor: "0",
        build: "710",
        suffix: "-g02c6befad2"
      };
    }
  };`);

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    version: {
      provider: "custom",
      custom: {
        providerPackage: "./provider.js"
      }
    },
    docker: {
      aliases: {
        rules: [
          {
            id: "topic-suffix-sanitize",
            match: "topic/*",
            tagSuffix: "-$0",
            sanitize: true
          }
        ]
      }
    },
    git: {
      nonPublicBranches: ["topic/*"]
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "topic/auth"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("0.0.0.710-g02c6befad2-topic-auth"));
  assert.ok(tags.includes("0-g02c6befad2-topic-auth"));
  assert.ok(tags.includes("0.0-g02c6befad2-topic-auth"));
});

test("tags command supports tagMode replace for semantic tag rewrite", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        rules: [
          {
            id: "topic-transform-replace",
            match: "topic/*",
            tagPrefix: "release-",
            tagSuffix: "-$0",
            tagMode: "replace",
            sanitize: true
          }
        ]
      }
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "topic/auth"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("release-1.2.3-topic-auth"));
  assert.ok(tags.includes("release-1-topic-auth"));
  assert.ok(tags.includes("release-1.2-topic-auth"));
  assert.ok(!tags.includes("1.2.3-release-topic-auth"));
  assert.ok(!tags.includes("1-release-topic-auth"));
  assert.ok(!tags.includes("1.2-release-topic-auth"));
});

test("tags command supports alias settings under docker.tags.aliases", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      tags: {
        aliases: {
          rules: [
            {
              id: "topic-suffix",
              match: "topic/*",
              tagSuffix: "-$0",
              sanitize: true
            }
          ]
        }
      }
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "topic/auth"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("1.2.3-topic-auth"));
  assert.ok(tags.includes("1-topic-auth"));
  assert.ok(tags.includes("1.2-topic-auth"));
});

test("tags command supports $0 token for wildcard rule templates", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        sanitize: true,
        rules: [
          {
            id: "topic-lane",
            match: "topic/*",
            template: "lane-$0"
          }
        ]
      }
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "topic/Auth_Branch"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("lane-topic-auth-branch"));
});

test("tags command allows boolean sanitize override per alias rule", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        sanitize: false,
        rules: [
          {
            id: "topic-lane",
            match: "topic/*",
            template: "lane-$0",
            sanitize: true
          }
        ]
      }
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "topic/Auth_Branch"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("lane-topic-auth-branch"));
  assert.ok(!tags.includes("lane-Topic-Auth_Branch"));
});

test("tags command supports case-insensitive wildcard alias rules", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        rules: [
          {
            id: "topic-lane",
            match: "Topic/*",
            caseInsensitive: true,
            template: "lane-$0",
            sanitize: true
          }
        ]
      }
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "topic/Auth_Branch"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("lane-topic-auth-branch"));
});

test("tags command supports case-insensitive regex alias rules", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        rules: [
          {
            id: "release-lane",
            match: "regex:^RELEASE\\/(.+)$",
            caseInsensitive: true,
            template: "lane-$1",
            sanitize: true
          }
        ]
      }
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "release/Candidate"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("lane-candidate"));
});

test("plan --json reports branch-aware non-public classification and guardrail tags", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      push: {
        enabled: true,
        branches: ["release/*"]
      }
    },
    git: {
      nonPublicBranches: ["feature/*"]
    }
  });

  const result = runCliMain(repoRoot, ["plan", "--json"], {
    env: {
      GITHUB_REF_NAME: "feature/demo"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected plan --json command to succeed");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.command, "plan");
  assert.equal(payload.status, "success");
  assert.equal(payload.result.plan.branchClass, "non-public");
  assert.equal(payload.result.plan.buildType, "non-public");
  assert.equal(payload.result.plan.buildTypeSource, "branch.classification");
  assert.equal(payload.result.plan.nonPublicGuardrailApplied, true);
  assert.ok(payload.result.artifact.image.tags.includes("1-pre"));
  assert.ok(payload.result.artifact.image.tags.includes("1.2-pre"));
  assert.equal(payload.result.plan.push.eligible, false);
  assert.equal(payload.result.plan.push.reason, "branch_not_allowed");
  assert.equal(payload.result.plan.inputs.version.hasSuffix, false);
  assert.equal(payload.result.plan.inputs.pushPolicy.enabled, true);
  assert.equal(payload.result.plan.inputs.aliases.branch, false);
  assert.ok(Array.isArray(payload.result.plan.tagComputation.tags));
  assert.equal(payload.result.plan.branchMatching.nonPublic.matched, true);
  assert.ok(payload.result.plan.branchMatching.nonPublic.matchedPatterns.includes("feature/*"));
  assert.equal(payload.result.plan.branchMatching.pushAllowed.matched, false);
  assert.equal(payload.result.plan.decisionTrace.pushSkipReason, "branch_not_allowed");
  assert.equal(payload.result.plan.aliasPolicy.selectionMode, "first-match-wins");
  assert.ok(Array.isArray(payload.result.plan.aliasPolicy.rules));
});

test("plan --json emits full alias rule trace including non-matches", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "3.1.0");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        nonPublicPrefix: "np-",
        rules: [
          {
            id: "release-rule",
            match: "release/*",
            template: "rel-$BRANCH_SANITIZED"
          },
          {
            id: "feature-rule",
            match: "feature/*",
            template: "feat-$BRANCH_SANITIZED"
          }
        ]
      }
    },
    git: {
      nonPublicBranches: ["feature/*"]
    }
  });

  const result = runCliMain(repoRoot, ["plan", "--json"], {
    env: {
      GITHUB_REF_NAME: "feature/new-api"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected plan command to succeed");
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.result.plan.aliasPolicy.selectedRuleId, "feature-rule");
  assert.equal(payload.result.plan.aliasPolicy.rules.length, 2);
  assert.equal(payload.result.plan.aliasPolicy.rules[0].matched, false);
  assert.equal(payload.result.plan.aliasPolicy.rules[1].matched, true);
  assert.ok(payload.result.plan.tagComputation.aliases.includes("np-feat-feature-new-api"));
});

test("branch pattern matching supports regex for classification and push rules", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "2.5.1");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      push: {
        enabled: true,
        branches: ["regex:^release\\/\\d+\\.\\d+$"]
      }
    },
    git: {
      publicBranches: ["regex:^release\\/\\d+\\.\\d+$"]
    }
  });

  const result = runCliMain(repoRoot, ["plan", "--json"], {
    env: {
      GITHUB_REF_NAME: "release/2.5"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected plan --json command to succeed");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.result.plan.branchClass, "public");
  assert.equal(payload.result.plan.buildType, "public");
  assert.equal(payload.result.plan.push.eligible, true);
  assert.equal(payload.result.plan.branchMatching.public.matched, true);
  assert.ok(payload.result.plan.branchMatching.public.matchedPatterns.includes("regex:^release\\/\\d+\\.\\d+$"));
  assert.equal(payload.result.plan.branchMatching.pushAllowed.matched, true);
});

test("push --json skips when denyNonPublicPush is true for non-public branch classification", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      target: {
        registry: "ghcr.io",
        repository: "acme/widget"
      },
      push: {
        enabled: true,
        denyNonPublicPush: true,
        branches: ["feature/*"]
      }
    },
    git: {
      nonPublicBranches: ["feature/*"]
    }
  });

  const result = runCliMain(repoRoot, ["push", "--json"], {
    env: {
      GITHUB_REF_NAME: "feature/demo"
    }
  });

  assert.equal(result.status, 0, "Expected skipped push to exit with code 0");

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.status, "skipped");
  assert.equal(payload.result.operation.skipped, true);
  assert.equal(payload.result.operation.skipReason, "non_public_denied");
  assert.equal(payload.result.operation.policy.buildType, "non-public");
  assert.equal(payload.result.operation.policy.denyNonPublicPush, true);
});

test("tags command includes branch aliases when configured", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        branch: true,
        sanitizedBranch: true
      }
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "Feature/demo_branch"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");

  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("Feature-demo_branch"));
  assert.ok(tags.includes("feature-demo-branch"));
});

test("tags command sanitizes branch aliases when alias.sanitize is true", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        branch: true,
        sanitize: true
      }
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "Feature/Auth_Branch"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("feature-auth-branch"));
  assert.ok(!tags.includes("Feature-Auth_Branch"));
});

test("tags command sanitizes the full alias value after prefix/suffix when alias rule sanitize is true", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        rules: [
          {
            id: "topic-lane",
            match: "topic/*",
            template: "lane-$0",
            prefix: "X-",
            suffix: "-Y",
            sanitize: true
          }
        ]
      }
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "topic/Auth_Branch"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("x-lane-topic-auth-branch-y"));
  assert.ok(!tags.includes("X-lane-topic/Auth_Branch-Y"));
  assert.ok(!tags.includes("x-lane-topic/Auth_Branch-y"));
});

test("tags command sanitizes semantic tag transforms when rule sanitize is true", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "0.0.0.710");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      aliases: {
        rules: [
          {
            id: "topic-label-suffix",
            match: "*",
            sanitize: true,
            tagSuffix: "-$0"
          }
        ]
      }
    }
  });

  const result = runNodeScript(CLI_PATH, ["tags"], {
    cwd: repoRoot,
    env: {
      GITHUB_REF_NAME: "topic/Auth_Branch"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  const tags = JSON.parse(result.stdout);

  assert.ok(tags.includes("0.0.0.710-topic-auth-branch"));
  assert.ok(!tags.includes("0.0.0.710-topic/Auth_Branch"));
});

test("tags command warns when legacy flat config keys are used", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      targetRegistry: "ghcr.io",
      targetRepository: "acme/widget",
      tagLatest: true
    },
    git: {
      qaBranches: ["qa/*"]
    }
  });

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      GITHUB_REF_NAME: "qa/demo"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  assert.match(result.stderr, /Legacy config key 'docker\.targetRegistry' is deprecated/);
  assert.match(result.stderr, /Legacy config key 'docker\.targetRepository' is deprecated/);
  assert.match(result.stderr, /Legacy config key 'docker\.tagLatest' is deprecated/);
  assert.match(result.stderr, /Legacy config key 'git\.qaBranches' is deprecated/);
});

test("tags command warns and falls back to defaults when dockship config is invalid JSON", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeText(path.join(repoRoot, ".dockship", "dockship.json"), "{ invalid json");

  const result = runCliMain(repoRoot, ["tags"]);

  assert.equal(result.status, 0, result.stderr || "Expected tags command to succeed");
  assert.match(result.stderr, /Failed to parse \.dockship\/dockship\.json; using defaults\./);

  const tags = JSON.parse(result.stdout);
  assert.ok(tags.includes("1.2.3"));
  assert.ok(tags.includes("1.2"));
  assert.ok(tags.includes("1"));
});

test("plan command supports docker.push.branchesShortcut", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    docker: {
      push: {
        enabled: true,
        branchesShortcut: "main,release/*"
      }
    }
  });

  const result = runCliMain(repoRoot, ["plan", "--json"], {
    env: {
      GITHUB_REF_NAME: "release/2.0"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected plan command to succeed");

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.result.plan.push.eligible, true);
});

test("plan command supports git branch shortcut keys for build classification", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    git: {
      publicBranchesShortcut: "main,release/*",
      nonPublicBranchesShortcut: "feature/*,hotfix/*"
    }
  });

  const result = runCliMain(repoRoot, ["plan", "--json"], {
    env: {
      GITHUB_REF_NAME: "feature/auth-flow"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected plan command to succeed");

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.result.plan.buildType, "non-public");
  assert.equal(payload.result.plan.buildTypeSource, "branch.classification");
});

test("strict config mode fails fast for invalid dockship config JSON", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeText(path.join(repoRoot, ".dockship", "dockship.json"), "{ invalid json");

  const result = runCliMain(repoRoot, ["tags"], {
    env: {
      DOCKSHIP_STRICT_CONFIG: "true"
    }
  });

  assert.equal(result.status, 1, "Expected strict config mode to fail on invalid JSON");
  assert.match(result.stderr, /Strict config mode enabled; failed to parse \.dockship\/dockship\.json\./);
});

test("strict config mode rejects legacy flat config keys", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

  writeJson(path.join(repoRoot, ".dockship", "dockship.json"), {
    strictConfig: true,
    docker: {
      tagLatest: true
    }
  });

  const result = runCliMain(repoRoot, ["tags"]);

  assert.equal(result.status, 1, "Expected strict config mode to fail on legacy keys");
  assert.match(result.stderr, /Strict config mode does not allow legacy config keys: docker\.tagLatest\./);
});

test("tag command retags from primary reference to computed secondary references", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot, "1.2.3");

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

  const result = runCliMain(repoRoot, ["tag"], {
    env: {
      DOCKER_TARGET_REGISTRY: "ghcr.io",
      DOCKER_TARGET_REPOSITORY: "acme/widget"
    }
  });

  assert.equal(result.status, 0, result.stderr || "Expected tag command to succeed");
  assert.deepEqual(result.dockerCommands, [
    ["tag", "ghcr.io/acme/widget:1.2.3", "ghcr.io/acme/widget:1"],
    ["tag", "ghcr.io/acme/widget:1.2.3", "ghcr.io/acme/widget:1.2"],
    ["tag", "ghcr.io/acme/widget:1.2.3", "ghcr.io/acme/widget:latest"]
  ]);
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

test("version --json --output-file writes JSON envelope to file and does not print envelope to stdout", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const outputPath = path.join(repoRoot, "dockship-output.json");

  const result = runNodeScript(CLI_PATH, ["version", "--json", "--output-file", outputPath], { cwd: repoRoot });

  assert.equal(result.status, 0, result.stderr || "Expected version --json --output-file command to succeed");
  assert.equal(result.stdout.trim(), "", "Expected no JSON envelope on stdout when --output-file is used");

  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assert.equal(payload.command, "version");
  assert.equal(payload.outputMode, "json");
  assert.equal(payload.success, true);
});

test("version --output-json-file writes JSON envelope to file without --json and does not print to stdout", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const outputPath = path.join(repoRoot, "dockship-output-json-file.json");

  const result = runNodeScript(CLI_PATH, ["version", "--output-json-file", outputPath], { cwd: repoRoot });

  assert.equal(result.status, 0, result.stderr || "Expected version --output-json-file command to succeed");
  assert.equal(result.stdout.trim(), "", "Expected no JSON envelope on stdout when --output-json-file is used");

  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assert.equal(payload.command, "version");
  assert.equal(payload.outputMode, "json");
  assert.equal(payload.success, true);
});

test("version --output-file writes JSON envelope to file without --json and does not print to stdout", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const outputPath = path.join(repoRoot, "dockship-output-file.json");

  const result = runNodeScript(CLI_PATH, ["version", "--output-file", outputPath], { cwd: repoRoot });

  assert.equal(result.status, 0, result.stderr || "Expected version --output-file command to succeed");
  assert.equal(result.stdout.trim(), "", "Expected no JSON envelope on stdout when --output-file is used");

  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assert.equal(payload.command, "version");
  assert.equal(payload.outputMode, "json");
  assert.equal(payload.success, true);
});

test("version --output-json-file writes JSON envelope to file without --json and does not print to stdout", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const outputPath = path.join(repoRoot, "dockship-output-json-file.json");

  const result = runNodeScript(CLI_PATH, ["version", "--output-json-file", outputPath], { cwd: repoRoot });

  assert.equal(result.status, 0, result.stderr || "Expected version --output-json-file command to succeed");
  assert.equal(result.stdout.trim(), "", "Expected no JSON envelope on stdout when --output-json-file is used");

  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assert.equal(payload.command, "version");
  assert.equal(payload.outputMode, "json");
  assert.equal(payload.success, true);
});

test("version --output-file writes JSON envelope to file without --json and does not print to stdout", t => {
  const repoRoot = createTempRepo(t);

  seedNodeRepo(repoRoot);

  const outputPath = path.join(repoRoot, "dockship-output-file.json");

  const result = runNodeScript(CLI_PATH, ["version", "--output-file", outputPath], { cwd: repoRoot });

  assert.equal(result.status, 0, result.stderr || "Expected version --output-file command to succeed");
  assert.equal(result.stdout.trim(), "", "Expected no JSON envelope on stdout when --output-file is used");

  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assert.equal(payload.command, "version");
  assert.equal(payload.outputMode, "json");
  assert.equal(payload.success, true);
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