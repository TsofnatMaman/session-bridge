import assert from "node:assert/strict";
import test from "node:test";

import {
  baseDomain,
  canSync,
  cookieSiteFromUrl,
  isLocalDevHost,
  isVercelDeploymentHost,
  needsCrossSiteWarning,
  normalizeHost,
  normalizeVercelHost,
  originPatternFromUrl,
  supportsCookieDomain,
} from "../core/urls.js";

test("normalizes host input without retaining paths or casing", () => {
  assert.equal(normalizeHost("HTTPS://App.Example.com/settings?x=1"), "app.example.com");
  assert.equal(normalizeHost("preview-demo.vercel.app"), "preview-demo.vercel.app");
  assert.equal(normalizeHost("http://localhost:3000/app"), "localhost");
});

test("rejects invalid or non-http hosts", () => {
  assert.equal(normalizeHost("not a host"), "");
  assert.equal(normalizeHost("ftp://files.example.com"), "");
  assert.equal(normalizeHost("chrome://extensions"), "");
  assert.equal(normalizeHost(""), "");
});

test("recognizes Vercel deployment hosts only", () => {
  assert.equal(isVercelDeploymentHost("my-project-git-main-team.vercel.app"), true);
  assert.equal(isVercelDeploymentHost("vercel.app"), false);
  assert.equal(isVercelDeploymentHost("preview.example.com"), false);
  assert.equal(normalizeVercelHost("https://Source-Project.vercel.app/path"), "source-project.vercel.app");
  assert.equal(normalizeVercelHost("app.example.com"), "");
});

test("a session can move between any two distinct http(s) hosts", () => {
  assert.equal(canSync("app.vercel.app", "app-preview.vercel.app"), true);
  assert.equal(canSync("app.example.com", "preview.example.com"), true);
  assert.equal(canSync("app.example.com", "localhost"), true);
  assert.equal(canSync("localhost", "app.vercel.app"), true);
  assert.equal(canSync("app.vercel.app", "app.vercel.app"), false);
  assert.equal(canSync("app.vercel.app", "chrome://extensions"), false);
  assert.equal(canSync("", "app.vercel.app"), false);
});

test("local development hosts are matched exactly", () => {
  assert.equal(isLocalDevHost("localhost"), true);
  assert.equal(isLocalDevHost("http://127.0.0.1:3000/app"), true);
  assert.equal(isLocalDevHost("localhost.evil.com"), false);
});

test("builds host-permission patterns and cookie scopes", () => {
  assert.equal(originPatternFromUrl("http://localhost:3000/x"), "http://localhost/*");
  assert.equal(originPatternFromUrl("https://app.example.com/a?b=1"), "https://app.example.com/*");
  assert.equal(originPatternFromUrl("chrome://extensions"), "");
  assert.equal(cookieSiteFromUrl(new URL("http://localhost:3000/x")), "http://localhost");
  assert.equal(cookieSiteFromUrl(new URL("https://a.vercel.app/")), "https://a.vercel.app");
  assert.equal(supportsCookieDomain("localhost"), false);
  assert.equal(supportsCookieDomain("127.0.0.1"), false);
  assert.equal(supportsCookieDomain("a.vercel.app"), true);
});

test("computes a registrable-domain approximation", () => {
  assert.equal(baseDomain("a.b.example.com"), "example.com");
  assert.equal(baseDomain("shop.example.co.il"), "example.co.il");
  assert.equal(baseDomain("localhost"), "localhost");
});

test("warns only when a session would reach an unrelated site", () => {
  assert.equal(needsCrossSiteWarning("a.vercel.app", "b.vercel.app"), false);
  assert.equal(needsCrossSiteWarning("app.example.com", "staging.example.com"), false);
  assert.equal(needsCrossSiteWarning("app.example.com", "localhost"), false);
  assert.equal(needsCrossSiteWarning("app.example.com", "other.org"), true);
  assert.equal(needsCrossSiteWarning("a.vercel.app", "bank.com"), true);
});
