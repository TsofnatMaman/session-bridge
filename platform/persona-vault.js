const VAULT_KEY = "persona-vault-v1";

function newPersonaId() {
  return globalThis.crypto?.randomUUID?.() ??
    `persona-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanLabel(value) {
  return typeof value === "string" ? value.trim().slice(0, 60) : "";
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function emptyVault() {
  return { projects: {} };
}

function entries(value) {
  return Array.isArray(value)
    ? value.filter(
        (entry) =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === "string" &&
          (typeof entry[1] === "string" || entry[1] === null),
      )
    : [];
}

function normalizeState(state) {
  return {
    cookies: Array.isArray(state?.cookies) ? state.cookies : [],
    cookieTransport:
      state?.cookieTransport === "devtools-protocol" ? "devtools-protocol" : "cookies",
    localStorage: entries(state?.localStorage),
    sessionStorage: entries(state?.sessionStorage),
  };
}

function normalizePersona(persona) {
  if (
    !persona ||
    typeof persona.id !== "string" ||
    typeof persona.label !== "string"
  ) {
    return null;
  }

  const state = persona.state;
  if (!state || typeof state !== "object" || !Array.isArray(state.cookies)) return null;

  return {
    id: persona.id,
    label: persona.label,
    capturedAt: typeof persona.capturedAt === "string" ? persona.capturedAt : "",
    state: normalizeState(state),
  };
}

function projectBucket(vault, projectId) {
  const candidate = vault.projects?.[projectId];
  const personas = Array.isArray(candidate?.personas)
    ? candidate.personas.map(normalizePersona).filter(Boolean)
    : [];
  const activePersonaId = personas.some(
    (persona) => persona.id === candidate?.activePersonaId,
  )
    ? candidate.activePersonaId
    : "";
  return { activePersonaId, personas };
}

async function readVault() {
  const stored = await chrome.storage.local.get({ [VAULT_KEY]: emptyVault() });
  const vault = stored[VAULT_KEY];
  return vault && typeof vault === "object" && !Array.isArray(vault)
    ? { projects: vault.projects && typeof vault.projects === "object" ? vault.projects : {} }
    : emptyVault();
}

async function writeVault(vault) {
  await chrome.storage.local.set({ [VAULT_KEY]: vault });
}

/** Earliest expiry (ISO) among persistent cookies; "" when all are session cookies. */
function earliestCookieExpiry(cookies) {
  const times = cookies
    .filter((cookie) => !cookie.session && Number.isFinite(cookie.expirationDate))
    .map((cookie) => cookie.expirationDate * 1000);
  return times.length ? new Date(Math.min(...times)).toISOString() : "";
}

function publicPersona(persona) {
  return {
    id: persona.id,
    label: persona.label,
    capturedAt: persona.capturedAt ?? "",
    earliestExpiry: earliestCookieExpiry(persona.state.cookies),
    cookieCount: persona.state.cookies.length,
    storageItemCount:
      persona.state.localStorage.length + persona.state.sessionStorage.length,
  };
}

/** Lists only metadata, never cookie values, for the popup UI. */
export async function getPersonaState(projectId) {
  const vault = await readVault();
  const bucket = projectBucket(vault, projectId);
  return {
    activePersonaId: bucket.activePersonaId,
    personas: bucket.personas.map(publicPersona),
  };
}

/** Gets the local cookie snapshot chosen for a project, if there is one. */
export async function getActivePersona(projectId) {
  const vault = await readVault();
  const bucket = projectBucket(vault, projectId);
  const persona = bucket.personas.find(
    (candidate) => candidate.id === bucket.activePersonaId,
  );
  return persona
    ? { ...persona, state: cloneState(persona.state) }
    : null;
}

export async function setActivePersona(projectId, personaId) {
  const vault = await readVault();
  const bucket = projectBucket(vault, projectId);
  const activePersonaId = bucket.personas.some((persona) => persona.id === personaId)
    ? personaId
    : "";
  vault.projects[projectId] = { ...bucket, activePersonaId };
  await writeVault(vault);
  return activePersonaId;
}

/** Stores one local-only cookie snapshot; it is never synced by this extension. */
export async function savePersonaSnapshot({
  projectId,
  personaId = "",
  label,
  state,
}) {
  const normalizedLabel = cleanLabel(label);
  if (!normalizedLabel) throw new Error("Give the persona a name first.");
  const normalizedState = normalizeState(state);
  if (
    normalizedState.cookies.length === 0 &&
    normalizedState.localStorage.length === 0 &&
    normalizedState.sessionStorage.length === 0
  ) {
    throw new Error("No cookies or browser storage were available to save.");
  }

  const vault = await readVault();
  const bucket = projectBucket(vault, projectId);
  const existing = bucket.personas.find((persona) => persona.id === personaId);
  const duplicate = bucket.personas.find(
    (persona) =>
      persona.id !== existing?.id &&
      persona.label.trim().toLowerCase() === normalizedLabel.toLowerCase(),
  );
  if (duplicate) {
    throw new Error(`A persona named “${duplicate.label}” already exists in this project.`);
  }
  const id = existing?.id ?? newPersonaId();
  const snapshot = {
    id,
    label: normalizedLabel,
    capturedAt: new Date().toISOString(),
    state: cloneState(normalizedState),
  };
  const personas = existing
    ? bucket.personas.map((persona) => (persona.id === id ? snapshot : persona))
    : [...bucket.personas, snapshot];

  vault.projects[projectId] = { activePersonaId: id, personas };
  await writeVault(vault);
  return publicPersona(snapshot);
}

export async function removePersona(projectId, personaId) {
  const vault = await readVault();
  const bucket = projectBucket(vault, projectId);
  const personas = bucket.personas.filter((persona) => persona.id !== personaId);
  vault.projects[projectId] = {
    personas,
    activePersonaId: bucket.activePersonaId === personaId ? "" : bucket.activePersonaId,
  };
  await writeVault(vault);
}

export async function removeProjectPersonas(projectId) {
  const vault = await readVault();
  delete vault.projects[projectId];
  await writeVault(vault);
}
