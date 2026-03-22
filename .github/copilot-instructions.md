# Copilot Instructions – dockship

`@agile-north/dockship` is a Node.js CLI (`dock`) that standardizes Docker image versioning, building, and pushing across polyglot CI/CD pipelines.

## Architecture

```text
cli.cjs                          ← CLI entry point; handles all dock commands
lib/version/index.cjs            ← Version resolution orchestrator (runs as subprocess)
lib/version/model.cjs            ← Shared VersionInfo schema + validation helpers
lib/version/fs.cjs               ← File system helpers (findRepoRoot, readJson, etc.)
lib/version/process.cjs          ← Process helpers (tryExec, commandExists)
lib/version/providers/nodejs/    ← Built-in: reads package.json
lib/version/providers/dotnet/    ← Built-in: reads .csproj/.vbproj/.fsproj, Directory.Build.props/targets, AssemblyInfo/VersionInfo (cs/vb/fs)
lib/version/providers/nbgv/      ← Built-in: delegates to Nerdbank.GitVersioning CLI
lib/version/providers/env/       ← Built-in: reads version from DOCKSHIP_VERSION env var or inline config
test/version-providers.test.cjs  ← Provider + orchestrator tests
test/cli.test.cjs                ← CLI command integration tests
test/helpers.cjs                 ← Shared test utilities (createTempRepo, writeJson, createFakeCommand, …)
```

**Key design decision:** `cli.cjs` spawns `lib/version/index.cjs` in a **child process** (`execCapture(process.execPath, [scriptPath])`). This isolates version resolution so providers can `process.exit()` cleanly without affecting the CLI process.

## File format conventions

- Every source file is **CommonJS** (`.cjs`). Do **not** use ES module syntax (`import`/`export`).
- No build step — files are shipped as-is. `package.json` `"files"` lists exactly what is published: `cli.cjs`, `build.cjs`, `lib/`.
- All magic strings and numeric constants are extracted as `const` at the top of the file. Follow this pattern rigidly — never embed bare string literals or numbers inside functions.
- No external runtime dependencies. Every file uses only Node.js built-ins (`fs`, `path`, `child_process`, `os`) plus siblings within the repo.

## Shared helpers — use these, do not re-implement

### `lib/version/model.cjs`

| Export | Purpose |
|---|---|
| `normalizeVersionInfo(input)` | Fills in all optional VersionInfo fields from `version`; use instead of building the return object manually |
| `validateVersionInfo(info)` | Throws if any required field (`source`, `version`, `full`, `major`, `minor`) is empty |
| `splitVersionParts(version)` | Returns `{ major, minor, build }` parsed from the numeric part |
| `parseSemVerSuffix(version)` | Returns the prerelease label including leading `-`, or `""` |
| `sanitizeBranch(branch)` | Strips `refs/heads/`, collapses separators to `-`, lowercases |
| `truncate(value, maxLength)` | Safe string truncation |
| `getString(value, fallback)` | Coerces to trimmed string, returns fallback for null/undefined |

### `lib/version/fs.cjs`

| Export | Purpose |
|---|---|
| `fileExists(path)` | Safe existence check |
| `isDirectory(path)` | Safe directory check |
| `ensureFileExists(path, msg)` | Throws with message if missing |
| `readText(path)` | `fs.readFileSync` + utf8 |
| `readJson(path)` | Parses JSON from file |
| `tryReadJson(path)` | Returns `null` on parse failure instead of throwing |
| `resolvePath(base, rel)` | `path.resolve(base, rel)` with guard for empty `rel` |
| `findRepoRoot(startDir)` | Walks up to find the `.git` dir; returns that directory |
| `discoverFiles(root, predicate, opts)` | Recursive file walk filtered by predicate; respects `opts.maxFiles` |
| `unique(arr)` | Deduplicates an array |
| `parsePathList(value)` | Splits a comma/semicolon/newline-delimited string into paths |

### `lib/version/process.cjs`

| Export | Purpose |
|---|---|
| `tryExec(cmd, args, opts)` | `spawnSync` wrapper; returns `{ ok, status, stdout, stderr, error }` |
| `execOrThrow(cmd, args, opts)` | Like `tryExec` but throws on non-zero exit |
| `commandExists(cmd, opts)` | Returns `true` if `cmd` is on PATH |

### `test/helpers.cjs`

| Export | Purpose |
|---|---|
| `createTempRepo(t)` | Makes a temp dir with a `.git` folder; auto-deleted after the test |
| `writeText(filePath, content)` | Creates parent dirs and writes a file |
| `writeJson(filePath, value)` | `JSON.stringify` + `writeText` |
| `createFakeCommand(binDir, name, scriptSource)` | Writes a cross-platform Node.js shim for use as a PATH-injected fake command |
| `createCommandEnv(binDir, overrides)` | Returns a `process.env` copy with `binDir` prepended to `PATH` |
| `runNodeScript(scriptPath, args, opts)` | Runs a `.cjs` file via `spawnSync`; returns `{ status, stdout, stderr }` |

## Version provider contract

A provider module must export a single function:

```js
module.exports = {
  resolveVersion(context) {
    // context: { cwd, repoRoot, buildConfig, env, providerName, providerConfig }
    return normalizeVersionInfo({ source, version, full, major, minor, build, suffix, ... });
  }
};
```

Required fields on the returned object: `source`, `version`, `full`, `major`, `minor` (validated by `validateVersionInfo` in `model.cjs`). Use `normalizeVersionInfo` to fill defaults from `version` automatically.

**Auto-detection chain** (in `lib/version/index.cjs` `detectProviderName`, tried in order):

1. `version.json` present → `nbgv`
2. `package.json` present → `nodejs`
3. MSBuild/assembly files present → `dotnet`
4. `DOCKSHIP_VERSION` env var set (or `version.env.version` in config) → `env`
5. None found → throws "Could not auto-detect version provider"

When running in `auto` mode, if the selected provider throws while resolving version info, dockship retries with `env` if `DOCKSHIP_VERSION` (or `version.env.version`) is available.

**Provider resolution order** (in `lib/version/index.cjs` `loadProvider`):

1. Bundled path: `lib/version/providers/<name>/index.cjs`
2. Scoped npm package: `@agile-north/docker-ci-provider-<name>`
3. Custom package: `providerConfig.providerPackage`
   - Relative paths (`./…` or `../…`) are resolved against `context.repoRoot` so consumer repos can reference local files portably
   - All other values (npm package names, absolute paths) are passed to `require()` unchanged

The `nodejs` and `dotnet` providers are **self-contained** (inline all helpers). The `nbgv` and `env` providers re-use the shared `fs.cjs`, `process.cjs`, and `model.cjs` modules. Match this pattern when adding new built-in providers. Likely future built-in providers: `python`, `gradle`, `maven`, `go`, `rust`.

## Adding a new built-in provider — checklist

When adding (e.g.) a `python` provider, touch exactly these files:

1. **Create `lib/version/providers/python/index.cjs`** — export `resolveVersion(context)`
2. **`lib/version/index.cjs`** — 5 edits:
   - Add `const PROVIDER_PYTHON = "python";` with the other provider constants
   - Add default config block `[PROVIDER_PYTHON]: { … }` inside `getDefaultBuildConfig()`
   - Add merge block `[PROVIDER_PYTHON]: { ...defaults[VERSION_SECTION_KEY][PROVIDER_PYTHON], ...(version[PROVIDER_PYTHON] || {}) }` inside `mergeBuildConfig()`
   - Add `function repoHasPython(repoRoot, buildConfig) { … }` detection helper
   - Insert `if (repoHasPython(repoRoot, buildConfig)) return PROVIDER_PYTHON;` in `detectProviderName()` at the appropriate position in the chain
3. **`test/version-providers.test.cjs`** — add unit tests for the provider and an orchestration test for auto-detection
4. **`README.md`** — add provider options table, config example, and auto-detection trigger to the Provider Catalog section
5. **`.github/copilot-instructions.md`** — update the architecture map and auto-detection chain

## Testing patterns

Tests use Node's built-in `node:test` runner (`npm test`). All tests are in `test/`. No test framework is installed.

```js
const test = require("node:test");
const assert = require("assert/strict");
const { createTempRepo, writeJson, writeText, createFakeCommand, createCommandEnv } = require("./helpers.cjs");
```

**Unit test pattern** (provider in isolation):

```js
test("python provider resolves version from pyproject.toml", () => {
  const versionInfo = pythonProvider.resolveVersion({
    repoRoot: "/irrelevant",
    providerConfig: {},
    env: {}
  });
  assert.equal(versionInfo.source, "python");
  assert.equal(versionInfo.major, "1");
});
```

**Orchestration test pattern** (auto-detection via `versionIndex`):

```js
test("version orchestration auto-detects python for pyproject.toml repos", t => {
  const repoRoot = createTempRepo(t);   // temp dir with .git; cleaned up after test
  writeText(path.join(repoRoot, "pyproject.toml"), "[tool.poetry]\nversion = \"1.2.3\"\n");
  const versionInfo = versionIndex.resolveVersion(versionIndex.buildContext(repoRoot));
  assert.equal(versionInfo.source, "python");
});
```

**Fake external command pattern** (for providers that shell out):

```js
test("python provider calls python to get version", t => {
  const binDir = path.join(createTempRepo(t), ".test-bin");
  createFakeCommand(binDir, "python", `process.stdout.write("1.2.3\\n"); process.exit(0);`);
  const env = createCommandEnv(binDir);
  // pass env into resolveVersion or versionIndex.buildContext
});
```

## Configuration

Consumer projects may place config at `.dockship/dockship.json` (not the repo root). The root `dockship.json` in this repo is a reference/template. If the client repo does not define `.dockship/dockship.json`, dockship uses built-in defaults and version provider auto-detection. All Docker settings can be overridden by environment variables. A `.env` file at the **client repo root** (same level as `.git`) is loaded automatically — useful for local development defaults. Priority: CI env vars > `.env` > `dockship.json` > built-in defaults:

| Env Var | JSON field |
|---|---|
| `DOCKER_TARGET_REGISTRY` | `docker.target.registry` |
| `DOCKER_TARGET_REPOSITORY` | `docker.target.repository` |
| `DOCKER_PUSH_ENABLED` | `docker.push.enabled` |
| `DOCKER_PUSH_BRANCHES` | `docker.push.branches` |
| `DOCKER_TAG_LATEST` | `docker.tags.latest` |

## Docker tagging strategy

Tags generated by `getTags()` in `cli.cjs`: `version`, `major`, `major.minor`, and optionally `latest`. The full version string is also passed as `--build-arg APP_VERSION=<full>`.

## Developer workflows

```bash
# Run CLI locally (no install needed)
node ./cli.cjs version
node ./cli.cjs tags

# Run tests
npm test

# Validate npm package before publishing
npm publish --dry-run
```

The repo uses Node's built-in test runner via `npm test`.
CI runs tests plus package validation in `.github/workflows/ci.yml` on PRs and pushes to `main`, `develop`, and `feature/**`.

## Release workflow

Versioning is automated by [release-please](https://github.com/googleapis/release-please) (`.github/workflows/release.yml`).

1. Merge feature PRs into `main` using [Conventional Commits](https://www.conventionalcommits.org/)
2. release-please detects `feat:`, `fix:`, `perf:` commits and opens a Release PR (bumps `package.json` + `CHANGELOG.md`)
3. Review and merge the Release PR
4. release-please sets `release_created=true` → inline publish job runs → npm `latest`

for prerelease testing: push to `develop` → auto-publishes to npm `next`

## Publish channels

| Trigger | npm tag | Version format |
|---|---|---|
| Merge Release PR to `main` (`release_created=true`) | `latest` | from release-please (`package.json` bump) |
| Push to `develop` | `next` | `X.Y.Z-dev.<run>.<sha>` |
| `workflow_dispatch` on `main` | `latest` | from `package.json` |
| `workflow_dispatch` on `develop` | `next` | `X.Y.Z-dev.<run>.<sha>` |
