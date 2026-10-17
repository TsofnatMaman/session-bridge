import assert from "node:assert/strict";
import test from "node:test";

const localData = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(defaults) {
        return { ...defaults, ...localData };
      },
      async set(values) {
        Object.assign(localData, values);
      },
    },
  },
};

const { getActivePersona, getPersonaState, removePersona, savePersonaSnapshot, setActivePersona } =
  await import("../src/platform/persona-vault.js");

test("stores persona browser-state snapshots locally while exposing metadata only", async () => {
  const projectId = "project-personas";
  const saved = await savePersonaSnapshot({
    projectId,
    label: "Admin",
    state: {
      cookies: [{ name: "session", value: "secret", domain: "app.vercel.app" }],
      localStorage: [["theme", "dark"]],
      sessionStorage: [["return-to", "/settings"]],
    },
  });

  assert.deepEqual(saved, {
    id: saved.id,
    label: "Admin",
    capturedAt: saved.capturedAt,
    earliestExpiry: "",
    cookieCount: 1,
    storageItemCount: 2,
  });

  const state = await getPersonaState(projectId);
  assert.deepEqual(state, {
    activePersonaId: saved.id,
    personas: [saved],
  });
  assert.equal("cookies" in state.personas[0], false);

  const persona = await getActivePersona(projectId);
  assert.equal(persona.state.cookies[0].value, "secret");
  assert.equal(persona.state.localStorage[0][1], "dark");
  persona.state.cookies[0].value = "changed";
  assert.equal((await getActivePersona(projectId)).state.cookies[0].value, "secret");

  await setActivePersona(projectId, "");
  assert.equal(await getActivePersona(projectId), null);
  await removePersona(projectId, saved.id);
  assert.deepEqual(await getPersonaState(projectId), {
    activePersonaId: "",
    personas: [],
  });
});

test("exposes the earliest persistent-cookie expiry as metadata", async () => {
  const saved = await savePersonaSnapshot({
    projectId: "expiry",
    label: "Member",
    state: {
      cookies: [
        { name: "a", value: "1", domain: "x.vercel.app", expirationDate: 2_000_000_000 },
        { name: "b", value: "2", domain: "x.vercel.app", expirationDate: 1_900_000_000 },
        { name: "c", value: "3", domain: "x.vercel.app", session: true },
      ],
    },
  });
  assert.equal(saved.earliestExpiry, new Date(1_900_000_000_000).toISOString());
});

test("rejects a second persona with the same name within a project only", async () => {
  const state = { cookies: [{ name: "s", value: "v", domain: "app.vercel.app" }] };
  const admin = await savePersonaSnapshot({ projectId: "dup-a", label: "Admin", state });

  await assert.rejects(
    savePersonaSnapshot({ projectId: "dup-a", label: "  admin ", state }),
    /already exists/,
  );

  const member = await savePersonaSnapshot({ projectId: "dup-a", label: "Member", state });
  await assert.rejects(
    savePersonaSnapshot({ projectId: "dup-a", personaId: member.id, label: "ADMIN", state }),
    /already exists/,
  );

  // Updating a persona under its own name, and reusing a name in another project, are fine.
  await savePersonaSnapshot({ projectId: "dup-a", personaId: admin.id, label: "Admin", state });
  await savePersonaSnapshot({ projectId: "dup-b", label: "Admin", state });
});
