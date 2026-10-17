import assert from "node:assert/strict";
import test from "node:test";

const sessionData = {};
globalThis.chrome = {
  storage: {
    session: {
      async get(defaults) {
        return { ...defaults, ...sessionData };
      },
      async set(values) {
        Object.assign(sessionData, values);
      },
    },
  },
};

const { forgetAutoSynced, markAutoSynced, wasAutoSynced, wasSessionApplied } =
  await import("../src/platform/auto-sync-ledger.js");

test("a tab is auto-synced once per deployment host", async () => {
  assert.equal(await wasAutoSynced(7, "app-git-x.vercel.app"), false);

  await markAutoSynced(7, "app-git-x.vercel.app");
  assert.equal(await wasAutoSynced(7, "app-git-x.vercel.app"), true);
  assert.equal(await wasAutoSynced(7, "app-git-y.vercel.app"), false);
  assert.equal(await wasAutoSynced(8, "app-git-x.vercel.app"), false);

  assert.equal(await wasSessionApplied(7, "app-git-x.vercel.app"), false);
  await markAutoSynced(7, "app-git-x.vercel.app", true);
  assert.equal(await wasSessionApplied(7, "app-git-x.vercel.app"), true);
  assert.equal(await wasSessionApplied(7, "app-git-y.vercel.app"), false);

  await forgetAutoSynced(7);
  assert.equal(await wasAutoSynced(7, "app-git-x.vercel.app"), false);
});
