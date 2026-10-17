/** Normalized hostname of an http(s) URL or bare host; "" for anything else. */
export function normalizeHost(input) {
  if (typeof input !== "string") return "";
  const candidate = input.trim();
  if (!candidate) return "";

  try {
    const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

export const VERCEL_SUFFIX = ".vercel.app";

export function isVercelDeploymentHost(host) {
  const normalized = normalizeHost(host);
  return normalized.endsWith(VERCEL_SUFFIX) && normalized.length > VERCEL_SUFFIX.length;
}

/** Returns the normalized hostname only when it is a *.vercel.app deployment. */
export function normalizeVercelHost(input) {
  const host = normalizeHost(input);
  return isVercelDeploymentHost(host) ? host : "";
}

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isLocalDevHost(host) {
  return LOCAL_DEV_HOSTS.has(normalizeHost(host));
}

function isIpAddress(host) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[");
}

/** Single-label hosts (localhost) and IPs cannot carry a cookie Domain attribute. */
export function supportsCookieDomain(host) {
  const normalized = normalizeHost(host);
  return normalized.includes(".") && !isIpAddress(normalized);
}

/**
 * The cookie "site" for partitioned cookies: scheme and host without a port, so
 * http://localhost:3000 and https://x.vercel.app both produce valid partition keys.
 */
export function cookieSiteFromUrl(url) {
  return `${url.protocol}//${url.hostname}`;
}

/** Chrome host-permission pattern covering a page's site (any port). */
export function originPatternFromUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? `${protocol}//${hostname}/*` : "";
  } catch {
    return "";
  }
}

/** A session can be copied between any two distinct http(s) hosts. */
export function canSync(sourceOrigin, targetOrigin) {
  const source = normalizeHost(sourceOrigin);
  const target = normalizeHost(targetOrigin);
  return Boolean(source && target && source !== target);
}

const TWO_LABEL_PUBLIC_SUFFIXES = new Set([
  "ac.il",
  "co.il",
  "gov.il",
  "net.il",
  "org.il",
  "co.uk",
  "gov.uk",
  "ltd.uk",
  "me.uk",
  "net.uk",
  "org.uk",
  "plc.uk",
  "com.au",
  "edu.au",
  "gov.au",
  "net.au",
  "org.au",
  "com.br",
  "com.cn",
  "com.hk",
  "com.mx",
  "com.my",
  "com.sg",
  "co.jp",
  "co.kr",
  "co.nz",
  "co.za",
  "com.tr",
  "com.tw",
  "com.ar",
  "com.co",
]);

/** Dependency-free registrable-domain approximation, used only to warn before risky copies. */
export function baseDomain(hostOrUrl) {
  const host = normalizeHost(hostOrUrl);
  if (!host || !host.includes(".") || isIpAddress(host)) return host;

  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join(".");
  return TWO_LABEL_PUBLIC_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/**
 * True when copying a session between these hosts hands one site's credentials to
 * an unrelated site, which deserves an explicit confirmation. Local development
 * and sites sharing a registrable domain (including all *.vercel.app) are exempt.
 */
export function needsCrossSiteWarning(sourceHost, targetHost) {
  if (isLocalDevHost(targetHost) || isLocalDevHost(sourceHost)) return false;
  const source = baseDomain(sourceHost);
  const target = baseDomain(targetHost);
  return Boolean(source && target && source !== target);
}
