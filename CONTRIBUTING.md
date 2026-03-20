# Contributing to dockship

Thank you for your interest in contributing! This document explains how to get
started and what we expect from contributors.

## Repository

<https://github.com/agile-north/dockship>

## Getting started

```bash
git clone https://github.com/agile-north/dockship.git
cd dockship
npm install
```

## Branch model

| Branch      | Purpose                    |
| ----------- | -------------------------- |
| `main`      | Stable, published releases |
| `develop`   | Integration / prerelease   |
| `feature/*` | Individual feature work    |

Work on a `feature/*` branch and open a pull request targeting **`develop`**.

## Pull requests

1. Fork the repo and create your branch from `develop`.
2. Keep changes focused — one concern per PR.
3. Ensure CI passes before requesting review (markdown lint + npm metadata checks).
4. Update [CHANGELOG.md](CHANGELOG.md) under the `[Unreleased]` section.
5. PRs into `develop` are merged by maintainers; `develop` → `main` releases are gated.
6. When you're ready to release, merge into `main` and release-please will handle versioning (see [README.md](README.md#version-management)).

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add custom registry support
fix: resolve version path on Windows
docs: clarify git-height mode
chore: bump node engine floor
```

## Reporting bugs

Open an issue at <https://github.com/agile-north/dockship/issues>.

Include:

- dockship version (`npm ls @nrth/dockship`)
- Node.js version (`node -v`)
- Minimal reproduction steps

## Code style

- CommonJS (`.cjs`) modules — no ESM changes without discussion
- No external runtime dependencies — keep the package zero-dependency
- Keep functions small and named clearly

## License

By contributing you agree your work is licensed under the [MIT License](LICENSE).
