const VERSION_SPLIT_PRERELEASE = "-";
const VERSION_SPLIT_METADATA = "+";
const VERSION_SPLIT_DOT = ".";

function getString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function splitVersionParts(version) {
  const raw = getString(version);
  const numericPrefix = raw
    .split(VERSION_SPLIT_PRERELEASE)[0]
    .split(VERSION_SPLIT_METADATA)[0];

  const parts = numericPrefix.split(VERSION_SPLIT_DOT);

  return {
    major: parts[0] || "",
    minor: parts[1] || "",
    build: parts[2] || ""
  };
}

function parseSemVerSuffix(version) {
  const raw = getString(version);
  const prereleaseIndex = raw.indexOf(VERSION_SPLIT_PRERELEASE);

  if (prereleaseIndex < 0) {
    return "";
  }

  const metadataIndex = raw.indexOf(VERSION_SPLIT_METADATA, prereleaseIndex);
  return metadataIndex >= 0
    ? raw.slice(prereleaseIndex, metadataIndex)
    : raw.slice(prereleaseIndex);
}

function truncate(value, maxLength) {
  const text = getString(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function sanitizeBranch(branch) {
  if (!branch) {
    return "";
  }

  let value = getString(branch);

  value = value.replace(/^refs\/heads\//i, "");
  value = value.replace(/^refs-heads-/i, "");
  value = value.replace(/[\/\\ _.]+/g, "-");
  value = value.replace(/-+/g, "-");
  value = value.replace(/^-+|-+$/g, "");

  return value.toLowerCase();
}

function normalizeVersionInfo(input) {
  const version = getString(input.version);
  const full = getString(input.full, version);
  const parts = splitVersionParts(version || full);

  return {
    source: getString(input.source),
    version,
    full,
    major: getString(input.major, parts.major),
    minor: getString(input.minor, parts.minor),
    build: getString(input.build, parts.build),
    suffix: getString(input.suffix),
    semVer2: getString(input.semVer2, version || full),
    assemblyVersion: getString(input.assemblyVersion),
    informationalVersion: getString(input.informationalVersion),
    nuGetPackageVersion: getString(input.nuGetPackageVersion)
  };
}

function validateVersionInfo(versionInfo) {
  const required = ["source", "version", "full", "major", "minor"];

  for (const field of required) {
    if (!getString(versionInfo[field])) {
      throw new Error(`Version info missing required field: ${field}`);
    }
  }
}

module.exports = {
  getString,
  normalizeVersionInfo,
  parseSemVerSuffix,
  sanitizeBranch,
  splitVersionParts,
  truncate,
  validateVersionInfo
};
