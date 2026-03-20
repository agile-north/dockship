# dockship

Opinionated Docker image versioning, building, and publishing for CI/CD pipelines.

[![npm version](https://img.shields.io/npm/v/%40agile-north%2Fdockship?logo=npm)](https://www.npmjs.com/package/@agile-north/dockship)
[![npm downloads](https://img.shields.io/npm/dm/%40agile-north%2Fdockship?logo=npm)](https://www.npmjs.com/package/@agile-north/dockship)
[![license](https://img.shields.io/npm/l/%40agile-north%2Fdockship)](https://github.com/agile-north/dockship/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/%40agile-north%2Fdockship?logo=node.js)](https://www.npmjs.com/package/@agile-north/dockship)
[![CI](https://github.com/agile-north/dockship/actions/workflows/ci.yml/badge.svg)](https://github.com/agile-north/dockship/actions/workflows/ci.yml)
[![Publish to npm](https://github.com/agile-north/dockship/actions/workflows/publish-npm.yml/badge.svg)](https://github.com/agile-north/dockship/actions/workflows/publish-npm.yml)

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

This repo includes a publish workflow at `.github/workflows/publish-npm.yml`.

- Triggers on pushes to `develop` and Git tags like `v1.2.3` (created automatically by release-please)
- Can also be run manually with **workflow_dispatch**
- Skips publishing when that exact package version already exists on npm

## Version management

Versioning is automated by [release-please](https://github.com/googleapis/release-please)
via `.github/workflows/release-please.yml`.

How it works:

1. Merge PRs into `main` using [Conventional Commits](https://www.conventionalcommits.org/) (see [CONTRIBUTING.md](CONTRIBUTING.md))
2. release-please detects `feat:`, `fix:`, `perf:` commits and opens a **Release PR** that bumps `package.json` version and updates `CHANGELOG.md`
3. Review and merge the Release PR
4. release-please creates a `v*.*.*` tag, which triggers the publish workflow and pushes to npm `latest`

Version bump rules (SemVer):

- `feat:` commits → minor bump (`0.1.0` → `0.2.0`)
- `fix:` / `perf:` commits → patch bump (`0.1.0` → `0.1.1`)
- `feat!:` / `BREAKING CHANGE:` footer → major bump (`0.1.0` → `1.0.0`)

Branch/channel behavior:

- `v*.*.*` tag (from Release PR merge) → stable publish to npm `latest`
- `develop` push → prerelease publish to npm `next` (`X.Y.Z-dev.<run>.<sha>`)
- manual `workflow_dispatch` → only `main` (stable) or `develop` (prerelease); other refs are rejected

Allowed publish routes (enforced):

- Push tag matching `v*.*.*` (release-please) → stable publish
- Push to `develop` → prerelease publish
- Manual run on `main` or `develop` only → stable/prerelease respectively
- Direct push to `main` → not a publish route

CI validation:

- `.github/workflows/ci.yml` runs on PRs and pushes to `main`, `develop`, and `feature/**`
- It validates installability and npm package metadata using dry-run checks
- Configure branch protection on `main` and require status check **CI / validate** before merge

Authentication options:

- Trusted publishing (recommended): configure this GitHub repo as a trusted publisher in npm settings; no `NPM_TOKEN` secret is required.
- Token-based publishing: create an npm automation token and add it as repository secret `NPM_TOKEN`.

## Quick Start

**1. Create `.dockship/dockship.json`**

```json
{
  "docker": {
    "dockerfile": "Dockerfile",
    "context": ".",
    "targetRegistry": "registry.example.com",
    "targetRepository": "my-org/my-app",
    "pushEnabled": false,
    "tagLatest": false
  },

  "version": {
    "provider": "nodejs",
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

```json
{
  "docker": {
    "dockerfile": "Dockerfile",           // Path to Dockerfile
    "context": ".",                        // Build context
    "targetRegistry": "registry.io",       // Docker registry
    "targetRepository": "org/app",         // Image repository
    "pushEnabled": false,                  // Enable/disable push
    "tagLatest": false,                    // Add 'latest' tag
    "platform": "linux/amd64",             // Optional: build platform
    "buildArgs": "--build-arg ENV=prod"    // Optional: extra docker args
  }
}
```

Environment variable overrides (CI):

- `DOCKER_TARGET_REGISTRY`
- `DOCKER_TARGET_REPOSITORY`
- `DOCKER_PUSH_ENABLED`
- `DOCKER_TAG_LATEST`

### Version Providers

#### Node.js (npm)

```json
{
  "version": {
    "provider": "nodejs",
    "nodejs": {
      "packageJsonPath": "package.json",
      "mode": "fixed"  // or "git-height"
    }
  }
}
```

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

#### NBGV

```json
{
  "version": {
    "provider": "nbgv",
    "nbgv": {
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
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Examples

### Monorepo Services

```json
{
  "docker": {
    "dockerfile": "services/api/Dockerfile",
    "context": "services/api",
    "targetRepository": "my-org/api"
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
    "targetRepository": "my-org/portal"
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

## Environment Variables

### Runtime

- `DOCKER_TARGET_REGISTRY` – override registry in dockship.json
- `DOCKER_TARGET_REPOSITORY` – override repository
- `DOCKER_PUSH_ENABLED` – "true"/"false", override push setting
- `DOCKER_TAG_LATEST` – "true"/"false", add latest tag
- `NPM_TOKEN` – for private npm (if using @agile-north providers)

### Provider-Specific

- `NODEJS_VERSION_MODE` – override version mode (fixed/git-height)
- `PACKAGE_JSON_PATH` – override package.json location

## Troubleshooting

### "Provider not found"

- Check `version.provider` in `dockship.json` matches an installed provider name
- For external: ensure installed with `npm ls @agile-north/dockship-provider-<name>`

### "No version found"

- Verify version source file exists (package.json, .csproj, version.json)
- Check `version.provider` config and associated path settings are correct

### Docker login fails in CI

- Ensure `DOCKER_TARGET_REGISTRY` is set in env
- For private registries, use `docker login` step before build

### Git height not incrementing

- Requires `.git` directory (not in Docker container by default)
- Mount repo root: `-v "$PWD:/workspace -v "$PWD/.git:/workspace/.git`

## License

MIT

---

Made by **NRTH** • [www.nrth.com](https://www.nrth.com)
