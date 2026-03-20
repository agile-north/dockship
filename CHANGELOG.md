# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
