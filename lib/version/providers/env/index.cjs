#!/usr/bin/env node

const { normalizeVersionInfo, parseSemVerSuffix, splitVersionParts, truncate } = require("../../model.cjs");

const VERSION_VAR_KEY = "versionVar";
const INLINE_VERSION_KEY = "version";
const SOURCE_NAME = "env";
const MAX_VERSION_LENGTH = 50;

const DEFAULT_VERSION_VAR = "DOCKSHIP_VERSION";

function getString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function parseEnvVersion(rawVersion) {
  const version = truncate(getString(rawVersion), MAX_VERSION_LENGTH);
  const parts = splitVersionParts(version);
  const suffix = parseSemVerSuffix(version);
  const full = version.split("-")[0].split("+")[0];

  return {
    version,
    full,
    major: parts.major,
    minor: parts.minor,
    build: parts.build,
    suffix
  };
}

function resolveVersion(context) {
  const providerConfig = context.providerConfig || {};
  const env = context.env || process.env;

  // Priority 1: inline version in config (version.env.version)
  const inlineVersion = getString(providerConfig[INLINE_VERSION_KEY]);

  // Priority 2: env var — name is configurable, defaults to DOCKSHIP_VERSION
  const versionVar = getString(providerConfig[VERSION_VAR_KEY], DEFAULT_VERSION_VAR);
  const envVersion = getString(env[versionVar]);

  const rawVersion = inlineVersion || envVersion;

  if (!rawVersion) {
    throw new Error(
      `Env version provider: no version found. Set ${versionVar} or configure version.env.version in dockship.json`
    );
  }

  const parsed = parseEnvVersion(rawVersion);

  if (!parsed.major || !parsed.minor) {
    throw new Error(
      `Env version provider: '${rawVersion}' is not a valid version — expected at least major.minor (e.g. 1.2 or 1.2.3)`
    );
  }

  return normalizeVersionInfo({
    source: SOURCE_NAME,
    version: parsed.version,
    full: parsed.full,
    major: parsed.major,
    minor: parsed.minor,
    build: parsed.build,
    suffix: parsed.suffix,
    semVer2: parsed.version,
    assemblyVersion: "",
    informationalVersion: "",
    nuGetPackageVersion: ""
  });
}

module.exports = {
  DEFAULT_VERSION_VAR,
  resolveVersion
};
