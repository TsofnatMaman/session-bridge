import { normalizeSyncOptions } from "./sync-options.js";

const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

function emptyOutcome(result, fromPersona) {
  if (result.cookies?.failed > 0) {
    return `${plural(result.cookies.failed, "cookie")} could not be set in the destination. Close DevTools for both tabs and try again.`;
  }
  if (result.reason === "source-empty") {
    return fromPersona
      ? "This saved persona has no usable selected data. Capture it again from the source tab."
      : "No selected browser data was found for the source host.";
  }
  return "Nothing was copied. The destination may already be up to date.";
}

/**
 * Turns a sync result into one user-facing message.
 * `blocked` means nothing reached the destination, so the tab is not reloaded;
 * `needsReview` means the sync partly failed and the popup should stay open.
 */
export function describeSyncResult(result, syncOptions, { fromPersona = false } = {}) {
  if (result.copied === 0 && result.appliedTypes.length === 0) {
    return { message: emptyOutcome(result, fromPersona), blocked: true, needsReview: true };
  }

  const options = normalizeSyncOptions(syncOptions);
  const parts = [];
  if (options.cookies && result.cookies.copied > 0) {
    parts.push(`${plural(result.cookies.copied, "cookie")} copied`);
  }
  for (const [enabled, label, area] of [
    [options.localStorage, "Local Storage", result.localStorage],
    [options.sessionStorage, "Session Storage", result.sessionStorage],
  ]) {
    if (!enabled) continue;
    parts.push(
      area.copied > 0
        ? `${label} replaced (${plural(area.copied, "item")})`
        : `${label} cleared (source had none)`,
    );
  }

  const failed = result.failed > 0;
  const failure = failed
    ? ` ${plural(result.failed, "cookie")} could not be set — the session may be incomplete.`
    : "";
  return {
    message: `${parts.join(" · ")}.${failure} Reloading deployment…`,
    blocked: false,
    needsReview: failed,
  };
}

/**
 * Pre-click explanation shown under the sync plan: what Chrome is about to ask
 * for, and the risk of copying a session to an unrelated site.
 */
export function describeAccessNote({ newAccessHosts = [], sourceHost, targetHost, crossSite }) {
  const lines = [];
  if (crossSite) {
    lines.push(
      `Warning: ${sourceHost} and ${targetHost} are unrelated sites. Copying cookies gives ${targetHost} the power to act as you on ${sourceHost}.`,
    );
  }
  if (newAccessHosts.length > 0) {
    lines.push(
      `Chrome will ask to let Session Bridge read and change your data on ${newAccessHosts.join(" and ")}. Allow it only for sites you trust. Nothing leaves your browser.`,
    );
  }
  return lines.join(" ");
}
