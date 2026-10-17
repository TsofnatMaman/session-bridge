import { getSettings, saveSettings } from "./core/config.js";
import {
  defaultTargetPattern,
  findOverlappingProjects,
  normalizeProject,
  normalizeTargetPattern,
} from "./core/projects.js";
import {
  canSync,
  needsCrossSiteWarning,
  normalizeHost,
  originPatternFromUrl,
} from "./core/urls.js";
import {
  DEFAULT_SYNC_OPTIONS,
  hasSelectedSyncOption,
  normalizeSyncOptions,
  replacedStorageLabels,
  selectedSyncLabels,
} from "./core/sync-options.js";
import { describeAccessNote, describeSyncResult } from "./core/sync-summary.js";
import {
  findTabForHost,
  readTabState,
  syncStoredState,
  syncTabState,
} from "./platform/cookie-store.js";
import {
  getActivePersona,
  getPersonaState,
  removePersona,
  removeProjectPersonas,
  savePersonaSnapshot,
  setActivePersona,
} from "./platform/persona-vault.js";

const elements = {
  projectSelect: document.getElementById("projectSelect"),
  projectName: document.getElementById("projectName"),
  sourceHost: document.getElementById("sourceHost"),
  targetPattern: document.getElementById("targetPattern"),
  useCurrent: document.getElementById("useCurrent"),
  openSource: document.getElementById("openSource"),
  quickStart: document.getElementById("quickStart"),
  projectPicker: document.getElementById("projectPicker"),
  syncBody: document.getElementById("syncBody"),
  accessNote: document.getElementById("accessNote"),
  riskAck: document.getElementById("riskAck"),
  riskAckBox: document.getElementById("riskAckBox"),
  riskAckText: document.getElementById("riskAckText"),
  setupPanel: document.getElementById("setupPanel"),
  setupHint: document.getElementById("setupHint"),
  copyPanel: document.getElementById("copyPanel"),
  personaPanel: document.getElementById("personaPanel"),
  copyHint: document.getElementById("copyHint"),
  personaHint: document.getElementById("personaHint"),
  saveProject: document.getElementById("saveProject"),
  addProject: document.getElementById("addProject"),
  deleteProject: document.getElementById("deleteProject"),
  copyCookies: document.getElementById("copyCookies"),
  copyLocalStorage: document.getElementById("copyLocalStorage"),
  copySessionStorage: document.getElementById("copySessionStorage"),
  copyState: document.getElementById("copyState"),
  personaSelect: document.getElementById("personaSelect"),
  personaName: document.getElementById("personaName"),
  capturePersona: document.getElementById("capturePersona"),
  deletePersona: document.getElementById("deletePersona"),
  personaState: document.getElementById("personaState"),
  autoSync: document.getElementById("autoSync"),
  sync: document.getElementById("sync"),
  syncPlan: document.getElementById("syncPlan"),
  sourceState: document.getElementById("sourceState"),
  targetState: document.getElementById("targetState"),
  notice: document.getElementById("notice"),
};

let currentTab = null;
let editingProjectId = "";
// True after "New project": no saved project is selected until one is saved.
let creatingNew = false;
// The source→destination pair whose cross-site risk the user has acknowledged (this popup only).
let acknowledgedPair = "";

function crossSitePair(project, targetHost) {
  return project && canSync(project.sourceHost, targetHost) &&
    needsCrossSiteWarning(project.sourceHost, targetHost)
    ? `${project.sourceHost}→${targetHost}`
    : "";
}
let suggestedTargetPattern = "";

function setNotice(message, tone = "neutral") {
  elements.notice.textContent = message;
  elements.notice.dataset.tone = tone;
}

function errorMessage(error) {
  return String(error?.message ?? error);
}

/** Wraps an event handler so a failed storage/browser call is shown, never swallowed. */
function guarded(handler) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      setNotice(`Something went wrong: ${errorMessage(error)}`, "error");
    }
  };
}

function describeExpiry(iso) {
  if (!iso) return "Update it if sign-in stops working.";
  const date = new Date(iso);
  return date.getTime() <= Date.now()
    ? "Some saved cookies have expired — update this persona from a signed-in source tab."
    : `Earliest cookie expiry: ${formatCapturedAt(iso)}.`;
}

/** Panels that configure a saved project only exist while a project is selected. */
function renderProjectPanels(project) {
  elements.setupHint.textContent = project ? project.label : "New project";
  elements.copyHint.textContent = project?.label ?? "";
  elements.personaHint.textContent = project?.label ?? "";
  elements.copyPanel.hidden = !project;
  elements.personaPanel.hidden = !project;
}

function formatCapturedAt(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function currentHost() {
  return normalizeHost(currentTab?.url ?? "");
}

/** Origins the next sync/capture needs; refreshed with the popup so a click can ask at once. */
let syncOrigins = [];
let sourceOrigins = [];

/**
 * Chrome shows its permission prompt only inside a user gesture, and resolves
 * immediately when access was already granted.
 */
async function requestSiteAccess(origins, deniedMessage) {
  if (origins.length === 0) return true;
  const granted = await chrome.permissions.request({ origins });
  if (!granted) setNotice(deniedMessage, "error");
  return granted;
}

function projectForId(settings) {
  return settings.projects.find((project) => project.id === editingProjectId) ?? null;
}

function replaceProjectOptions(projects) {
  const options = projects.map((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.label;
    return option;
  });
  const addOption = document.createElement("option");
  addOption.value = "";
  addOption.textContent = "+ Add project";
  elements.projectSelect.replaceChildren(...options, addOption);
  elements.projectSelect.value = editingProjectId;
}

function fillProjectForm(project) {
  elements.projectName.value = project?.label ?? "";
  elements.sourceHost.value = project?.sourceHost ?? "";
  elements.targetPattern.value = project?.targetPattern ?? "";
  suggestedTargetPattern = "";
  updateTargetPatternSuggestion();
}

function replacePersonaOptions(personaState) {
  const liveOption = document.createElement("option");
  liveOption.value = "";
  liveOption.textContent = "Live source session";
  const options = personaState.personas.map((persona) => {
    const option = document.createElement("option");
    option.value = persona.id;
    option.textContent = persona.label;
    return option;
  });
  elements.personaSelect.replaceChildren(liveOption, ...options);
  elements.personaSelect.value = personaState.activePersonaId;
  const selected = personaState.personas.find(
    (persona) => persona.id === personaState.activePersonaId,
  );
  elements.personaName.value = selected?.label ?? "";
}

function syncOptionsFromControls() {
  return {
    cookies: elements.copyCookies.checked,
    localStorage: elements.copyLocalStorage.checked,
    sessionStorage: elements.copySessionStorage.checked,
  };
}

function applySyncOptions(options, { disabled = false } = {}) {
  const normalized = normalizeSyncOptions(options);
  elements.copyCookies.checked = normalized.cookies;
  elements.copyLocalStorage.checked = normalized.localStorage;
  elements.copySessionStorage.checked = normalized.sessionStorage;
  elements.copyCookies.disabled = disabled;
  elements.copyLocalStorage.disabled = disabled;
  elements.copySessionStorage.disabled = disabled;
}

function formatCopyTypes(options) {
  const labels = selectedSyncLabels(options);
  return labels.length ? labels.join(", ") : "Nothing selected";
}

function updateTargetPatternSuggestion() {
  const suggestion = defaultTargetPattern(elements.sourceHost.value);
  const currentValue = elements.targetPattern.value.trim();
  elements.targetPattern.placeholder = suggestion || "my-app-*.vercel.app";

  if (suggestion && (!currentValue || currentValue === suggestedTargetPattern)) {
    elements.targetPattern.value = suggestion;
  }
  suggestedTargetPattern = suggestion;
}

async function refresh({ keepForm = false } = {}) {
  const settings = await getSettings();
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetHost = currentHost();

  if (
    editingProjectId &&
    !settings.projects.some((project) => project.id === editingProjectId)
  ) {
    editingProjectId = "";
  }
  if (!editingProjectId && settings.projects.length > 0 && !keepForm && !creatingNew) {
    editingProjectId = settings.activeProjectId;
  }

  const project = projectForId(settings);
  replaceProjectOptions(settings.projects);
  if (!keepForm) fillProjectForm(projectForId(settings));
  elements.autoSync.checked = settings.autoSync;

  const sourceTab = project ? await findTabForHost(project.sourceHost) : null;
  const personaState = project
    ? await getPersonaState(project.id)
    : { activePersonaId: "", personas: [] };
  const activePersona = personaState.personas.find(
    (persona) => persona.id === personaState.activePersonaId,
  );
  replacePersonaOptions(personaState);
  elements.capturePersona.textContent = activePersona
    ? "Update selected from source"
    : "Save new persona";
  const syncOptions = project?.syncOptions ?? DEFAULT_SYNC_OPTIONS;
  const hasSelectedTypes = hasSelectedSyncOption(syncOptions);
  applySyncOptions(syncOptions, { disabled: !project });
  elements.copyState.textContent = !project
    ? "Save a project first. All data types will be selected by default."
    : hasSelectedTypes
      ? `Saved automatically for this project: ${formatCopyTypes(syncOptions)}.`
      : "Choose at least one data type before syncing.";
  elements.sourceState.textContent = !project
    ? "Save a project to create a reusable source"
    : activePersona
      ? `Saved persona ready · ${activePersona.label}`
      : sourceTab
      ? `Source tab ready · ${project.sourceHost}`
      : `Open ${project.sourceHost} to sync this project`;

  syncOrigins = [
    originPatternFromUrl(currentTab?.url ?? ""),
    activePersona ? "" : originPatternFromUrl(sourceTab?.url ?? ""),
  ].filter(Boolean);
  sourceOrigins = [originPatternFromUrl(sourceTab?.url ?? "")].filter(Boolean);

  const newAccessHosts = [];
  for (const origin of syncOrigins) {
    if (!(await chrome.permissions.contains({ origins: [origin] }))) {
      newAccessHosts.push(normalizeHost(origin));
    }
  }
  const riskPair = crossSitePair(project, targetHost);
  const riskUnacknowledged = Boolean(riskPair) && acknowledgedPair !== riskPair;
  elements.riskAck.hidden = !riskPair;
  elements.riskAckBox.checked = Boolean(riskPair) && acknowledgedPair === riskPair;
  if (riskPair) {
    elements.riskAckText.textContent = `I understand the risk and trust ${targetHost} with my ${project.sourceHost} session.`;
  }
  const accessNote = project && targetHost && targetHost !== project.sourceHost
    ? describeAccessNote({
        newAccessHosts,
        sourceHost: project.sourceHost,
        targetHost,
        crossSite: Boolean(riskPair),
      })
    : "";
  elements.accessNote.textContent = accessNote;
  elements.accessNote.hidden = !accessNote;

  elements.targetState.textContent = targetHost
    ? `Destination · ${targetHost} (Chrome asks for access to new sites when you sync)`
    : "Open the site you want to sync into (a regular http/https page)";

  elements.useCurrent.disabled = !targetHost;
  elements.deleteProject.disabled = !projectForId(settings);
  elements.openSource.hidden = !project || Boolean(sourceTab) || Boolean(activePersona);
  renderProjectPanels(project);
  elements.projectPicker.hidden = settings.projects.length === 0;
  elements.syncBody.hidden = !project;
  elements.quickStart.hidden = Boolean(project) || !targetHost;
  elements.quickStart.textContent = `Use ${targetHost} as the source`;
  if (!project) elements.setupPanel.open = true;
  elements.personaSelect.disabled = !project;
  elements.personaName.disabled = !project;
  elements.capturePersona.disabled = !project || !sourceTab;
  elements.deletePersona.disabled = !activePersona;
  elements.personaState.textContent = !project
    ? "Save a project before adding personas."
    : activePersona
      ? `“${activePersona.label}” is the selected source · ${activePersona.cookieCount} cookies and ${activePersona.storageItemCount} storage items saved locally${activePersona.capturedAt ? ` on ${formatCapturedAt(activePersona.capturedAt)}` : ""}. ${describeExpiry(activePersona.earliestExpiry)}`
      : personaState.personas.length
        ? `${personaState.personas.length} saved persona${personaState.personas.length === 1 ? "" : "s"}. Live source session is active.`
        : "Save the current source session as a named persona. Snapshots stay only in this Chrome profile.";
  elements.sync.disabled =
    !project ||
    (!sourceTab && !activePersona) ||
    !hasSelectedTypes ||
    !canSync(project.sourceHost, targetHost) ||
    riskUnacknowledged;
  elements.sync.textContent = hasSelectedTypes
    ? `Sync ${selectedSyncLabels(syncOptions).length} data type${selectedSyncLabels(syncOptions).length === 1 ? "" : "s"} to this site`
    : "Choose data to sync";
  elements.syncPlan.textContent = !project
    ? "Save a project to see the source, destination, and data that will be synced."
    : !targetHost
      ? "Open the site you want to sync into to use it as the destination."
      : `From: ${activePersona ? `saved persona “${activePersona.label}”` : `live session at ${project.sourceHost}`} → To: ${targetHost} · Copy: ${formatCopyTypes(syncOptions)}${replacedStorageLabels(syncOptions).length ? ` · Replaces existing ${replacedStorageLabels(syncOptions).join(" and ")} in the destination` : ""}`;

  if (!project) {
    setNotice(
      creatingNew
        ? "Name the project and save its source site. The target pattern is optional."
        : "Add a project once, then switch between saved sources whenever you need.",
    );
  } else if (!targetHost) {
    setNotice("The destination must be a regular http/https page.");
  } else if (targetHost === project.sourceHost) {
    setNotice("The selected source and destination must be different hosts.");
  } else if (!hasSelectedTypes) {
    setNotice("Choose at least one data type in What to copy.");
  } else if (!sourceTab && !activePersona) {
    setNotice("Keep the selected project's source tab open, then return here.");
  } else if (riskUnacknowledged) {
    setNotice("These sites are unrelated. Tick the box above to confirm you trust the destination, then sync.", "error");
  } else if (settings.autoSync && !project.targetPattern) {
    setNotice("Manual sync is ready. Add a target pattern before enabling automatic routing.");
  } else {
    setNotice(
      `Ready to sync “${project.label}”. Browser-data values are never shown in this UI.`,
      "ready",
    );
  }
}

elements.projectSelect.addEventListener(
  "change",
  guarded(async () => {
    if (!elements.projectSelect.value) {
      elements.addProject.click();
      return;
    }
    const settings = await getSettings();
    creatingNew = false;
    editingProjectId = elements.projectSelect.value;
    await saveSettings({
      ...settings,
      activeProjectId: editingProjectId || settings.activeProjectId,
    });
    await refresh();
  }),
);

elements.addProject.addEventListener(
  "click",
  guarded(async () => {
    creatingNew = true;
    editingProjectId = "";
    await refresh();
    elements.projectName.focus();
  }),
);

elements.useCurrent.addEventListener(
  "click",
  guarded(async () => {
    if (!currentHost()) {
      setNotice("Open the site you want to use as a source (a regular http/https page).", "error");
      return;
    }

    elements.sourceHost.value = currentHost();
    updateTargetPatternSuggestion();
    if (!elements.projectName.value.trim()) {
      elements.projectName.value = currentHost();
    }
    setNotice("Source filled from the current tab. Save the project to use it.", "ready");
  }),
);

elements.riskAckBox.addEventListener(
  "change",
  guarded(async () => {
    const project = projectForId(await getSettings());
    acknowledgedPair = elements.riskAckBox.checked
      ? crossSitePair(project, currentHost())
      : "";
    await refresh({ keepForm: true });
  }),
);

elements.openSource.addEventListener(
  "click",
  guarded(async () => {
    const project = projectForId(await getSettings());
    if (!project) return;
    await chrome.tabs.create({ url: `https://${project.sourceHost}/` });
    window.close();
  }),
);

elements.sourceHost.addEventListener("input", updateTargetPatternSuggestion);

async function saveSyncOptionsFromControls() {
  const settings = await getSettings();
  const project = projectForId(settings);
  if (!project) return;

  const syncOptions = syncOptionsFromControls();
  const projects = settings.projects.map((candidate) =>
    candidate.id === project.id ? { ...candidate, syncOptions } : candidate,
  );
  await saveSettings({ ...settings, projects });
  await refresh({ keepForm: true });
}

for (const control of [
  elements.copyCookies,
  elements.copyLocalStorage,
  elements.copySessionStorage,
]) {
  control.addEventListener("change", guarded(saveSyncOptionsFromControls));
}

/**
 * Validates and stores a project (new when no project is being edited).
 * Returns false after showing the reason when the fields are invalid.
 */
async function saveProjectFields(fields) {
  const settings = await getSettings();
  const existing = projectForId(settings);
  const project = normalizeProject(fields, existing?.id);
  if (!project) {
    setNotice("Enter the source site hostname, such as my-project.vercel.app or app.example.com.", "error");
    return false;
  }
  if (fields.targetPattern.trim() && !normalizeTargetPattern(fields.targetPattern)) {
    setNotice("Use a host pattern with at most one *, such as marketing-*.vercel.app or *.staging.example.com.", "error");
    return false;
  }

  const projects = existing
    ? settings.projects.map((candidate) =>
        candidate.id === project.id ? project : candidate,
      )
    : [...settings.projects, project];
  creatingNew = false;
  editingProjectId = project.id;
  await saveSettings({ ...settings, projects, activeProjectId: project.id });
  elements.setupPanel.open = false;
  await refresh();
  setNotice(`Saved “${project.label}”.`, "success");

  const overlaps = findOverlappingProjects(projects, project);
  if (overlaps.length > 0) {
    setNotice(
      `Saved, but this target pattern overlaps ${overlaps.map((other) => `“${other.label}”`).join(", ")}. Automatic sync skips sites that match more than one project.`,
      "error",
    );
  }
  return true;
}

const saveFormProject = guarded(() =>
  saveProjectFields({
    label: elements.projectName.value,
    sourceHost: elements.sourceHost.value,
    targetPattern: elements.targetPattern.value,
    syncOptions: syncOptionsFromControls(),
  }),
);

elements.saveProject.addEventListener("click", saveFormProject);
for (const input of [elements.projectName, elements.sourceHost, elements.targetPattern]) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void saveFormProject();
  });
}

// First-run shortcut: one click turns the current site into the first project.
elements.quickStart.addEventListener(
  "click",
  guarded(async () => {
    const host = currentHost();
    if (!host) return;
    editingProjectId = "";
    await saveProjectFields({
      label: host,
      sourceHost: host,
      targetPattern: defaultTargetPattern(host),
      syncOptions: DEFAULT_SYNC_OPTIONS,
    });
  }),
);

elements.deleteProject.addEventListener(
  "click",
  guarded(async () => {
    const settings = await getSettings();
    const project = projectForId(settings);
    if (!project) return;

    const { personas } = await getPersonaState(project.id);
    const personaNote = personas.length
      ? ` Its ${personas.length} saved persona${personas.length === 1 ? "" : "s"} will be permanently removed too.`
      : "";
    if (!window.confirm(`Delete project “${project.label}”?${personaNote}`)) return;

    const projects = settings.projects.filter((candidate) => candidate.id !== project.id);
    await removeProjectPersonas(project.id);
    creatingNew = false;
    editingProjectId = projects[0]?.id ?? "";
    await saveSettings({ ...settings, projects, activeProjectId: editingProjectId });
    await refresh();
    setNotice(`Deleted “${project.label}”.`, "ready");
  }),
);

elements.personaSelect.addEventListener(
  "change",
  guarded(async () => {
    const settings = await getSettings();
    const project = projectForId(settings);
    if (!project) return;

    await setActivePersona(project.id, elements.personaSelect.value);
    await refresh({ keepForm: true });
  }),
);

elements.capturePersona.addEventListener("click", guarded(async () => {
  const granted = await requestSiteAccess(
    sourceOrigins,
    "Chrome access to the source site was not granted, so the persona was not saved.",
  );
  if (!granted) return;
  const settings = await getSettings();
  const project = projectForId(settings);
  if (!project) return;

  const sourceTab = await findTabForHost(project.sourceHost);
  if (!sourceTab) {
    setNotice(`Open ${project.sourceHost} before saving a persona.`, "error");
    await refresh();
    return;
  }

  const label = elements.personaName.value.trim();
  if (!label) {
    setNotice("Give this persona a name, such as Admin or Member.", "error");
    return;
  }

  elements.capturePersona.disabled = true;
  setNotice(`Saving “${label}” locally…`);
  try {
    const source = await readTabState(sourceTab.id);
    const persona = await savePersonaSnapshot({
      projectId: project.id,
      personaId: elements.personaSelect.value,
      label,
      state: source,
    });
    await refresh({ keepForm: true });
    setNotice(
      `Saved “${persona.label}” with ${persona.cookieCount} cookies and ${persona.storageItemCount} storage items in this Chrome profile.`,
      "success",
    );
  } catch (error) {
    setNotice(`Persona could not be saved: ${errorMessage(error)}`, "error");
    elements.capturePersona.disabled = false;
  }
}));

elements.deletePersona.addEventListener(
  "click",
  guarded(async () => {
    const settings = await getSettings();
    const project = projectForId(settings);
    const personaId = elements.personaSelect.value;
    if (!project || !personaId) return;
    const label = elements.personaSelect.selectedOptions[0]?.textContent ?? "this persona";
    if (!window.confirm(`Delete saved persona “${label}”? Its saved session cannot be recovered.`)) return;

    await removePersona(project.id, personaId);
    await refresh({ keepForm: true });
    setNotice("Saved persona removed from this Chrome profile.", "ready");
  }),
);

elements.autoSync.addEventListener(
  "change",
  guarded(async () => {
    const settings = await getSettings();
    await saveSettings({ ...settings, autoSync: elements.autoSync.checked });
    await refresh({ keepForm: true });
  }),
);

elements.sync.addEventListener("click", async () => {
  const granted = await requestSiteAccess(
    syncOrigins,
    "Chrome access to the source or destination site was not granted, so nothing was copied.",
  );
  if (!granted) return;
  const settings = await getSettings();
  const project = projectForId(settings);
  const targetHost = currentHost();
  if (
    !project ||
    !hasSelectedSyncOption(project.syncOptions) ||
    !canSync(project.sourceHost, targetHost)
  ) {
    return;
  }

  const persona = await getActivePersona(project.id);
  const sourceTab = persona ? null : await findTabForHost(project.sourceHost);
  if (!persona && !sourceTab) {
    setNotice(`Open ${project.sourceHost} and try again.`, "error");
    await refresh();
    return;
  }

  const riskPair = crossSitePair(project, targetHost);
  if (riskPair && acknowledgedPair !== riskPair) {
    setNotice("Confirm the cross-site warning before syncing.", "error");
    return;
  }

  elements.sync.disabled = true;
  setNotice(
    persona
      ? `Copying saved persona “${persona.label}”…`
      : `Copying “${project.label}” browser state securely…`,
  );
  try {
    const result = persona
      ? await syncStoredState(persona.state, currentTab.id, project.syncOptions)
      : await syncTabState(sourceTab.id, currentTab.id, project.syncOptions);
    const outcome = describeSyncResult(result, project.syncOptions, {
      fromPersona: Boolean(persona),
    });
    if (outcome.blocked) {
      setNotice(outcome.message, "error");
      elements.sync.disabled = false;
      return;
    }

    setNotice(outcome.message, outcome.needsReview ? "error" : "success");
    await chrome.tabs.reload(currentTab.id);
    // Stay open when something failed so the user can read what was skipped.
    if (outcome.needsReview) elements.sync.disabled = false;
    else window.close();
  } catch (error) {
    const detail = errorMessage(error);
    const debuggerHint = /debugger|attach|DevTools/i.test(detail)
      ? " Close DevTools for both tabs, then try again."
      : "";
    setNotice(`Sync could not finish: ${detail}.${debuggerHint}`, "error");
    elements.sync.disabled = false;
  }
});

refresh().catch((error) =>
  setNotice(`Could not load settings: ${errorMessage(error)}`, "error"),
);
