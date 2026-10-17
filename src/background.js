import { getSettings } from "./core/config.js";
import { findAutoSyncProject } from "./core/projects.js";
import { needsCrossSiteWarning, normalizeHost, originPatternFromUrl } from "./core/urls.js";
import { hasSelectedSyncOption } from "./core/sync-options.js";
import { findTabForHost, syncStoredState, syncTabState } from "./platform/cookie-store.js";
import {
  forgetAutoSynced,
  markAutoSynced,
  wasAutoSynced,
  wasSessionApplied,
} from "./platform/auto-sync-ledger.js";
import { getActivePersona } from "./platform/persona-vault.js";

function reportBackgroundError(error) {
  console.warn("[session-bridge] background operation skipped", error);
}

async function syncIfEligible(tabId, tab) {
  if (!tab.url) return;

  const targetHost = normalizeHost(tab.url);
  const { projects, autoSync } = await getSettings();
  const project = findAutoSyncProject(projects, targetHost);
  if (
    !autoSync ||
    !project ||
    !hasSelectedSyncOption(project.syncOptions) ||
    targetHost === project.sourceHost ||
    !targetHost ||
    // A background sync cannot ask for the confirmation that unrelated sites require.
    needsCrossSiteWarning(project.sourceHost, targetHost)
  ) {
    return;
  }

  // One automatic sync per tab and deployment: later page loads in the same
  // deployment must not overwrite what the user did there (e.g. signing out).
  if (await wasAutoSynced(tabId, targetHost)) return;

  try {
    const persona = await getActivePersona(project.id);
    const sourceTab = persona ? null : await findTabForHost(project.sourceHost);
    if (!persona && !sourceTab) return;

    // Automatic sync can never ask for permission; it only works where access was already granted.
    const origins = [
      originPatternFromUrl(tab.url),
      originPatternFromUrl(sourceTab?.url ?? ""),
    ].filter(Boolean);
    if (!(await chrome.permissions.contains({ origins }))) return;

    await markAutoSynced(tabId, targetHost);
    const result = persona
      ? await syncStoredState(persona.state, tabId, project.syncOptions)
      : await syncTabState(sourceTab.id, tabId, project.syncOptions);
    if (result.copied === 0 && result.appliedTypes.length === 0) return;

    await markAutoSynced(tabId, targetHost, true);
    await chrome.tabs.reload(tabId);
  } catch (error) {
    // Automatic sync must never interrupt browsing. Manual sync exposes errors in the UI.
    console.warn("[session-bridge] automatic sync skipped", error);
  }
}

/** Automatic sync is silent, so mark tabs whose session was applied with a badge. */
async function showAppliedBadge(tabId, tab) {
  const host = normalizeHost(tab.url ?? "");
  if (!(await wasSessionApplied(tabId, host))) return;
  await chrome.action.setBadgeText({ tabId, text: "✓" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#1f9d78" });
  await chrome.action.setTitle({
    tabId,
    title: "Session Bridge — session was applied to this tab automatically",
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    void syncIfEligible(tabId, tab)
      .then(() => showAppliedBadge(tabId, tab))
      .catch(reportBackgroundError);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetAutoSynced(tabId).catch(reportBackgroundError);
});
