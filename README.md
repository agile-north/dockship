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
- It validates installability and npm package metadata using dry-run checks
- Configure branch protection on `main` and require status checks **CI / validate** and **PR Title / conventional-pr-title** before merge

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
```

## Configuration: dockship.json

### Docker Settings

The config file is optional. If `.dockship/dockship.json` is missing, dockship uses built-in defaults:

- `docker.file = "Dockerfile"`
- `docker.context = "."`
- `docker.push.enabled = false`
- `docker.push.branches = []`
- `docker.tags.latest = false`

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
    "push": {
      "enabled": false,                     // Enable/disable push
      "branches": ["main", "develop"]    // Optional: allowed branches, supports *
    },
    "tags": {
      "latest": false                       // Add 'latest' tag
    },
    "platform": "linux/amd64",            // Optional: build platform
    "buildArgs": { "ENV": "prod" }        // Optional: extra docker build args
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
| `docker.push.enabled` | boolean | `false` | `DOCKER_PUSH_ENABLED` | Enables pushing for `dock ship` and `dock all` |
| `docker.push.branches` | string[] | `[]` | `DOCKER_PUSH_BRANCHES` | Branch allow-list; supports `*` wildcards |
| `docker.tags.latest` | boolean | `false` | `DOCKER_TAG_LATEST` | Adds the `latest` tag in addition to semantic tags |
| `docker.platform` | string | empty | `DOCKER_PLATFORM` | Passed to `docker build --platform` |
| `docker.buildArgs` | object | `{}` | `DOCKER_BUILD_ARGS` | Key/value pairs passed as `--build-arg KEY=value`; appended before the auto-generated `APP_VERSION` build arg. Env var accepts JSON (`{"K":"v"}`) or semicolon-delimited `KEY=value;KEY2=value2` |

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
- `docker.pushEnabled` → `docker.push.enabled`
- `docker.pushBranches` → `docker.push.branches`
- `docker.tagLatest` → `docker.tags.latest`

Environment variable overrides (CI):

- `DOCKER_TARGET_REGISTRY`
- `DOCKER_TARGET_REPOSITORY`
- `DOCKER_PUSH_ENABLED`
- `DOCKER_PUSH_BRANCHES`
- `DOCKER_TAG_LATEST`

### Version Providers

`version.provider` supports `"auto"`, `"nodejs"`, `"dotnet"`, and `"nbgv"`.

When `version.provider` is `"auto"`, dockship uses this order:

1. `version.json` → `nbgv`
2. `package.json` → `nodejs`
3. `.csproj`, `AssemblyInfo.cs`, or `VersionInfo.cs` → `dotnet`

If no config file exists, dockship uses `"auto"` by default.

#### Version option reference

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `version.provider` | string | `auto` | Version provider name. Use `auto`, `nodejs`, `dotnet`, `nbgv`, or a custom provider name |
| `version.<provider>.providerPackage` | string | empty | For custom providers, npm package name to load |

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
| `version.dotnet.csprojFilePaths` | string[] | `[]` | `CSPROJ_FILE_PATHS` | Explicit `.csproj` file paths |
| `version.dotnet.autoDiscover` | boolean | `true` | none | When `true`, scans the repo for `.csproj`, `VersionInfo.cs`, and `AssemblyInfo.cs` if explicit paths are not provided |

#### .NET / C\#

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

- **nodejs** – reads from `package.json`
- **dotnet** – auto-discovers `.csproj`, `VersionInfo.cs`, `AssemblyInfo.cs`
- **nbgv** – NBGV (Nerdbank.GitVersioning)

### External Providers

Extend with custom version providers by installing separate packages:

```bash
npm install -D @agile-north/dockship-provider-python
```

Reference in `dockship.json`:

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

### Custom Package Provider

Use a private/custom provider:

```json
{
  "version": {
    "provider": "myversion",
    "myversion": {
      "providerPackage": "@acme/version-provider",
      "customOption": "value"
    }
  }
}
```

Provider must export:

```javascript
// @acme/version-provider/index.cjs
module.exports = {
  resolveVersion(context) {
    // context.repoRoot, context.providerConfig, etc.
    return {
      source: "myversion",
      version: "1.0.0",
      full: "1.0.0",
      major: "1",
      minor: "0",
      build: "0",
      suffix: "",
      semVer2: "1.0.0",
      assemblyVersion: "",
      informationalVersion: "",
      nuGetPackageVersion: ""
    };
  }
};
```

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

## Troubleshooting

### "Provider not found"

- Check `version.provider` in `dockship.json` matches an installed provider name
- For external: ensure installed with `npm ls @agile-north/dockship-provider-<name>`

### "Could not auto-detect version provider"

- Add `.dockship/dockship.json` with `version.provider`
- Or add a supported version source file such as `version.json`, `package.json`, or a `.csproj`

### "No version found"

- Verify version source file exists (package.json, .csproj, version.json)
- Check `version.provider` config and associated path settings are correct

### Docker login fails in CI

- Ensure `DOCKER_TARGET_REGISTRY` is set in env
- For private registries, use `docker login` step before build

### Git height not incrementing

- Requires `.git` directory (not in Docker container by default)
- Mount repo root and git metadata, for example: `-v "$PWD:/workspace" -v "$PWD/.git:/workspace/.git"`

## License

MIT

---

Made by **NRTH** • [www.nrth.com](https://www.nrth.com)
