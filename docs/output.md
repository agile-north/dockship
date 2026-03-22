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

- In JSON mode, stdout MUST contain exactly one JSON object and no extra text.
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

---

### build

Builds the Docker image locally.

```json
{
  "artifact": { ... },

  "operation": {
    "type": "build",
    "performed": true,

    "cleanup": {
      "enabled": true,
      "removedReferences": [
        "registry.example.com/client/my-app:1.4.2"
      ]
    }
  },

  "metadata": {
    "platforms": ["linux/amd64"]
  }
}
```

Notes:

- `digest` will typically be `null`
- cleanup refers to local image removal

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
      "branch": "main",
      "branchSource": "env",
      "inputBranch": "refs/heads/main"
    }
  },

  "metadata": {
    "platforms": ["linux/amd64"]
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
