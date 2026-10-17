import assert from "node:assert/strict";
import test from "node:test";

import {
  findAutoSyncProject,
  findOverlappingProjects,
  patternsOverlap,
  defaultTargetPattern,
  normalizeProject,
  normalizeTargetPattern,
  projectMatchesDeployment,
} from "../core/projects.js";

test("normalizes a Vercel-only automatic target pattern", () => {
  assert.equal(
    normalizeTargetPattern("https://marketing-*.vercel.app/path"),
    "marketing-*.vercel.app",
  );
  assert.equal(normalizeTargetPattern("release.vercel.app"), "release.vercel.app");
  assert.equal(normalizeTargetPattern("*.staging.example.com"), "*.staging.example.com");
  assert.equal(normalizeTargetPattern("*.com"), "");
  assert.equal(normalizeTargetPattern("*"), "");
  assert.equal(normalizeTargetPattern("localhost"), "");
  assert.equal(normalizeTargetPattern("one**.vercel.app"), "");
});

test("suggests a target pattern from the source deployment name", () => {
  assert.equal(
    defaultTargetPattern("https://my-app.vercel.app"),
    "my-app-*.vercel.app",
  );
  assert.equal(defaultTargetPattern("not-vercel.example.com"), "");
});

test("normalizes a project only when its source is a valid http(s) host", () => {
  assert.deepEqual(
    normalizeProject(
      {
        label: "Marketing",
        sourceHost: "https://marketing.vercel.app",
        targetPattern: "marketing-*.vercel.app",
      },
      "marketing",
    ),
    {
      id: "marketing",
      label: "Marketing",
      sourceHost: "marketing.vercel.app",
      targetPattern: "marketing-*.vercel.app",
      syncOptions: {
        cookies: true,
        localStorage: true,
        sessionStorage: true,
      },
    },
  );
  assert.equal(normalizeProject({ sourceHost: "not a host" }, "bad"), null);
  assert.equal(normalizeProject({ sourceHost: "https://App.Example.com/x" }, "ok").sourceHost, "app.example.com");
});

test("automatic routing honors the pattern and refuses ambiguity", () => {
  const marketing = {
    id: "marketing",
    sourceHost: "marketing.vercel.app",
    targetPattern: "marketing-*.vercel.app",
  };
  const dashboard = {
    id: "dashboard",
    sourceHost: "dashboard.vercel.app",
    targetPattern: "dashboard-*.vercel.app",
  };
  assert.equal(projectMatchesDeployment(marketing, "marketing-pr-17.vercel.app"), true);
  assert.equal(projectMatchesDeployment(marketing, "dashboard-pr-17.vercel.app"), false);
  assert.equal(projectMatchesDeployment(marketing, "marketing-pr-17.example.com"), false);
  assert.equal(
    findAutoSyncProject([marketing, dashboard], "dashboard-pr-17.vercel.app"),
    dashboard,
  );
  assert.equal(
    findAutoSyncProject([marketing, { ...dashboard, targetPattern: "marketing-*.vercel.app" }], "marketing-pr-17.vercel.app"),
    null,
  );
});

test("a wildcard never matches with overlapping prefix and suffix", () => {
  const project = { targetPattern: "app-*-app.vercel.app" };
  assert.equal(projectMatchesDeployment(project, "app-app.vercel.app"), false);
  assert.equal(projectMatchesDeployment(project, "app-git-x-app.vercel.app"), true);
});

test("detects automatic target patterns that could match the same deployment", () => {
  assert.equal(patternsOverlap("shop-*.vercel.app", "shop-git-*.vercel.app"), true);
  assert.equal(patternsOverlap("shop-*.vercel.app", "blog-*.vercel.app"), false);
  assert.equal(patternsOverlap("shop-*.vercel.app", "shop-main.vercel.app"), true);
  assert.equal(patternsOverlap("shop-main.vercel.app", "blog-main.vercel.app"), false);
  assert.equal(patternsOverlap("", "shop-*.vercel.app"), false);

  const projects = [
    { id: "a", targetPattern: "shop-*.vercel.app" },
    { id: "b", targetPattern: "shop-git-*.vercel.app" },
    { id: "c", targetPattern: "" },
  ];
  assert.deepEqual(findOverlappingProjects(projects, projects[0]).map((p) => p.id), ["b"]);
  assert.deepEqual(findOverlappingProjects(projects, projects[2]), []);
});
