import { normalizeProject } from "./projects.js";

const DEFAULT_SETTINGS = Object.freeze({
  projects: [],
  activeProjectId: "",
  autoSync: false,
});

function normalizeProjects(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.flatMap((project) => {
    const normalized = normalizeProject(project, project?.id);
    if (!normalized || ids.has(normalized.id)) return [];
    ids.add(normalized.id);
    return [normalized];
  });
}

function resolveActiveProjectId(projects, requestedId) {
  return projects.some((project) => project.id === requestedId)
    ? requestedId
    : projects[0]?.id ?? "";
}

export async function getSettings() {
  const saved = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const projects = normalizeProjects(saved.projects);
  const activeProjectId = resolveActiveProjectId(projects, saved.activeProjectId);

  return { projects, activeProjectId, autoSync: Boolean(saved.autoSync) };
}

export async function saveSettings(settings) {
  const projects = normalizeProjects(settings.projects);
  const activeProjectId = resolveActiveProjectId(projects, settings.activeProjectId);

  const normalized = {
    projects,
    activeProjectId,
    autoSync: Boolean(settings.autoSync),
  };
  await chrome.storage.sync.set(normalized);
  return normalized;
}
