const LEDGER_KEY = "auto-synced-tabs-v1";

/**
 * Remembers which deployment host each tab was already auto-synced to.
 * Kept in chrome.storage.session so it survives MV3 service-worker restarts
 * but never outlives the browser session.
 */
async function readLedger() {
  const stored = await chrome.storage.session.get({ [LEDGER_KEY]: {} });
  const ledger = stored[LEDGER_KEY];
  return ledger && typeof ledger === "object" && !Array.isArray(ledger) ? ledger : {};
}

export async function wasAutoSynced(tabId, host) {
  return (await readLedger())[tabId]?.host === host;
}

/** True only when the automatic sync actually wrote data into this tab's deployment. */
export async function wasSessionApplied(tabId, host) {
  const entry = (await readLedger())[tabId];
  return entry?.host === host && entry.applied === true;
}

/** Records an attempt (applied=false) before syncing and the outcome (applied=true) after. */
export async function markAutoSynced(tabId, host, applied = false) {
  const ledger = await readLedger();
  await chrome.storage.session.set({
    [LEDGER_KEY]: { ...ledger, [tabId]: { host, applied } },
  });
}

export async function forgetAutoSynced(tabId) {
  const ledger = await readLedger();
  if (!(tabId in ledger)) return;
  delete ledger[tabId];
  await chrome.storage.session.set({ [LEDGER_KEY]: ledger });
}
