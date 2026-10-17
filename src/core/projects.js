import { normalizeHost, normalizeVercelHost, VERCEL_SUFFIX } from "./urls.js";
import { normalizeSyncOptions } from "./sync-options.js";

function newProjectId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `project-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function cleanLabel(value, fallback) {
  const label = typeof value === "string" ? value.trim().slice(0, 60) : "";
  return label || fallback;
}

/**
 * Normalizes an automatic-routing host pattern such as marketing-*.vercel.app or
 * *.staging.example.com. One wildcard at most, and the part after it must name a
 * real domain (at least two labels) so a pattern can never match whole TLDs.
 */
export function normalizeTargetPattern(input) {
  if (typeof input !== "string") return "";

  const candidate = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/, 1)[0]
    .replace(/:\d+$/, "");
  const labels = candidate.split(".");
  const wildcards = (candidate.match(/\*/g) ?? []).length;
  const fixedTail = labels.filter((label) => !label.includes("*"));

  if (
    candidate.length > 253 ||
    wildcards > 1 ||
    labels.length < 2 ||
    labels.at(-1).includes("*") ||
    (wildcards > 0 && fixedTail.length < 2) ||
    !labels.every(
      (label) => label.length <= 63 && /^[a-z0-9*](?:[a-z0-9*-]*[a-z0-9*])?$/.test(label),
    )
  ) {
    return "";
  }

  return candidate;
}

/**
 * Suggests a pattern for a Vercel project's previews, which Vercel names
 * <project>-<hash>-<team>.vercel.app or <project>-git-<branch>-<team>.vercel.app.
 * my-app.vercel.app becomes my-app-*.vercel.app.
 */
export function defaultTargetPattern(sourceHost) {
  const source = normalizeVercelHost(sourceHost);
  if (!source) return "";

  const name = source.slice(0, -VERCEL_SUFFIX.length);
  return normalizeTargetPattern(`${name}-*${VERCEL_SUFFIX}`);
}

export function normalizeProject(input = {}, requestedId) {
  if (!input || typeof input !== "object") return null;
  const sourceHost = normalizeHost(input.sourceHost ?? "");
  if (!sourceHost) return null;

  const targetPattern = normalizeTargetPattern(input.targetPattern);
  const providedId = typeof requestedId === "string" ? requestedId.trim() : "";

  return {
    id: providedId || newProjectId(),
    label: cleanLabel(input.label, sourceHost),
    sourceHost,
    targetPattern,
    syncOptions: normalizeSyncOptions(input.syncOptions),
  };
}

export function projectMatchesDeployment(project, targetHost) {
  const pattern = normalizeTargetPattern(project?.targetPattern ?? "");
  if (!pattern || !normalizeHost(targetHost)) return false;

  return hostMatchesPattern(targetHost.toLowerCase(), pattern);
}

function hostMatchesPattern(host, pattern) {
  const star = pattern.indexOf("*");
  if (star === -1) return host === pattern;

  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  // The wildcard cannot match a negative length, so prefix and suffix must not overlap.
  return (
    host.length >= prefix.length + suffix.length && host.startsWith(prefix) && host.endsWith(suffix)
  );
}

/** True when some hostname could match both normalized target patterns. */
export function patternsOverlap(a, b) {
  if (!a || !b) return false;
  const starA = a.indexOf("*");
  const starB = b.indexOf("*");
  if (starA === -1) return hostMatchesPattern(a, b);
  if (starB === -1) return hostMatchesPattern(b, a);

  const prefixes = [a.slice(0, starA), b.slice(0, starB)];
  const suffixes = [a.slice(starA + 1), b.slice(starB + 1)];
  const compatible = ([x, y], test) => test(x, y) || test(y, x);
  return (
    compatible(prefixes, (x, y) => x.startsWith(y)) && compatible(suffixes, (x, y) => x.endsWith(y))
  );
}

/** Other saved projects whose automatic pattern collides with this project's. */
export function findOverlappingProjects(projects, project) {
  if (!project?.targetPattern) return [];
  return (Array.isArray(projects) ? projects : []).filter(
    (other) =>
      other.id !== project.id && patternsOverlap(project.targetPattern, other.targetPattern),
  );
}

/** Returns a profile only when exactly one saved pattern matches the target. */
export function findAutoSyncProject(projects, targetHost) {
  const matches = (Array.isArray(projects) ? projects : []).filter((project) =>
    projectMatchesDeployment(project, targetHost),
  );
  return matches.length === 1 ? matches[0] : null;
}
