import assert from "node:assert/strict";
import test from "node:test";

import { describeAccessNote, describeSyncResult } from "../src/core/sync-summary.js";

const base = {
  copied: 0,
  failed: 0,
  appliedTypes: [],
  cookies: { copied: 0, failed: 0 },
  localStorage: { copied: 0 },
  sessionStorage: { copied: 0 },
};

test("summarizes each copied data type and flags empty storage as cleared", () => {
  const outcome = describeSyncResult(
    {
      ...base,
      copied: 3,
      appliedTypes: ["Cookies", "Local Storage", "Session Storage"],
      cookies: { copied: 1, failed: 0 },
      localStorage: { copied: 2 },
    },
    undefined,
  );
  assert.equal(
    outcome.message,
    "1 cookie copied · Local Storage replaced (2 items) · Session Storage cleared (source had none). Reloading deployment…",
  );
  assert.equal(outcome.blocked, false);
  assert.equal(outcome.needsReview, false);
});

test("reports cookie failures instead of hiding them", () => {
  const partial = describeSyncResult(
    { ...base, copied: 1, failed: 2, appliedTypes: ["Cookies"], cookies: { copied: 1, failed: 2 } },
    { cookies: true },
  );
  assert.match(partial.message, /2 cookies could not be set/);
  assert.equal(partial.needsReview, true);

  const none = describeSyncResult(
    { ...base, failed: 2, cookies: { copied: 0, failed: 2 } },
    { cookies: true },
  );
  assert.equal(none.blocked, true);
  assert.match(none.message, /Close DevTools/);
});

test("explains an empty source differently for live sessions and personas", () => {
  const empty = { ...base, reason: "source-empty" };
  assert.match(describeSyncResult(empty, undefined).message, /source host/);
  assert.match(describeSyncResult(empty, undefined, { fromPersona: true }).message, /persona/);
});

test("explains the permission prompt and cross-site risk before the click", () => {
  assert.equal(describeAccessNote({ sourceHost: "a.com", targetHost: "b.com" }), "");

  const note = describeAccessNote({
    newAccessHosts: ["a.com", "b.org"],
    sourceHost: "a.com",
    targetHost: "b.org",
    crossSite: true,
  });
  assert.match(note, /^Warning: a\.com and b\.org are unrelated sites/);
  assert.match(note, /read and change your data on a\.com and b\.org/);
});
