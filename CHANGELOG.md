# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1](https://github.com/agile-north/dockship/compare/v1.1.0...v1.1.1) (2026-03-20)


### Bug Fixes

* correct bash quote escaping in publish-npm workflow ([9b1c4cf](https://github.com/agile-north/dockship/commit/9b1c4cfdc2b1e05b6f374426674d905c33ad6ada))

## [1.1.0](https://github.com/agile-north/dockship/compare/dockship-v1.0.0...dockship-v1.1.0) (2026-03-20)


### Features

* initial release of @nrth/dockship 1.0.0 ([5e55198](https://github.com/agile-north/dockship/commit/5e55198026809b531919dfa7b9a7878f90021aa6))


### Bug Fixes

* add markdown lint fixes to copilot-instructions.md ([8efd024](https://github.com/agile-north/dockship/commit/8efd024726b25a8687ee3fcb2a931dc11b3c9adc))

## [Unreleased]

## [1.0.0] - 2026-03-20

### Added

- Initial release of `@nrth/dockship`
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

[unreleased]: https://github.com/agile-north/dockship/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/agile-north/dockship/releases/tag/v1.0.0
