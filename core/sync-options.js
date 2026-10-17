export const DEFAULT_SYNC_OPTIONS = Object.freeze({
  cookies: true,
  localStorage: true,
  sessionStorage: true,
});

export function normalizeSyncOptions(value) {
  if (!value || typeof value !== "object") return { ...DEFAULT_SYNC_OPTIONS };
  return {
    cookies: Boolean(value.cookies),
    localStorage: Boolean(value.localStorage),
    sessionStorage: Boolean(value.sessionStorage),
  };
}

export function hasSelectedSyncOption(options) {
  const normalized = normalizeSyncOptions(options);
  return normalized.cookies || normalized.localStorage || normalized.sessionStorage;
}

/** Storage areas that replace (not merge into) the destination's existing data. */
export function replacedStorageLabels(options) {
  return selectedSyncLabels(options).filter((label) => label.endsWith("Storage"));
}

export function selectedSyncLabels(options) {
  const normalized = normalizeSyncOptions(options);
  return [
    normalized.cookies ? "Cookies" : "",
    normalized.localStorage ? "Local Storage" : "",
    normalized.sessionStorage ? "Session Storage" : "",
  ].filter(Boolean);
}
