import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SYNC_OPTIONS,
  hasSelectedSyncOption,
  normalizeSyncOptions,
  selectedSyncLabels,
} from "../src/core/sync-options.js";

test("uses all supported browser-state types by default", () => {
  assert.deepEqual(normalizeSyncOptions(undefined), DEFAULT_SYNC_OPTIONS);
  assert.deepEqual(selectedSyncLabels(undefined), ["Cookies", "Local Storage", "Session Storage"]);
});

test("preserves an explicit per-project data selection", () => {
  const cookiesOnly = normalizeSyncOptions({
    cookies: true,
    localStorage: false,
    sessionStorage: false,
  });
  assert.equal(hasSelectedSyncOption(cookiesOnly), true);
  assert.deepEqual(selectedSyncLabels(cookiesOnly), ["Cookies"]);
  assert.equal(hasSelectedSyncOption({}), false);
});
