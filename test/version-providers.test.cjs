const assert = require("assert/strict");
const cp = require("child_process");
const path = require("path");
const test = require("node:test");

const versionIndex = require("../lib/version/index.cjs");
const dotnetProvider = require("../lib/version/providers/dotnet/index.cjs");
const nodejsProvider = require("../lib/version/providers/nodejs/index.cjs");
const {
  createCommandEnv,
  createFakeCommand,
  createTempRepo,
  writeJson,
  writeText
} = require("./helpers.cjs");

const SAMPLE_PACKAGE_NAME = "sample-app";
const PROCESS_MODULE_PATH = require.resolve("../lib/version/process.cjs");
const NBGV_PROVIDER_PATH = require.resolve("../lib/version/providers/nbgv/index.cjs");

function createBinDir(repoRoot) {
  return path.join(repoRoot, ".test-bin");
}

function assertVersionFields(versionInfo, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(versionInfo[key], value, `Expected ${key} to equal '${value}'`);
  }
}

function runGit(repoRoot, args) {
  const result = cp.spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  assert.equal(result.status, 0, result.stderr || `git ${args.join(" ")} failed`);
}

function initializeGitRepo(repoRoot) {
  runGit(repoRoot, ["init"]);
  runGit(repoRoot, ["config", "user.email", "dockship-tests@example.com"]);
  runGit(repoRoot, ["config", "user.name", "Dockship Tests"]);
  runGit(repoRoot, ["add", "."]);
  runGit(repoRoot, ["commit", "-m", "test: seed repo", "--no-gpg-sign"]);
}

function withMockedNbgvProvider(processExports, callback) {
  const originalProcessModule = require.cache[PROCESS_MODULE_PATH];
  const originalProviderModule = require.cache[NBGV_PROVIDER_PATH];

  delete require.cache[NBGV_PROVIDER_PATH];
  require.cache[PROCESS_MODULE_PATH] = {
    id: PROCESS_MODULE_PATH,
    filename: PROCESS_MODULE_PATH,
    loaded: true,
    exports: processExports
  };

  try {
    const provider = require(NBGV_PROVIDER_PATH);
    return callback(provider);
  } finally {
    delete require.cache[NBGV_PROVIDER_PATH];

    if (originalProcessModule) {
      require.cache[PROCESS_MODULE_PATH] = originalProcessModule;
    } else {
      delete require.cache[PROCESS_MODULE_PATH];
    }

    if (originalProviderModule) {
      require.cache[NBGV_PROVIDER_PATH] = originalProviderModule;
    }
  }
}

function withMockedBundledProvider(modulePath, exports, callback) {
  const originalModule = require.cache[modulePath];

  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports
  };

  try {
    return callback();
  } finally {
    if (originalModule) {
      require.cache[modulePath] = originalModule;
    } else {
      delete require.cache[modulePath];
    }
  }
}

test("nodejs provider resolves fixed versions from package.json", t => {
  const repoRoot = createTempRepo(t);

  writeJson(path.join(repoRoot, "package.json"), {
    name: SAMPLE_PACKAGE_NAME,
    version: "1.2.3-beta.1+build.9"
  });

  const versionInfo = nodejsProvider.resolveVersion({
    repoRoot,
    providerConfig: {
      mode: nodejsProvider.MODE_FIXED
    },
    env: {}
  });

  assertVersionFields(versionInfo, {
    source: "nodejs",
    version: "1.2.3-beta.1+build.9",
    full: "1.2.3-beta.1+build.9",
    major: "1",
    minor: "2",
    build: "3",
    suffix: "-beta.1",
    semVer2: "1.2.3-beta.1+build.9"
  });
});

test("nodejs provider throws when package.json version is missing", t => {
  const repoRoot = createTempRepo(t);

  writeJson(path.join(repoRoot, "package.json"), {
    name: SAMPLE_PACKAGE_NAME
  });

  assert.throws(() => {
    nodejsProvider.resolveVersion({
      repoRoot,
      providerConfig: {
        mode: nodejsProvider.MODE_FIXED
      },
      env: {}
    });
  }, /No version found in package\.json/);
});

test("nodejs provider appends git height in git-height mode", t => {
  const repoRoot = createTempRepo(t);
  const binDir = createBinDir(repoRoot);

  writeJson(path.join(repoRoot, "package.json"), {
    name: SAMPLE_PACKAGE_NAME,
    version: "1.2.3-beta.1+sha.abc"
  });

  createFakeCommand(binDir, "git", `
const args = process.argv.slice(2);
if (args.join(" ") === "rev-list --count HEAD") {
  process.stdout.write("42\\n");
  process.exit(0);
}
process.stderr.write("Unexpected git args: " + args.join(" "));
process.exit(1);
`);

  const versionInfo = nodejsProvider.resolveVersion({
    repoRoot,
    providerConfig: {
      mode: nodejsProvider.MODE_GIT_HEIGHT
    },
    env: createCommandEnv(binDir)
  });

  assertVersionFields(versionInfo, {
    source: "nodejs",
    version: "1.2.3.42-beta.1",
    full: "1.2.3.42-beta.1",
    major: "1",
    minor: "2",
    build: "3",
    suffix: "-beta.1"
  });
});

test("dotnet provider prefers csproj files during autodiscovery", t => {
  const repoRoot = createTempRepo(t);

  writeText(path.join(repoRoot, "src", "App", "App.csproj"), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <VersionPrefix>2.3.4</VersionPrefix>
    <VersionSuffix>beta</VersionSuffix>
  </PropertyGroup>
</Project>
`);

  writeText(path.join(repoRoot, "src", "App", "Properties", "AssemblyInfo.cs"), `
[assembly: AssemblyFileVersion("9.9.9")]
`);

  const versionInfo = dotnetProvider.resolveVersion({
    repoRoot,
    providerConfig: {
      autoDiscover: true,
      mode: dotnetProvider.MODE_FIXED
    },
    env: {}
  });

  assertVersionFields(versionInfo, {
    source: "dotnet-csproj",
    version: "2.3.4-beta",
    full: "2.3.4",
    major: "2",
    minor: "3",
    build: "4",
    suffix: "-beta"
  });
});

test("dotnet provider appends git height for git-height mode", t => {
  const repoRoot = createTempRepo(t);

  writeText(path.join(repoRoot, "src", "App", "App.csproj"), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <Version>3.4.5-feature/test_branch</Version>
  </PropertyGroup>
</Project>
`);

  initializeGitRepo(repoRoot);

  const versionInfo = dotnetProvider.resolveVersion({
    repoRoot,
    providerConfig: {
      autoDiscover: true,
      mode: dotnetProvider.MODE_GIT_HEIGHT
    },
    env: process.env
  });

  assertVersionFields(versionInfo, {
    source: "dotnet-csproj",
    version: "3.4.5.1-feature-test-branch",
    full: "3.4.5.1",
    major: "3",
    minor: "4",
    build: "5",
    suffix: "-feature-test-branch"
  });
});

test("dotnet provider throws when no version source files exist", t => {
  const repoRoot = createTempRepo(t);

  assert.throws(() => {
    dotnetProvider.resolveVersion({
      repoRoot,
      providerConfig: {
        autoDiscover: true,
        mode: dotnetProvider.MODE_FIXED
      },
      env: {}
    });
  }, /No dotnet version source files were found/);
});

test("nbgv provider resolves versions through docker output", t => {
  const repoRoot = createTempRepo(t);

  writeJson(path.join(repoRoot, "version.json"), {
    version: "1.0"
  });

  const versionInfo = withMockedNbgvProvider({
    commandExists(command) {
      return command === "docker";
    },
    tryExec(command) {
      assert.equal(command, "docker");

      return {
        ok: true,
        stdout: JSON.stringify({
          Version: "5.6.7",
          SemVer2: "5.6.7-beta.3+commit.abc",
          AssemblyVersion: "5.6.0.0",
          AssemblyInformationalVersion: "5.6.7-beta.3+commit.abc",
          NuGetPackageVersion: "5.6.7-beta.3"
        }),
        stderr: ""
      };
    }
  }, provider => provider.resolveVersion({
    repoRoot,
    providerConfig: {},
    env: {}
  }));

  assertVersionFields(versionInfo, {
    source: "nbgv",
    version: "5.6.7",
    full: "5.6.7",
    major: "5",
    minor: "6",
    build: "7",
    suffix: "-beta.3",
    semVer2: "5.6.7-beta.3+commit.abc",
    assemblyVersion: "5.6.0.0",
    informationalVersion: "5.6.7-beta.3+commit.abc",
    nuGetPackageVersion: "5.6.7-beta.3"
  });
});

test("version orchestration auto-detects nbgv before nodejs", t => {
  const repoRoot = createTempRepo(t);

  writeJson(path.join(repoRoot, "version.json"), {
    version: "1.0"
  });

  writeJson(path.join(repoRoot, "package.json"), {
    name: SAMPLE_PACKAGE_NAME,
    version: "9.9.9"
  });

  const context = versionIndex.buildContext(repoRoot);
  const versionInfo = withMockedBundledProvider(NBGV_PROVIDER_PATH, {
    resolveVersion() {
      return {
        source: "nbgv",
        version: "6.7.8",
        full: "6.7.8",
        major: "6",
        minor: "7",
        build: "8",
        suffix: "",
        semVer2: "6.7.8",
        assemblyVersion: "6.7.0.0",
        informationalVersion: "6.7.8",
        nuGetPackageVersion: "6.7.8"
      };
    }
  }, () => versionIndex.resolveVersion(context));

  assertVersionFields(versionInfo, {
    source: "nbgv",
    version: "6.7.8"
  });
});

test("version orchestration auto-detects nodejs when package.json is present", t => {
  const repoRoot = createTempRepo(t);

  writeJson(path.join(repoRoot, "package.json"), {
    name: SAMPLE_PACKAGE_NAME,
    version: "4.5.6"
  });

  const context = versionIndex.buildContext(repoRoot);
  const versionInfo = versionIndex.resolveVersion(context);

  assertVersionFields(versionInfo, {
    source: "nodejs",
    version: "4.5.6",
    full: "4.5.6",
    major: "4",
    minor: "5",
    build: "6"
  });
});