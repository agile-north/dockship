# dockship

Opinionated Docker image versioning, building, and publishing for CI/CD pipelines.

[![npm version](https://img.shields.io/npm/v/%40agile-north%2Fdockship?logo=npm)](https://www.npmjs.com/package/@agile-north/dockship)
[![npm downloads](https://img.shields.io/npm/dm/%40agile-north%2Fdockship?logo=npm)](https://www.npmjs.com/package/@agile-north/dockship)
[![license](https://img.shields.io/npm/l/%40agile-north%2Fdockship)](https://github.com/agile-north/dockship/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/%40agile-north%2Fdockship?logo=node.js)](https://www.npmjs.com/package/@agile-north/dockship)
[![CI](https://github.com/agile-north/dockship/actions/workflows/ci.yml/badge.svg)](https://github.com/agile-north/dockship/actions/workflows/ci.yml)
[![Release](https://github.com/agile-north/dockship/actions/workflows/release.yml/badge.svg)](https://github.com/agile-north/dockship/actions/workflows/release.yml)

Source repository: [github.com/agile-north/dockship](https://github.com/agile-north/dockship)

**dock** • **ship** • **repeat**

## What is dockship?

`@agile-north/dockship` is a lightweight CLI tool that standardizes Docker container builds across projects. It handles:

- **Semantic versioning** from multiple sources (Node.js, .NET, NBGV, custom providers)
- **Multi-tag Docker builds** (version, major, major.minor, optional latest)
- **Registry push** with consistent tagging strategy
- **Polyglot support** – Node.js, C#/.NET, NBGV, and extensible to any language
- **Git-height versioning** – automatic build number from commit count

Perfect for microservices, full-stack apps, and standardized CI/CD across teams.

## Installation

You can use dockship in two ways:

1. Install as a dev dependency (recommended for repeatable team workflows)
2. Run directly with `npx` (no local install required)

### Option 1: Install in your project

```bash
npm install -D @agile-north/dockship
```

Then add to `package.json` scripts:

```json
{
  "scripts": {
    "dock:build": "dock build",
    "dock:ship": "dock ship",
    "dock:all": "dock build && dock ship"
  }
}
```

### Option 2: Run directly with npx (no install)

```bash
# Run without adding dockship to package.json
npx @agile-north/dockship version
npx @agile-north/dockship build
npx @agile-north/dockship ship
npx @agile-north/dockship all
npx @agile-north/dockship tags
```

For reproducible CI/local behavior, you can pin a version:

```bash
npx @agile-north/dockship@1.4.0 version
```

## Automated npm publish (GitHub Actions)

This repo includes a release workflow at `.github/workflows/release.yml`.

- Triggers on pushes to `main` and `develop`
- Can also be run manually with **workflow_dispatch**
- Skips publishing when that exact package version already exists on npm

## Version management

Versioning is automated by [release-please](https://github.com/googleapis/release-please)
via `.github/workflows/release.yml`.

How it works:

1. Merge PRs into `main` using [Conventional Commits](https://www.conventionalcommits.org/) (see [CONTRIBUTING.md](CONTRIBUTING.md))
2. release-please detects `feat:`, `fix:`, `perf:` commits and opens a **Release PR** that bumps `package.json` version and updates `CHANGELOG.md`
3. Review and merge the Release PR
4. release-please sets `release_created=true`, which runs the inline publish job and pushes to npm `latest`

Version bump rules (SemVer):

- `feat:` commits → minor bump (`0.1.0` → `0.2.0`)
- `fix:` / `perf:` commits → patch bump (`0.1.0` → `0.1.1`)
- `feat!:` / `BREAKING CHANGE:` footer → major bump (`0.1.0` → `1.0.0`)

Branch/channel behavior:

- Release PR merged to `main` with `release_created=true` → stable publish to npm `latest`
- `develop` push → prerelease publish to npm `next` (`X.Y.Z-dev.<run>.<sha>`)
- manual `workflow_dispatch` → only `main` (stable) or `develop` (prerelease); other refs are rejected

Allowed publish routes (enforced):

- Release PR merged on `main` (`release_created=true`) → stable publish
- Push to `develop` → prerelease publish
- Manual run on `main` or `develop` only → stable/prerelease respectively
- Direct push to `main` → not a publish route

CI validation:

- `.github/workflows/ci.yml` runs on PRs and pushes to `main`, `develop`, and `feature/**`
- It runs `npm test` and validates installability and npm package metadata using dry-run checks
- Configure branch protection on `main` and require status checks **CI / validate** and **PR Title / conventional-pr-title** before merge

Local validation:

```bash
npm run lint:md
npm test
```

Optional (recommended) one-time setup to enforce markdown lint before commits:

```bash
npm run hooks:install
```

Hooks are installed automatically on `npm install` via the `prepare` script.

Authentication options:

- Trusted publishing: configure this GitHub repo as a trusted publisher in npm settings; no `NPM_TOKEN` secret is required for package publish.

## Quick Start

**1. Optional: create `.dockship/dockship.json`**

```json
{
  "docker": {
    "file": "Dockerfile",
    "context": ".",
    "target": {
      "registry": "registry.example.com",
      "repository": "my-org/my-app"
    },
    "login": {
      "registry": "registry.example.com"
    },
    "push": {
      "enabled": false,
      "branches": ["main", "develop"]
    },
    "tags": {
      "latest": false
    }
  },

  "version": {
    "provider": "auto",
    "nodejs": {
      "packageJsonPath": "package.json",
      "mode": "git-height"
    }
  }
}
```

**2. Create `Dockerfile`**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 3. Run commands

```bash
# Show resolved version
npx dock version

# Build image with computed version
npx dock build

# Ship image to registry
npx dock ship

# Build and ship
npx dock all

# Show generated tags
npx dock tags

# Emit machine-readable envelope output
npx dock version --json
npx dock tags --output json
npx dock all --json
```

## JSON Output

Dockship supports structured output for automation and CI pipelines.

- `--json` is shorthand for `--output json`
- `--output` supports `human` (default) and `json`

In `json` mode:

- stdout contains exactly one JSON object
- stderr may contain diagnostic command output
- exit codes follow command status semantics

JSON contract reference:

- `docs/output.md`

Examples:

```bash
# Full envelope for version resolution
npx dock version --json

# Computed tags and fully-qualified references
npx dock tags --output json

# Build + push with step-level results
npx dock all --json
```

Extract values:

```bash
# deployable image reference
jq -r '.result.artifact.image.reference'

# immutable artifact identifier
jq -r '.result.artifact.id'
```

## Documentation

Keep README focused on onboarding and common usage. Detailed feature contracts live under `docs/`.

- `docs/output.md` - JSON output contract and status semantics

## Configuration: dockship.json

### Docker Settings

The config file is optional. If `.dockship/dockship.json` is missing, dockship uses built-in defaults:

- `docker.file = "Dockerfile"`
- `docker.context = "."`
- `docker.push.enabled = false`
- `docker.push.branches = []`
- `docker.tags.latest = false`
- `docker.cleanup.local = "auto"`
- `docker.runner = "build"`

For `dock build`, `dock ship`, and `dock all`, image target settings still need to come from config or env:

- `DOCKER_TARGET_REGISTRY`
- `DOCKER_TARGET_REPOSITORY`

Configuration precedence is:

1. CI/runtime environment variables
2. `.env` values at the repo root
3. `.dockship/dockship.json`
4. built-in defaults

```json
{
  "docker": {
    "file": "Dockerfile",                  // Path to Dockerfile
    "context": ".",                        // Build context
    "target": {
      "registry": "registry.io",           // Docker registry
      "repository": "org/app"              // Image repository
    },
    "login": {
      "registry": "registry.io"            // Optional: login registry override
    },
    "push": {
      "enabled": false,                     // Enable/disable push
      "branches": ["main", "develop"]    // Optional: allowed branches, supports *
    },
    "tags": {
      "latest": false                       // Add 'latest' tag
    },
    "cleanup": {
      "local": "auto"                    // Auto: clean in CI, keep locally for dev
    },
    "runner": "build",                  // Optional: build, buildx, or auto
    "platform": "linux/amd64",            // Optional: build platform
    "buildTarget": "export-stage",        // Optional: docker build --target
    "buildOutput": "type=local,dest=./out", // Optional: docker build --output
    "buildArgs": { "ENV": "prod" },       // Optional: extra docker build args
    "stages": {
      "validate": {
        "target": "validate",
        "output": "type=local,dest=./stage-validate"
      },
      "test": {
        "target": "test",
        "output": "type=local,dest=./stage-test"
      }
    }
  }
}
```

#### Docker option reference

| Setting | Type | Default | Env override | Notes |
| --- | --- | --- | --- | --- |
| `docker.file` | string | `Dockerfile` | `DOCKERFILE_PATH` | Path to the Dockerfile relative to the repo root |
| `docker.context` | string | `.` | `DOCKER_CONTEXT` | Docker build context |
| `docker.target.registry` | string | empty | `DOCKER_TARGET_REGISTRY` | Required for `dock build`, `dock ship`, and `dock all` |
| `docker.target.repository` | string | empty | `DOCKER_TARGET_REPOSITORY` | Required for `dock build`, `dock ship`, and `dock all` |
| `docker.login.registry` | string | empty | `DOCKER_LOGIN_REGISTRY` | Optional login registry override; defaults to `docker.target.registry` |
| `docker.push.enabled` | boolean | `false` | `DOCKER_PUSH_ENABLED` | Enables pushing for `dock ship` and `dock all` |
| `docker.push.branches` | string[] | `[]` | `DOCKER_PUSH_BRANCHES` | Branch allow-list; supports `*` wildcards |
| `docker.tags.latest` | boolean | `false` | `DOCKER_TAG_LATEST` | Adds the `latest` tag in addition to semantic tags |
| `docker.cleanup.local` | `auto` \| boolean | `auto` | `DOCKER_CLEANUP_LOCAL` | `auto` cleans up in CI and keeps images locally for dev. `true` always removes built tags after `dock build`/`dock all`; `false` never removes them. |
| `docker.runner` | `build` \| `buildx` \| `auto` | `build` | `DOCKER_RUNNER` | Selects Docker runner command. `auto` prefers `docker buildx build` and falls back to `docker build` |
| `docker.platform` | string | empty | `DOCKER_PLATFORM` | Passed to `docker build --platform` |
| `docker.buildTarget` | string | empty | `DOCKER_BUILD_TARGET` | Passed to `docker build --target` |
| `docker.buildOutput` | string or string[] | empty | `DOCKER_BUILD_OUTPUT` | Passed to `docker build --output`; this may be `type=local,dest=...` or other buildx output spec |
| `docker.buildArgs` | object | `{}` | `DOCKER_BUILD_ARGS` | Key/value pairs passed as `--build-arg KEY=value`; appended before the auto-generated `APP_VERSION` build arg. Env var accepts JSON (`{"K":"v"}`) or semicolon-delimited `KEY=value;KEY2=value2` |
| `docker.stages` | object | `{}` | n/a | Stage definitions for `dock stage <name>` and `dock stage all`. Each stage may set `target`/`output`/`runner` to override `docker.buildTarget`, `docker.buildOutput`, `docker.runner` |

To export files or artifacts from intermediate Dockerfile stages, set the runner to `buildx` (or `auto`) and pass `--target` and `--output` via `DOCKER_BUILD_ARGS`.

Example:

```bash
DOCKER_RUNNER=buildx \
DOCKER_BUILD_ARGS='--target export-stage;--output=type=local,dest=./out' \
npx dock build
```

To export files or artifacts from intermediate Dockerfile stages, set the runner to `buildx` (or `auto`) and pass `--target` and `--output` via `DOCKER_BUILD_ARGS`.

Example:

```bash
DOCKER_RUNNER=buildx \
DOCKER_BUILD_ARGS='--target export-stage;--output=type=local,dest=./out' \
npx dock build
```

Optional registry login environment variables:

- `DOCKER_LOGIN_USERNAME`
- `DOCKER_LOGIN_PASSWORD`
- `DOCKER_LOGIN_REGISTRY` (defaults to `docker.login.registry`, then `DOCKER_TARGET_REGISTRY`)

When `DOCKER_LOGIN_USERNAME` and `DOCKER_LOGIN_PASSWORD` are set, dockship creates a temporary isolated Docker config, runs `docker login` for that invocation, and removes the temporary config afterward. This avoids changing the user's normal Docker login state.

Legacy aliases remain supported for compatibility:

- `DOCKER_AUTH_USERNAME`
- `DOCKER_AUTH_PASSWORD`
- `DOCKER_AUTH_REGISTRY`

`dock ship` and `dock all` only push when both of these are true:

- `docker.push.enabled` is `true`
- the current branch matches `docker.push.branches` when a branch list is configured

If `docker.push.branches` is omitted or empty, any branch may push.

Branch matching details:

- patterns are matched against the full normalized branch name
- `*` matches any sequence of characters
- examples: `main`, `develop`, `release/*`, `feature/*`
- branch name detection uses common CI branch variables first, then falls back to `git rev-parse --abbrev-ref HEAD`

Legacy flat keys are still accepted for compatibility:

- `docker.dockerfile` → `docker.file`
- `docker.targetRegistry` → `docker.target.registry`
- `docker.targetRepository` → `docker.target.repository`
- `docker.loginRegistry` → `docker.login.registry`
- `docker.pushEnabled` → `docker.push.enabled`
- `docker.pushBranches` → `docker.push.branches`
- `docker.tagLatest` → `docker.tags.latest`

Environment variable overrides (CI):

- `DOCKER_TARGET_REGISTRY`
- `DOCKER_TARGET_REPOSITORY`
- `DOCKER_PUSH_ENABLED`
- `DOCKER_PUSH_BRANCHES`
- `DOCKER_TAG_LATEST`
- `DOCKER_CLEANUP_LOCAL`
- `DOCKER_RUNNER`
- `DOCKER_LOGIN_USERNAME`
- `DOCKER_LOGIN_PASSWORD`
- `DOCKER_LOGIN_REGISTRY`

### Version Providers

`version.provider` supports `"auto"`, `"nodejs"`, `"dotnet"`, `"nbgv"`, `"env"`, and any custom provider name.

When `version.provider` is `"auto"`, dockship uses this order:

1. `version.json` → `nbgv`
2. `package.json` → `nodejs`
3. MSBuild and assembly metadata files → `dotnet`
4. `DOCKSHIP_VERSION` env var → `env`

If a provider selected by auto-detection fails to resolve a valid version, dockship will retry with `env` when `DOCKSHIP_VERSION` (or `version.env.version`) is available.

The built-in `dotnet` provider auto-discovers:

- `.csproj`, `.vbproj`, and `.fsproj`
- `Directory.Build.props` and `Directory.Build.targets`
- `VersionInfo.cs`, `VersionInfo.vb`, `VersionInfo.fs`
- `AssemblyInfo.cs`, `AssemblyInfo.vb`, `AssemblyInfo.fs`

When `dotnet` is available, project files are evaluated with `dotnet msbuild` preprocessing first so imported props and centrally managed version properties are respected. If that evaluation path is unavailable or does not yield a version, dockship falls back to scanning the discovered files directly.

If no config file exists, dockship uses `"auto"` by default.

#### Version option reference

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `version.provider` | string | `auto` | Version provider name. Use `auto`, `nodejs`, `dotnet`, `nbgv`, `env`, or a custom provider name |
| `version.<provider>.providerPackage` | string | empty | npm package name or path to load for custom providers. Relative paths (starting with `./` or `../`) are resolved from the client repo root. |

#### Node.js provider options

| Setting | Type | Default | Env override | Description |
| --- | --- | --- | --- | --- |
| `version.nodejs.packageJsonPath` | string | `package.json` | `PACKAGE_JSON_PATH` | Path to the package file used for version resolution |
| `version.nodejs.mode` | string | `fixed` | `NODEJS_VERSION_MODE` | `fixed` uses `package.json` version as-is; `git-height` appends commit count |

#### Node.js (npm)

```json
{
  "version": {
    "provider": "auto",
    "nodejs": {
      "packageJsonPath": "package.json",
      "mode": "fixed"  // or "git-height"
    }
  }
}
```

#### .NET provider options

| Setting | Type | Default | Env override | Description |
| --- | --- | --- | --- | --- |
| `version.dotnet.mode` | string | `fixed` | `DOTNET_VERSION_MODE` | `fixed` uses discovered version as-is; `git-height` appends commit count |
| `version.dotnet.mainAssemblyInfoFilePath` | string | empty | `MAIN_ASSEMBLY_INFO_FILE_PATH` | Preferred explicit AssemblyInfo file |
| `version.dotnet.assemblyInfoFilePaths` | string[] | `[]` | `ASSEMBLY_INFO_FILE_PATHS` | Additional AssemblyInfo file paths |
| `version.dotnet.versionInfoFilePaths` | string[] | `[]` | `VERSION_INFO_FILE_PATHS` | Explicit VersionInfo file paths |
| `version.dotnet.projectFilePaths` | string[] | `[]` | `PROJECT_FILE_PATHS` | Explicit project file paths for `.csproj`, `.vbproj`, or `.fsproj` |
| `version.dotnet.csprojFilePaths` | string[] | `[]` | `CSPROJ_FILE_PATHS` | Legacy alias for explicit C# project file paths |
| `version.dotnet.autoDiscover` | boolean | `true` | none | When `true`, scans the repo for supported MSBuild project files, `Directory.Build.props`, `Directory.Build.targets`, `VersionInfo.*`, and `AssemblyInfo.*` |

#### .NET / MSBuild

```json
{
  "version": {
    "provider": "dotnet",
    "dotnet": {
      "mode": "git-height",
      "autoDiscover": true
    }
  }
}
```

#### Env provider options

The `env` provider reads a pre-computed version from an environment variable or inline config. It is the simplest way to supply a version when CI tooling (e.g. GitHub Actions, TeamCity, GitLab CI) has already computed one.

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `version.env.versionVar` | string | `DOCKSHIP_VERSION` | Name of the environment variable that holds the version string |
| `version.env.version` | string | empty | Inline version override — takes priority over the env var |

#### Env provider

```json
{
  "version": {
    "provider": "env",
    "env": {
      "versionVar": "DOCKSHIP_VERSION"
    }
  }
}
```

Or supply a static version at build time:

```json
{
  "version": {
    "provider": "env",
    "env": {
      "version": "1.0.0"
    }
  }
}
```

In `auto` mode the `env` provider activates when `DOCKSHIP_VERSION` is set (or `version.env.version` is non-empty). It is evaluated last during detection, and also serves as a recovery fallback when an earlier detected provider fails to resolve a valid version.

#### NBGV provider options

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `version.nbgv.useDocker` | boolean | `true` | Run nbgv inside a Docker container — no .NET SDK required on the host |
| `version.nbgv.dockerImage` | string | `mcr.microsoft.com/dotnet/sdk:latest` | Docker image used when `useDocker` is `true` |
| `version.nbgv.versionJsonFileName` | string | `version.json` | File used to detect and run NBGV |
| `version.nbgv.dotnetToolManifestRelativePath` | string | `.config/dotnet-tools.json` | Tool manifest used when restoring local dotnet tools |
| `version.nbgv.allowToolRestore` | boolean | `true` | Allows `dotnet tool restore` before retrying (host execution only) |
| `version.nbgv.allowGlobalCommand` | boolean | `true` | Allows the global `nbgv` command as a fallback (host execution only) |
| `version.nbgv.requireVersionJson` | boolean | `true` | When `true`, `version.json` must exist for the repo to be considered an NBGV repo |

#### NBGV

```json
{
  "version": {
    "provider": "nbgv",
    "nbgv": {
      "useDocker": true,
      "dockerImage": "mcr.microsoft.com/dotnet/sdk:latest",
      "versionJsonFileName": "version.json",
      "allowToolRestore": true,
      "allowGlobalCommand": true
    }
  }
}
```

### Git-Height Versioning

Appends Git commit count to semantic versions for unique build identifiers:

```bash
# With mode: "git-height"
# package.json: "version": "0.1.0"
# Computed as: 0.1.0.<git-height>
# Output: 0.1.0.78
```

## Commands

| Command | Description |
| ------- | ----------- |
| `dock build` | Build Docker image with computed version |
| `dock ship` | Push built image to registry |
| `dock push` | Alias for `dock ship` |
| `dock all` | Build and ship |
| `dock version` | Show resolved version (JSON) |
| `dock tags` | Show generated image tags |
| `dock help` | Show available commands |

## Provider Catalog

### Built-in Providers

| Name | Source | Auto-detected when |
| --- | --- | --- |
| **nodejs** | `package.json` | `package.json` exists at repo root |
| **dotnet** | `.csproj` / `.vbproj` / `.fsproj` / `Directory.Build.props` / `AssemblyInfo.*` / `VersionInfo.*` | Any of those files are found |
| **nbgv** | Nerdbank.GitVersioning | `version.json` exists at repo root |
| **env** | `DOCKSHIP_VERSION` env var or inline config | `DOCKSHIP_VERSION` is set (last in chain), or a previously selected auto provider fails and env version input is available |

### External Providers

A third-party provider can be published as an npm package named `@agile-north/docker-ci-provider-<name>`. Install it and set `version.provider` to `<name>` — no `providerPackage` config needed:

```bash
npm install -D @agile-north/dockship-provider-python
```

```json
{
  "version": {
    "provider": "python",
    "python": {
      "mode": "git-height"
    }
  }
}
```

### Writing Your Own Provider

A provider is a CommonJS module that exports a single `resolveVersion(context)` function. You can ship it as an npm package or drop a file directly in your repo.

#### Provider contract

```js
// my-version-provider.cjs
"use strict";

module.exports = {
  resolveVersion(context) {
    // context fields:
    //   cwd           {string}  – working directory where dock was invoked
    //   repoRoot      {string}  – absolute path to the repo root (.git parent)
    //   buildConfig   {object}  – full merged dockship.json config
    //   providerName  {string}  – resolved name of this provider ("myprovider")
    //   providerConfig {object} – buildConfig.version.<providerName>
    //   env           {object}  – process.env (or injected env in tests)

    const version = context.env.MY_VERSION || "1.0.0";
    const [major, minor, patch = "0"] = version.split(".");

    return {
      source: "myprovider",         // required – identifies the provider
      version,                      // required – full version string (semver)
      full: `${major}.${minor}.${patch}`, // required – numeric part only
      major,                        // required
      minor,                        // required
      build: patch,
      suffix: "",                   // prerelease label incl. leading "-"
      semVer2: version,
      assemblyVersion: "",
      informationalVersion: "",
      nuGetPackageVersion: ""
    };
  }
};
```

All five required fields (`source`, `version`, `full`, `major`, `minor`) must be non-empty strings or dockship will throw. Use `normalizeVersionInfo` from `@agile-north/dockship/lib/version/model.cjs` to fill in defaults automatically:

```js
"use strict";
const { normalizeVersionInfo } = require("@agile-north/dockship/lib/version/model.cjs");

module.exports = {
  resolveVersion(context) {
    const version = context.providerConfig.version || context.env.MY_VERSION;
    if (!version) throw new Error("MY_VERSION is not set");

    return normalizeVersionInfo({ source: "myprovider", version });
  }
};
```

`normalizeVersionInfo` parses `major`, `minor`, `build`, `suffix`, and `semVer2` from `version` so you only need to supply what differs.

#### Provider config is passed through

Any keys you add under `version.<providerName>` in `dockship.json` are forwarded as `context.providerConfig` with no validation — use them for options specific to your provider:

```json
{
  "version": {
    "provider": "myprovider",
    "myprovider": {
      "providerPackage": "./.dockship/my-version-provider.cjs",
      "versionFile": "version.txt"
    }
  }
}
```

#### Provider resolution order

When `loadProvider` runs for a given name it tries in order:

1. **Bundled** – `lib/version/providers/<name>/index.cjs` inside dockship (built-ins only)
2. **Scoped npm** – `@agile-north/docker-ci-provider-<name>` (installed in the consumer repo)
3. **`providerPackage`** – value of `version.<name>.providerPackage`:
   - Relative path (`./…` or `../…`) → resolved from the **client repo root**
   - npm package name → resolved from `node_modules` as normal

#### Local file in the client repo

Drop the provider file anywhere in your repo — `.dockship/` is a natural home — and reference it with a relative path:

```text
your-repo/
├── .dockship/
│   ├── dockship.json
│   └── my-version-provider.cjs   ← provider lives here
```

```json
{
  "version": {
    "provider": "myprovider",
    "myprovider": {
      "providerPackage": "./.dockship/my-version-provider.cjs"
    }
  }
}
```

#### Publishing a provider package

Name the package `@agile-north/docker-ci-provider-<name>` so consumers can reference it by short name without `providerPackage`. The package entry point must export `resolveVersion(context)` as shown above.

## Private npm Setup

### GitHub Packages

Add `.npmrc` to your client repo:

```ini
@agile-north:registry=https://npm.pkg.github.com
always-auth=true
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

### Local Development Token

Set user-level env var (Windows PowerShell):

```powershell
[Environment]::SetEnvironmentVariable("NPM_TOKEN","<your-token>","User")
```

Then install:

```bash
npm i -D @agile-north/dockship
```

## CI/CD Integration

### TeamCity

```kotlin
steps {
    script {
        name = "Docker Build & Ship"
        scriptContent = """
            #!/usr/bin/env bash
            set -euo pipefail

            docker run --rm \
              -v "$PWD:/workspace" \
              -w /workspace \
              -v /var/run/docker.sock:/var/run/docker.sock \
              -e DOCKER_TARGET_REGISTRY \
              -e DOCKER_TARGET_REPOSITORY \
              -e DOCKER_PUSH_ENABLED \
              -e DOCKER_PUSH_BRANCHES \
              node:18-alpine \
              npx dock all
        """.trimIndent()
    }
}
```

### GitHub Actions

```yaml
- name: Docker Build & Ship
  run: npx dock all
  env:
    DOCKER_TARGET_REGISTRY: ${{ secrets.REGISTRY }}
    DOCKER_TARGET_REPOSITORY: my-org/my-app
    DOCKER_PUSH_ENABLED: true
    DOCKER_PUSH_BRANCHES: main,develop
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Examples

### Zero-Config Node.js Repo

If your repo has a `package.json`, you can often start with env only and no `.dockship/dockship.json`:

```bash
DOCKER_TARGET_REGISTRY=registry.example.com \
DOCKER_TARGET_REPOSITORY=my-org/my-app \
npx dock build
```

### Branch-Restricted Pushes

```json
{
  "docker": {
    "push": {
      "enabled": true,
      "branches": ["main", "develop", "release/*"]
    }
  }
}
```

### CI Build Without Retaining Local Images

Useful on self-hosted runners or long-lived agents that should build for validation but not accumulate Docker images locally:

```json
{
  "docker": {
    "target": {
      "registry": "ghcr.io",
      "repository": "my-org/my-app"
    },
    "push": {
      "enabled": false
    },
    "cleanup": {
      "local": true
    }
  }
}
```

Or configure it by env var in CI:

```bash
DOCKER_PUSH_ENABLED=false
DOCKER_CLEANUP_LOCAL=auto
npx dock build
```

`DOCKER_CLEANUP_LOCAL` accepts `auto`, `true`, or `false`.

### Monorepo Services

```json
{
  "docker": {
    "file": "services/api/Dockerfile",
    "context": "services/api",
    "target": {
      "repository": "my-org/api"
    }
  },
  "version": {
    "provider": "nodejs",
    "nodejs": {
      "packageJsonPath": "services/api/package.json"
    }
  }
}
```

### Full-Stack (Node.js Frontend + .NET Backend)

Use dockship once with multi-stage Dockerfile:

```dockerfile
FROM node:18 AS frontend
WORKDIR /app
COPY ClientApp .
RUN npm ci && npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend
WORKDIR /bff
COPY . .
RUN dotnet publish -o /publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
COPY --from=frontend /app/dist /app/dist
COPY --from=backend /publish /app
ENTRYPOINT ["dotnet", "Portal.dll"]
```

Version from Node.js:

```json
{
  "docker": {
    "target": {
      "repository": "my-org/portal"
    }
  },
  "version": {
    "provider": "nodejs",
    "nodejs": {
      "packageJsonPath": "ClientApp/package.json",
      "mode": "git-height"
    }
  }
}
```

### .NET Services

```json
{
  "version": {
    "provider": "dotnet",
    "dotnet": {
      "mode": "git-height",
      "autoDiscover": true
    }
  }
}
```

### NBGV Repo

```json
{
  "version": {
    "provider": "nbgv",
    "nbgv": {
      "useDocker": true,
      "dockerImage": "mcr.microsoft.com/dotnet/sdk:latest",
      "versionJsonFileName": "version.json",
      "allowToolRestore": true,
      "allowGlobalCommand": true
    }
  }
}
```

## Environment Variables

### Runtime

- `DOCKER_TARGET_REGISTRY` – override `docker.target.registry`
- `DOCKER_TARGET_REPOSITORY` – override `docker.target.repository`
- `DOCKERFILE_PATH` – override `docker.file`
- `DOCKER_CONTEXT` – override `docker.context`
- `DOCKER_PUSH_ENABLED` – "true"/"false", override `docker.push.enabled`
- `DOCKER_PUSH_BRANCHES` – comma/semicolon/newline separated branch patterns, supports `*`
- `DOCKER_TAG_LATEST` – "true"/"false", override `docker.tags.latest`
- `DOCKER_CLEANUP_LOCAL` – `auto`/`true`/`false`, remove locally built tags after `dock build` and `dock all`
- `DOCKER_RUNNER` – `build`/`buildx`/`auto`, override `docker.runner`
- `DOCKER_BUILD_TARGET` – override `docker.buildTarget` (`--target`)
- `DOCKER_BUILD_OUTPUT` – override `docker.buildOutput` (`--output`)
- `DOCKER_STAGES` – JSON object to override `docker.stages` for dynamic stage pipelines
- `DOCKER_PLATFORM` – override `docker.platform`
- `DOCKER_BUILD_ARGS` – build args as JSON (`{"ENV":"prod"}`) or semicolon-delimited `KEY=value;KEY2=value2`; overrides `docker.buildArgs`
- `NPM_TOKEN` – for private npm (if using @agile-north providers)

### Provider-Specific

- `NODEJS_VERSION_MODE` – override version mode (fixed/git-height)
- `PACKAGE_JSON_PATH` – override package.json location
- `DOTNET_VERSION_MODE` – override .NET version mode (fixed/git-height)
- `MAIN_ASSEMBLY_INFO_FILE_PATH` – explicit main AssemblyInfo file path
- `ASSEMBLY_INFO_FILE_PATHS` – comma/semicolon separated AssemblyInfo file paths
- `VERSION_INFO_FILE_PATHS` – comma/semicolon separated VersionInfo file paths
- `CSPROJ_FILE_PATHS` – comma/semicolon separated `.csproj` file paths
- `DOCKSHIP_VERSION` – explicit version string consumed by the `env` provider (also triggers `env` auto-detection when set)

## Troubleshooting

### "Provider not found"

- Check `version.provider` in `dockship.json` matches the installed provider name
- For `@agile-north` scoped packages: ensure it is installed (`npm ls @agile-north/docker-ci-provider-<name>`)
- For `providerPackage` relative paths: verify the path is relative to your **repo root** (e.g. `./.dockship/my-provider.cjs`)
- For `providerPackage` npm packages: verify the package is in `node_modules`

### "Could not auto-detect version provider"

- Add `.dockship/dockship.json` with `version.provider`
- Or add a supported version source file such as `version.json`, `package.json`, or a `.csproj`
- Or set the `DOCKSHIP_VERSION` env var to supply a version directly (activates the `env` provider as a last resort)

### "No version found"

- Verify version source file exists (package.json, .csproj, version.json)
- Check `version.provider` config and associated path settings are correct

### Docker login fails in CI

- Ensure `DOCKER_TARGET_REGISTRY` is set in env
- For private registries, either run `docker login` before build or provide `DOCKER_LOGIN_USERNAME` and `DOCKER_LOGIN_PASSWORD`

### Git height not incrementing

- Requires `.git` directory (not in Docker container by default)
- Mount repo root and git metadata, for example: `-v "$PWD:/workspace" -v "$PWD/.git:/workspace/.git"`

## License

MIT

---

Made by **NRTH** • [www.nrth.com](https://www.nrth.com)
