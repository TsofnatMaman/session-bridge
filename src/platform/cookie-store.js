import { normalizeSyncOptions } from "../core/sync-options.js";
import { cookieSiteFromUrl, normalizeHost, supportsCookieDomain } from "../core/urls.js";

function hostMatchesCookieDomain(host, domain) {
  const cookieDomain = domain.replace(/^\./, "").toLowerCase();
  const normalizedHost = host.toLowerCase();
  return normalizedHost === cookieDomain || normalizedHost.endsWith(`.${cookieDomain}`);
}

function cookieIdentity(cookie) {
  const partition = cookie.partitionKey;
  return [
    cookie.name,
    cookie.domain,
    cookie.path,
    partition?.topLevelSite ?? "",
    partition?.hasCrossSiteAncestor === true ? "cross-site" : "",
  ].join("\u0000");
}

function dedupe(cookies) {
  const seen = new Set();
  return cookies.filter((cookie) => {
    const identity = cookieIdentity(cookie);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function cookieUrl(origin, path) {
  return new URL(path?.startsWith("/") ? path : "/", origin).href;
}

async function getTabContext(tabId) {
  const [tab, stores] = await Promise.all([
    chrome.tabs.get(tabId),
    chrome.cookies.getAllCookieStores(),
  ]);
  if (!tab.url) throw new Error("The selected tab has no URL.");

  const url = new URL(tab.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Choose a regular HTTP(S) page.");
  }

  const store = stores.find((candidate) => candidate.tabIds.includes(tabId));
  if (!store) throw new Error("Chrome did not expose a cookie store for this tab.");
  return { tab, url, storeId: store.id };
}

/**
 * Finds an open tab on a host. Tabs are filtered by hostname here because the
 * `url` query filter only matches hosts the extension already has access to.
 */
export async function findTabForHost(host) {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => normalizeHost(tab.url ?? "") === host) ?? null;
}

async function withDebugger(tabId, operation) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    return await operation((method, params) => chrome.debugger.sendCommand(target, method, params));
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

function protocolCookieToCookie(cookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite:
      {
        Strict: "strict",
        Lax: "lax",
        None: "no_restriction",
      }[cookie.sameSite] ?? "unspecified",
    session: cookie.session,
    expirationDate: cookie.expires >= 0 ? cookie.expires : undefined,
    hostOnly: !cookie.domain.startsWith("."),
    partitionKey: cookie.partitionKey,
    priority: cookie.priority,
  };
}

async function readWithDevToolsProtocol(tabId, url) {
  const { cookies = [] } = await withDebugger(tabId, (send) => send("Network.getAllCookies"));
  return cookies
    .map(protocolCookieToCookie)
    .filter((cookie) => hostMatchesCookieDomain(url.hostname, cookie.domain));
}

/**
 * Reads every browser cookie scoped to a tab's host. Chrome's normal cookies API
 * is preferred; CDP is a narrow fallback for browser builds where partitioned
 * cookies are omitted from that API despite appearing in DevTools.
 */
async function readTabCookies(tabId) {
  const context = await getTabContext(tabId);
  const [unpartitioned, everyPartition] = await Promise.all([
    chrome.cookies.getAll({ storeId: context.storeId }),
    chrome.cookies.getAll({ storeId: context.storeId, partitionKey: {} }),
  ]);
  const cookies = dedupe([...unpartitioned, ...everyPartition]).filter((cookie) =>
    hostMatchesCookieDomain(context.url.hostname, cookie.domain),
  );

  if (cookies.length > 0) return { ...context, cookies, transport: "cookies" };

  return {
    ...context,
    cookies: await readWithDevToolsProtocol(tabId, context.url),
    transport: "devtools-protocol",
  };
}

function emptyStorageSnapshot() {
  return { localStorage: [], sessionStorage: [] };
}

/** Reads page storage in the tab's Vercel origin through Chrome's scripting API. */
async function readTabStorage(tabId) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const read = (storage) => {
        const entries = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key !== null) entries.push([key, storage.getItem(key)]);
        }
        return entries;
      };
      return {
        localStorage: read(window.localStorage),
        sessionStorage: read(window.sessionStorage),
      };
    },
  });
  const snapshot = injection?.result;
  return {
    localStorage: Array.isArray(snapshot?.localStorage) ? snapshot.localStorage : [],
    sessionStorage: Array.isArray(snapshot?.sessionStorage) ? snapshot.sessionStorage : [],
  };
}

/** Captures the complete browser state currently supported by this extension. */
export async function readTabState(tabId, syncOptions) {
  const options = normalizeSyncOptions(syncOptions);
  const cookies = options.cookies
    ? await readTabCookies(tabId)
    : { cookies: [], transport: "cookies" };
  const storage =
    options.localStorage || options.sessionStorage
      ? await readTabStorage(tabId)
      : emptyStorageSnapshot();
  return {
    cookies: cookies.cookies,
    cookieTransport: cookies.transport,
    localStorage: options.localStorage ? storage.localStorage : [],
    sessionStorage: options.sessionStorage ? storage.sessionStorage : [],
  };
}

function shouldSetCookieDomain(cookie, targetUrl) {
  return (
    !cookie.hostOnly &&
    !cookie.name.startsWith("__Host-") &&
    supportsCookieDomain(targetUrl.hostname)
  );
}

function targetCookieDetails(cookie, target) {
  const details = {
    url: cookieUrl(target.url.origin, cookie.path),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    storeId: target.storeId,
  };

  if (!cookie.session && Number.isFinite(cookie.expirationDate)) {
    details.expirationDate = cookie.expirationDate;
  }
  if (shouldSetCookieDomain(cookie, target.url)) {
    details.domain = target.url.hostname;
  }
  if (cookie.partitionKey) {
    details.partitionKey = {
      topLevelSite: cookieSiteFromUrl(target.url),
      ...(cookie.partitionKey.hasCrossSiteAncestor !== undefined
        ? { hasCrossSiteAncestor: cookie.partitionKey.hasCrossSiteAncestor }
        : {}),
    };
  }
  return details;
}

function targetProtocolCookie(cookie, targetUrl) {
  const details = {
    name: cookie.name,
    value: cookie.value,
    url: cookieUrl(targetUrl.origin, cookie.path),
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
  };

  const sameSite = { strict: "Strict", lax: "Lax", no_restriction: "None" }[cookie.sameSite];
  if (sameSite) details.sameSite = sameSite;
  if (cookie.priority) details.priority = cookie.priority;
  if (!cookie.session && Number.isFinite(cookie.expirationDate)) {
    details.expires = cookie.expirationDate;
  }
  if (shouldSetCookieDomain(cookie, targetUrl)) {
    details.domain = targetUrl.hostname;
  }
  if (cookie.partitionKey) {
    details.partitionKey = {
      topLevelSite: cookieSiteFromUrl(targetUrl),
      ...(cookie.partitionKey.hasCrossSiteAncestor !== undefined
        ? { hasCrossSiteAncestor: cookie.partitionKey.hasCrossSiteAncestor }
        : {}),
    };
  }
  return details;
}

async function copyWithCookiesApi(cookies, target) {
  const outcomes = await Promise.allSettled(
    cookies.map((cookie) => chrome.cookies.set(targetCookieDetails(cookie, target))),
  );
  const copied = outcomes.filter(
    (outcome) => outcome.status === "fulfilled" && outcome.value,
  ).length;
  return { copied, failed: outcomes.length - copied, transport: "cookies" };
}

async function copyWithDevToolsProtocol(cookies, target) {
  return withDebugger(target.tab.id, async (send) => {
    let copied = 0;
    let failed = 0;
    for (const cookie of cookies) {
      try {
        const result = await send("Network.setCookie", targetProtocolCookie(cookie, target.url));
        if (result?.success === false) failed += 1;
        else copied += 1;
      } catch {
        failed += 1;
      }
    }
    return { copied, failed, transport: "devtools-protocol" };
  });
}

async function copyStoredCookies(cookies, transport, targetTabId) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return { copied: 0, failed: 0, sourceCount: 0 };
  }
  const target = await getTabContext(targetTabId);
  const result =
    transport === "devtools-protocol"
      ? await copyWithDevToolsProtocol(cookies, target)
      : await copyWithCookiesApi(cookies, target);
  return { ...result, sourceCount: cookies.length };
}

async function writeTabStorage(tabId, state, options) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [
      {
        localStorage: Array.isArray(state?.localStorage) ? state.localStorage : [],
        sessionStorage: Array.isArray(state?.sessionStorage) ? state.sessionStorage : [],
      },
      options.localStorage,
      options.sessionStorage,
    ],
    func: (snapshot, copyLocalStorage, copySessionStorage) => {
      const replace = (storage, entries) => {
        storage.clear();
        for (const [key, value] of entries) storage.setItem(key, value);
        return entries.length;
      };
      return {
        localStorageCopied: copyLocalStorage
          ? replace(window.localStorage, snapshot.localStorage)
          : 0,
        sessionStorageCopied: copySessionStorage
          ? replace(window.sessionStorage, snapshot.sessionStorage)
          : 0,
      };
    },
  });
  return (
    injection?.result ?? {
      localStorageCopied: 0,
      sessionStorageCopied: 0,
    }
  );
}

/**
 * Applies a captured live session or saved persona to a destination tab.
 * Selected storage areas replace the destination area so stale persona keys do
 * not remain; cookies retain Chrome's usual set-by-name behavior.
 */
export async function syncStoredState(state, targetTabId, syncOptions) {
  const options = normalizeSyncOptions(syncOptions);
  const source = state && typeof state === "object" ? state : {};
  const result = {
    copied: 0,
    failed: 0,
    sourceCount: 0,
    appliedTypes: [],
    cookies: { copied: 0, failed: 0 },
    localStorage: { copied: 0 },
    sessionStorage: { copied: 0 },
  };

  if (options.cookies) {
    const cookies = await copyStoredCookies(source.cookies, source.cookieTransport, targetTabId);
    result.cookies = { copied: cookies.copied, failed: cookies.failed };
    result.copied += cookies.copied;
    result.failed += cookies.failed;
    result.sourceCount += cookies.sourceCount;
    if (cookies.copied > 0) result.appliedTypes.push("Cookies");
  }

  if (options.localStorage || options.sessionStorage) {
    const storage = await writeTabStorage(targetTabId, source, options);
    const localSourceCount = options.localStorage ? (source.localStorage?.length ?? 0) : 0;
    const sessionSourceCount = options.sessionStorage ? (source.sessionStorage?.length ?? 0) : 0;
    result.localStorage = { copied: storage.localStorageCopied };
    result.sessionStorage = { copied: storage.sessionStorageCopied };
    result.copied += storage.localStorageCopied + storage.sessionStorageCopied;
    result.sourceCount += localSourceCount + sessionSourceCount;
    if (options.localStorage) result.appliedTypes.push("Local Storage");
    if (options.sessionStorage) result.appliedTypes.push("Session Storage");
  }

  if (result.sourceCount === 0 && result.appliedTypes.length === 0) {
    result.reason = "source-empty";
  }
  return result;
}

/** Reads selected state from a source tab and applies it to a destination tab. */
export async function syncTabState(sourceTabId, targetTabId, syncOptions) {
  const source = await readTabState(sourceTabId, syncOptions);
  return syncStoredState(source, targetTabId, syncOptions);
}
