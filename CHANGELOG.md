# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Changed

* refactor Docker config to nested sections: `docker.target`, `docker.push`, and `docker.tags`
* add branch-based push filtering via `docker.push.branches` and `DOCKER_PUSH_BRANCHES`
* rename `docker.dockerfile` to `docker.file` in the preferred config shape
* make `.dockship/dockship.json` optional by using built-in defaults
* add `version.provider = "auto"` with automatic NBGV, Node.js, and .NET detection
* redesign `docker.buildArgs` from a raw CLI string to a structured `{ KEY: value }` object
* `DOCKER_BUILD_ARGS` env var accepts JSON (`{"KEY":"val"}`) or semicolon-delimited `KEY=value;KEY2=value2` — format is auto-detected
* legacy raw string value for `docker.buildArgs` is still accepted as a compatibility alias
* nbgv provider now runs inside a Docker container by default (`version.nbgv.useDocker: true`) — no .NET SDK required on the host; falls back to host dotnet/nbgv when Docker is unavailable

### Migration

Legacy flat keys are still supported as compatibility aliases:

* `docker.dockerfile` → `docker.file`
* `docker.targetRegistry` → `docker.target.registry`
* `docker.targetRepository` → `docker.target.repository`
* `docker.pushEnabled` → `docker.push.enabled`
* `docker.pushBranches` → `docker.push.branches`
* `docker.tagLatest` → `docker.tags.latest`

## [1.6.0](https://github.com/agile-north/dockship/compare/v1.5.0...v1.6.0) (2026-03-22)


### Features

* add JSON output contract and CLI envelope mode ([ba5222e](https://github.com/agile-north/dockship/commit/ba5222e46e4a1931f6aad70780656a868281e9df))
* add JSON output contract and CLI envelope mode ([3648d1a](https://github.com/agile-north/dockship/commit/3648d1a7a537b3fdf9b8485bb70f8c4b0863f296))

## [1.5.0](https://github.com/agile-north/dockship/compare/v1.4.1...v1.5.0) (2026-03-22)


### Features

* **cli:** auto-clean local images in CI builds ([f0d0f20](https://github.com/agile-north/dockship/commit/f0d0f2013a520d2832cdf06ab66818f92b2f878e))

## [1.4.1](https://github.com/agile-north/dockship/compare/v1.4.0...v1.4.1) (2026-03-22)


### Documentation

* **readme:** document npx usage without install ([a152781](https://github.com/agile-north/dockship/commit/a1527818c7f89f0f3130dfeb96edac136f03a84a))

## [1.4.0](https://github.com/agile-north/dockship/compare/v1.3.0...v1.4.0) (2026-03-22)


### Features

* **version:** improve provider extensibility and auto env fallback ([98e8f1f](https://github.com/agile-north/dockship/commit/98e8f1fb0a39514e07d4fe3b4fa55c5bdaa1fdf2))

## [1.3.0](https://github.com/agile-north/dockship/compare/v1.2.0...v1.3.0) (2026-03-22)


### Features

* **cli:** add comprehensive help command and flags ([90f5a46](https://github.com/agile-north/dockship/commit/90f5a46410ac35666f3fe9f6c9e3789eb012a716))

## [1.2.0](https://github.com/agile-north/dockship/compare/v1.1.5...v1.2.0) (2026-03-22)


### Features

* structured buildArgs, nbgv docker execution, and config improvements ([f9408d0](https://github.com/agile-north/dockship/commit/f9408d0f650cba1fa97cc250c57ac4f6835a10ba))

## [1.1.5](https://github.com/agile-north/dockship/compare/v1.1.4...v1.1.5) (2026-03-20)


### Bug Fixes

* use inputs.dist_tag presence to detect workflow_call stable publish ([700f826](https://github.com/agile-north/dockship/commit/700f82678bc7f0d0c34deb5fc5026652cf5c0dfb))

## [1.1.4](https://github.com/agile-north/dockship/compare/v1.1.3...v1.1.4) (2026-03-20)


### Bug Fixes

* use workflow_call to trigger publish from release-please ([cd46bb1](https://github.com/agile-north/dockship/commit/cd46bb1c0fad02db885e825abe2875bbd846ba8e))

## [1.1.3](https://github.com/agile-north/dockship/compare/v1.1.2...v1.1.3) (2026-03-20)


### Bug Fixes

* consolidate publishing into publish-npm.yml via release event trigger ([bce0711](https://github.com/agile-north/dockship/commit/bce07116e924c09c760de4e871d7c55b016ccfd9))
* publish from release-please workflow on release creation ([f44b8f0](https://github.com/agile-north/dockship/commit/f44b8f0c26d3c1fe4cd3022ad3ee94e1b89e68b9))

## [1.1.2](https://github.com/agile-north/dockship/compare/v1.1.1...v1.1.2) (2026-03-20)


### Bug Fixes

* resolve version worker from installed package path ([29c1cb5](https://github.com/agile-north/dockship/commit/29c1cb52e408d040b68dae65c3b3bc32b0d822e7))

## [1.1.1](https://github.com/agile-north/dockship/compare/v1.1.0...v1.1.1) (2026-03-20)


### Bug Fixes

* correct bash quote escaping in publish-npm workflow ([9b1c4cf](https://github.com/agile-north/dockship/commit/9b1c4cfdc2b1e05b6f374426674d905c33ad6ada))

## [1.1.0](https://github.com/agile-north/dockship/compare/dockship-v1.0.0...dockship-v1.1.0) (2026-03-20)


### Features

* initial release of @agile-north/dockship 1.0.0 ([5e55198](https://github.com/agile-north/dockship/commit/5e55198026809b531919dfa7b9a7878f90021aa6))


### Bug Fixes

* add markdown lint fixes to copilot-instructions.md ([8efd024](https://github.com/agile-north/dockship/commit/8efd024726b25a8687ee3fcb2a931dc11b3c9adc))

## [1.0.0] - 2026-03-20

### Added

- Initial release of `@agile-north/dockship`
- `dock build` — build Docker image with computed version tags
- `dock ship` / `dock push` — push image to target registry
- `dock all` — build and push in one step
- `dock version` — print resolved version as JSON
- `dock tags` — print generated image tags as JSON
- `dock help` — print available commands
- Version providers: `nodejs`, `dotnet`, `nbgv`
- Git-height versioning mode for all built-in providers
- Environment variable overrides for all Docker settings
- `.env` file support (CI env vars take precedence)
- External and custom version provider support via npm packages
- GitHub Actions workflows for CI validation and automated npm publishing
- Branch-based publish channels: `main` → `latest`, `develop` → `next`

[1.0.0]: https://github.com/agile-north/dockship/releases/tag/v1.0.0
