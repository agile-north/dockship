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

## [1.10.4](https://github.com/agile-north/dockship/compare/v1.10.3...v1.10.4) (2026-04-23)


### Bug Fixes

* Preserve prerelease suffixes on generated Docker major and major.minor tags ([ec6ebeb](https://github.com/agile-north/dockship/commit/ec6ebeb913845e35e937470ecb7c4627eaf24cbc))

## [1.10.3](https://github.com/agile-north/dockship/compare/v1.10.2...v1.10.3) (2026-03-24)


### Bug Fixes

* keep stdout empty for file-output JSON path and adjust tests ([9e0989a](https://github.com/agile-north/dockship/commit/9e0989a6aae96df6a8c2cddbae391a9991304161))
* keep stdout empty for file-output JSON path and adjust tests ([c2473ea](https://github.com/agile-north/dockship/commit/c2473ea50b76b1a338b642e8ca906f3ee9e54823))

## [1.10.2](https://github.com/agile-north/dockship/compare/v1.10.1...v1.10.2) (2026-03-24)


### Bug Fixes

* Enhance output options for JSON mode and file writing ([ddd4128](https://github.com/agile-north/dockship/commit/ddd41284f6ca6e59972e89477221c2b6df4741f0))
* keep stdout normal when writing JSON envelope to file ([53365ac](https://github.com/agile-north/dockship/commit/53365ac5c41281ecc3cd02420c1f6ae4e8d3c62d))

## [1.10.1](https://github.com/agile-north/dockship/compare/v1.10.0...v1.10.1) (2026-03-24)


### Bug Fixes

* make --output-file / --json-file imply JSON mode and write to file ([#30](https://github.com/agile-north/dockship/issues/30)) ([ee19cd4](https://github.com/agile-north/dockship/commit/ee19cd49ccfda35290e295d9900567200922a6c9))

## [1.10.0](https://github.com/agile-north/dockship/compare/v1.9.2...v1.10.0) (2026-03-24)


### Features

* add --output-file/--json-file support for JSON mode; preserve stdout logs ([8cd7726](https://github.com/agile-north/dockship/commit/8cd77267e4d045620da8b7c8e87d3f599875b55e))
* Enhance cleanup behavior and add JSON output file support ([265cc7e](https://github.com/agile-north/dockship/commit/265cc7e9091297ca9a6483711efcd66e016002cb))

## [1.9.2](https://github.com/agile-north/dockship/compare/v1.9.1...v1.9.2) (2026-03-23)


### Bug Fixes

* stage-all cleanup behavior & ensure post-push local cleanup is explicit ([#26](https://github.com/agile-north/dockship/issues/26)) ([40cf6d0](https://github.com/agile-north/dockship/commit/40cf6d0c6b9971f742982ff93a8650c7318ff88a))

## [1.9.1](https://github.com/agile-north/dockship/compare/v1.9.0...v1.9.1) (2026-03-23)


### Bug Fixes

* ignore no such image in docker cleanup and add regression test ([0f3c172](https://github.com/agile-north/dockship/commit/0f3c172d849b542f9359018ea0092ef23b6bf464))
* ignore no such image in docker cleanup and add regression test ([e45cdae](https://github.com/agile-north/dockship/commit/e45cdae2ea8ba655751cdf221ae7313707b622bc))

## [1.9.0](https://github.com/agile-north/dockship/compare/v1.8.0...v1.9.0) (2026-03-23)


### Features

* add target alias for stage and stage-all fallback behavior ([3c8daca](https://github.com/agile-north/dockship/commit/3c8dacaba0e7ed9b6d7295bbca43fb619eb9d43a))
* Enhance Docker runner with auto mode and stage-based builds ([18ba17a](https://github.com/agile-north/dockship/commit/18ba17a0b3559e539abdda4befc97d72ccdb1cb7))

## [1.8.0](https://github.com/agile-north/dockship/compare/v1.7.0...v1.8.0) (2026-03-23)


### Features

* Add stage-based Docker build flow with auto mode and buildx support ([#20](https://github.com/agile-north/dockship/issues/20)) ([7d16b1a](https://github.com/agile-north/dockship/commit/7d16b1a1e72b5b98d4eb56840a67c75612db0d9f))

## [1.7.0](https://github.com/agile-north/dockship/compare/v1.6.0...v1.7.0) (2026-03-23)


### Features

* add docker runner auto mode with buildx fallback ([#18](https://github.com/agile-north/dockship/issues/18)) ([946f953](https://github.com/agile-north/dockship/commit/946f953512b71b0ddb85389a026dd9e70706508a))

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
