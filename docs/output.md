# Dockship CLI JSON Output Specification

## Overview

This specification defines the **machine-readable JSON output contract** for all Dockship CLI commands.

This is a living document. Contract versioning is represented by `schemaVersion` in the envelope.

The goals are:

- Provide a **stable, CI-agnostic interface**
- Separate **artifact data** from **operation results**
- Ensure **zero string reconstruction** is required by consumers
- Support future extensions (multi-arch, signing, provenance, etc.)

---

## Top-Level Envelope

All commands MUST return the following structure:

```json
{
  "schemaVersion": "1",
  "command": "build",
  "outputMode": "json",
  "success": true,
  "status": "success",
  "timestamp": "2026-03-22T18:23:51.127Z",
  "durationMs": 1234,

  "tool": {
    "name": "dockship",
    "version": "1.5.0"
  },

  "context": {
    "repoRoot": "/workspace/app",
    "git": {
      "branch": "main",
      "branchSource": "env",
      "commit": "a1b2c3d",
      "repository": "org/repo",
      "remoteUrl": "https://github.com/org/repo.git"
    }
  },

  "result": {},

  "warnings": [],
  "errors": []
}
```

Status enum:

- success
- skipped
- partial
- failed

Status rules:

- success=true when status is success or skipped
- success=false when status is partial or failed
- skipped MUST indicate no work performed
- partial MUST indicate mixed success and failure
- failed MUST indicate no successful outcome

Transport rules:

- In JSON mode, stdout MUST contain exactly one JSON object and no extra text unless an explicit file output is enabled.
- When CLI is run with `--output-file` or `--json-file`, the JSON envelope MUST be written to that file and stdout MUST be free for human logs.
- stderr MAY contain diagnostics and operational logs.

---

## Core Concepts

### Artifact

Represents the **built/published container image**.

### Operation

Represents **what the command did** (build, push, skip, etc.).

Operation type values:

- build
- push
- ship
- tag
- plan

### Exit Codes

- 0 for status success or skipped
- 1 for status partial or failed
- 2 for CLI usage errors (unknown command, invalid flag)

When possible, usage errors SHOULD still emit the JSON envelope in JSON mode.

---

## Artifact Schema

The artifact structure is **canonical and reused across commands**.

```json
{
  "version": "1.4.2",
  "id": "registry.example.com/client/my-app@sha256:abc123...",

  "image": {
    "registry": "registry.example.com",
    "repository": "client/my-app",

    "reference": "registry.example.com/client/my-app:1.4.2",
    "primaryTag": "1.4.2",
    "tag": "1.4.2",

    "tags": [
      "1.4.2",
      "1.4",
      "1",
      "latest"
    ],

    "references": [
      "registry.example.com/client/my-app:1.4.2",
      "registry.example.com/client/my-app:1.4",
      "registry.example.com/client/my-app:1",
      "registry.example.com/client/my-app:latest"
    ],

    "digest": {
      "value": "sha256:abc123...",
      "reference": "registry.example.com/client/my-app@sha256:abc123..."
    }
  }
}
```

### Rules

- `reference` MUST be the **primary tag reference**
- `digest.reference` MUST be **fully qualified and ready for use**
- `tags` MUST NOT include registry/repository
- `references` MUST include full image references when registry/repository are known
- `references` MAY be empty when registry/repository are unavailable
- `digest.value` MAY be null if not yet pushed
- `id` MUST equal `image.digest.reference` when digest is available
- `id` MAY be null when digest is unavailable
- `tag` is a legacy alias for `primaryTag`; new integrations SHOULD use `primaryTag`

---

## Command Outputs

---

### version

Returns version information only.

```json
{
  "source": "nodejs",
  "version": "1.4.2",
  "full": "1.4.2",
  "major": "1",
  "minor": "4",
  "build": "2",
  "patch": "2",
  "suffix": "",
  "components": {
    "major": "1",
    "minor": "4",
    "patch": "2",
    "suffix": ""
  }
}
```

Compatibility rule:

- `source`, `version`, `full`, `major`, `minor`, `build`, and `suffix` preserve current provider contract fields.
- `components` is additive convenience data.
- `patch` is the modern top-level name for the third numeric segment.
- `build` and `patch` MUST always be present and MUST have identical values.
- `components.patch` MUST equal top-level `patch` and `build`.

---

### tags

Returns computed tags and references.

```json
{
  "artifact": { ... },
  "latestIncluded": true
}
```

Tags include semantic tags and optional alias tags based on policy settings. Some alias rules can also rewrite the existing semantic tags themselves using `tagPrefix`, `tagSuffix`, `tagMaxLength`, or `tagNonPublicPrefix`.

The optional `docker.aliases.sanitize` setting controls whether built-in branch aliases and rule-generated alias tags are sanitized after any prefix/suffix formatting is applied. Rule-level `sanitize` behaves the same way for alias tags and does not affect semantic tag transforms created by `tagPrefix` or `tagSuffix`.

---

### plan

Computes deterministic behavior without mutating Docker state.

```json
{
  "artifact": { ... },
  "plan": {
    "branch": "feature/demo",
    "branchSource": "env",
    "branchClass": "non-public",
    "buildType": "non-public",
    "buildTypeSource": "branch.classification",
    "nonPublicGuardrailApplied": true,
    "tagKinds": ["full", "majorMinor", "major"],
    "push": {
      "enabled": true,
      "eligible": false,
      "reason": "non_public_denied",
      "allowedBranches": ["main", "release/*"]
    },
    "inputs": {
      "version": {
        "value": "1.4.2",
        "full": "1.4.2",
        "suffix": "",
        "hasSuffix": false
      },
      "explicitPublicBuild": null,
      "nonPublicMode": "",
      "aliases": {
        "branch": false,
        "sanitizedBranch": false,
        "sanitize": false,
        "prefix": "",
        "suffix": "",
        "maxLength": 0,
        "nonPublicPrefix": "np-",
        "rulesConfigured": 2
      },
      "tagPolicy": {
        "public": ["full", "majorMinor", "major"],
        "nonPublic": ["full", "majorMinor", "major"]
      },
      "pushPolicy": {
        "enabled": true,
        "denyNonPublicPush": false,
        "allowedBranches": ["main", "release/*"]
      }
    },
    "tagComputation": {
      "tags": ["1.4.2", "1", "1.4", "np-feat-feature-new-api"],
      "effectiveSuffix": "",
      "tagKinds": ["full", "majorMinor", "major"],
      "aliases": ["np-feat-feature-new-api"]
    },
    "aliasPolicy": {
      "enabled": true,
      "selectionMode": "first-match-wins",
      "selectedRuleId": "feature-rule",
      "nonPublicPrefixApplied": true,
      "globalFormatting": {
        "prefix": "",
        "suffix": "",
        "maxLength": 0,
        "nonPublicPrefix": "np-"
      },
      "rules": [
        {
          "id": "release-rule",
          "match": "release/*",
          "type": "wildcard",
          "valid": true,
          "matched": false,
          "selected": false,
          "captures": [],
          "baseCandidates": [],
          "aliases": []
        },
        {
          "id": "feature-rule",
          "match": "feature/*",
          "type": "wildcard",
          "valid": true,
          "matched": true,
          "selected": true,
          "captures": [],
          "baseCandidates": ["feat-feature-new-api"],
          "aliases": ["np-feat-feature-new-api"]
        }
      ]
    },
    "branchMatching": {
      "public": {
        "configured": true,
        "matched": false,
        "matchedPatterns": [],
        "invalidPatterns": []
      },
      "nonPublic": {
        "configured": true,
        "matched": true,
        "matchedPatterns": ["feature/*"],
        "invalidPatterns": []
      },
      "pushAllowed": {
        "configured": true,
        "matched": false,
        "matchedPatterns": [],
        "invalidPatterns": []
      }
    },
    "decisionTrace": {
      "buildTypeFrom": "branch.classification",
      "branchClassResolved": "non-public",
      "guardrailApplied": true,
      "pushEligible": false,
      "pushSkipReason": "non_public_denied"
    }
  },
  "metadata": {
    "platforms": [],
    "runner": "build"
  }
}
```

Pattern matching notes:

- wildcard patterns support `*`
- regex patterns are supported using `regex:` prefix, for example `regex:^release\/\d+\.\d+$`
- invalid regex patterns are reported under `branchMatching.*.invalidPatterns`
- alias rule evaluation trace (including non-matches) is reported under `plan.aliasPolicy.rules`
- alias rules are case-sensitive by default and may opt into case-insensitive matching with `caseInsensitive: true`
- alias rule templates support `$BRANCH`, `$BRANCH_SANITIZED`, `$0` (entire matched value), and regex captures `$1..$9`
- rules that only use `tagPrefix`/`tagSuffix`/`tagMaxLength`/`tagNonPublicPrefix` rewrite semantic version tags without emitting branch aliases

---

### build

Builds the Docker image locally.

```json
{
  "artifact": { ... },

  "operation": {
    "type": "build",
    "performed": true,

    "policy": {
      "buildType": "public",
      "buildTypeSource": "version.suffix",
      "branchClass": "none",
      "nonPublicGuardrailApplied": false,
      "effectiveSuffix": "",
      "tagKinds": ["full", "majorMinor", "major"],
      "pushEnabled": false,
      "denyNonPublicPush": false,
      "pushEligible": false,
      "pushSkipReason": "push_disabled"
    },

    "cleanup": {
      "enabled": true,
      "removedReferences": [
        "registry.example.com/client/my-app:1.4.2"
      ]
    }
  },

  "metadata": {
    "platforms": ["linux/amd64"],
    "runner": "build"
  }
}
```

Notes:

- `digest` will typically be `null`
- cleanup refers to local image removal
- `metadata.runner` is the effective runner used (`build` or `buildx`), including when configuration is `auto`

---

### push / ship

Pushes image to registry.

```json
{
  "artifact": { ... },

  "operation": {
    "type": "push",
    "performed": true,
    "skipped": false,
    "skipReason": null,

    "push": {
      "requestedReferences": [
        "registry.example.com/client/my-app:1.4.2"
      ],
      "pushedReferences": [
        "registry.example.com/client/my-app:1.4.2"
      ],
      "failedReferences": []
    },

    "policy": {
      "pushEnabled": true,
      "denyNonPublicPush": false,
      "buildType": "public",
      "buildTypeSource": "version.suffix",
      "branchClass": "none",
      "nonPublicGuardrailApplied": false,
      "branch": "main",
      "branchSource": "env",
      "inputBranch": "refs/heads/main",
      "pushEligible": true,
      "pushSkipReason": null
    }
  },

  "metadata": {
    "platforms": ["linux/amd64"],
    "runner": "build"
  }
}
```

Rules:

- `operation.type` MUST be `push` for `push` and `ship` for `ship`.
- `operation.policy.branch` is the evaluated branch value used for push policy decisions.
- `context.git.branch` is the detected git context branch and may differ in edge CI environments.
- If `operation.push.failedReferences` is non-empty and `operation.push.pushedReferences` is non-empty, status MUST be `partial`.
- If `operation.push.failedReferences` is non-empty and `operation.push.pushedReferences` is empty, status MUST be `failed`.
- If any `operation.push.requestedReferences` are missing from both `operation.push.pushedReferences` and `operation.push.failedReferences`, status MUST be `failed`.
- `operation.skipReason` MAY be `non_public_denied` when push policy blocks non-public artifacts.

---

### tag

Adds computed secondary tags to an existing local image reference.

```json
{
  "artifact": { ... },
  "operation": {
    "type": "tag",
    "performed": true,
    "sourceReference": "registry.example.com/client/my-app:1.4.2",
    "tag": {
      "requestedReferences": ["registry.example.com/client/my-app:1"],
      "taggedReferences": ["registry.example.com/client/my-app:1"],
      "failedReferences": []
    },
    "policy": {
      "buildType": "public",
      "buildTypeSource": "version.suffix",
      "branchClass": "none",
      "nonPublicGuardrailApplied": false,
      "effectiveSuffix": "",
      "tagKinds": ["full", "majorMinor", "major"],
      "pushEnabled": false,
      "denyNonPublicPush": false,
      "pushEligible": false,
      "pushSkipReason": "push_disabled"
    }
  },
  "metadata": {
    "platforms": [],
    "runner": "build"
  }
}
```

---

### all

Runs build + push.

```json
{
  "artifact": { ... },

  "steps": {
    "build": {
      "durationMs": 800,
      "artifact": { ... },
      "operation": { ... },
      "metadata": { ... }
    },

    "push": {
      "durationMs": 400,
      "artifact": { ... },
      "operation": { ... },
      "metadata": { ... }
    }
  }
}
```

Rules:

- Each step MUST match the standalone command output shape
- `artifact` MUST represent the final pushed artifact
- `artifact` MUST equal `steps.push.artifact` when push is performed
- `artifact` MUST equal `steps.build.artifact` when push is skipped
- No duplication outside `steps`

Top-level status derivation:
status is `success` when build succeeds and push succeeds or is skipped.
status is `partial` when push is partial.
status is `failed` when any step fails.

---

## Error Handling

If a command fails:

```json
{
  "schemaVersion": "1",
  "command": "build",
  "outputMode": "json",
  "success": false,
  "status": "failed",
  "timestamp": "2026-03-22T18:23:51.127Z",
  "durationMs": 1234,
  "tool": {
    "name": "dockship",
    "version": "1.5.0"
  },
  "context": {
    "repoRoot": "/workspace/app",
    "git": {
      "branch": "main",
      "branchSource": "env",
      "commit": "a1b2c3d",
      "repository": "org/repo",
      "remoteUrl": "https://github.com/org/repo.git"
    }
  },
  "result": {},
  "warnings": [],
  "errors": [
    {
      "code": "DOCKER_BUILD_FAILED",
      "message": "Docker build failed",
      "details": {}
    }
  ]
}
```

Rules:

- `errors` MUST always be an array
- `warnings` MUST always be an array
- `success=false` MUST imply `status` is `partial` or `failed`

---

## Design Principles

- **Stable contract over time**
- **No string parsing required**
- **All deploy-ready values provided**
- **CI-agnostic**
- **Extensible without breaking changes**

---

## Example Usage

### Get deployable image

```bash
IMAGE=$(jq -r '.result.artifact.image.reference')
```

### Get immutable image

```bash
IMAGE=$(jq -r '.result.artifact.image.digest.reference')
```

---

## Future Extensions (Non-breaking)

Potential additions:

- multi-arch manifests
- SBOM references
- signature / attestation metadata
- build provenance
- GitOps integration hints

---

## Summary

This spec ensures Dockship acts as a:

> **Portable, deterministic build artifact interface**

Not just a CLI.

---
