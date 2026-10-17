# Session Bridge

[![CI](https://github.com/TsofnatMaman/session-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/TsofnatMaman/session-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Chrome extension (Manifest V3) for developers who test apps that require sign-in. It has two main
purposes:

1. **Test multi-user and multi-tenant systems easily.** Save the signed-in sessions of several users
   (for example an admin, a member and a user from another tenant) and switch between them in one
   click, without logging in and out.
2. **Test Vercel deployments without logging in again.** Copy your signed-in session from one
   deployment to another (production → preview, preview → preview) so every new deployment is
   immediately usable.

It also works with `localhost` and any other http(s) site. It has no backend, no accounts and no
network access of its own, and it is independent of your framework, database and authentication
provider.

## Features

### Multi-user testing (personas)

- **Test personas**: save named, local-only snapshots of a signed-in session (`Admin`, `Member`,
  `Tenant B owner`, …) per project and apply any of them later, without keeping the source tab open.
- Each persona shows when it was captured and when its earliest cookie expires, so you know when to
  refresh it.

### Vercel deployments

- **Copy a session to any deployment**: open a preview and sync from your source deployment (or from
  a saved persona) in one click.
- **Auto-sync** for new tabs whose host matches exactly one project's pattern (for example
  `my-app-*.vercel.app`). It runs once per tab and only on sites you already granted access to.
- **Projects**: save several source sites and switch between them before each sync.

### General

- **Any http(s) site** as source or destination: Vercel previews, `localhost` / `127.0.0.1`, staging
  and production domains.
- **Choose what to copy** per project: cookies, Local Storage, Session Storage (all by default).
  `HttpOnly` and partitioned cookies are included when Chrome allows it; path, expiry, `Secure`,
  `SameSite` and partition data are preserved.
- **Safety checks**: syncing between unrelated sites stays disabled until you acknowledge that the
  destination will receive the source's session. Values are never displayed or sent anywhere.

## Install

The extension is not on the Chrome Web Store yet. To load it from source:

1. Clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the [`src/`](src) directory.

## Usage

1. Open the site that holds the session you want to copy and click the Session Bridge icon.
2. On first run, click **Use … as the source** to create a project (or use **Project setup** to name
   it and enter a hostname).
3. Under **What to copy**, pick the data types to sync.
4. Open the destination site (a preview, `localhost`, …) and click **Sync … to this site**. Chrome
   asks for access to the site the first time.

The destination tab reloads after a successful sync. If part of the sync fails, the popup stays open
and lists what was skipped.

### Switching between test users

Sign in as a user in the source tab, open **Saved test personas**, keep **Live source session**
selected, enter a name and click **Save new persona**. Select a saved persona to sync it without the
source tab. Personas contain authentication cookies and live only in `chrome.storage.local` for the
current Chrome profile; removing a project removes its personas.

### Auto-sync patterns

A target pattern allows at most one `*` and must end in a real domain (at least two fixed labels), so
`*.com` is rejected. For a Vercel source such as `my-app.vercel.app`, the suggested pattern
`my-app-*.vercel.app` matches Vercel's preview names. Auto-sync refuses to guess when more than one
project matches a host, and it never copies a session between unrelated sites.

## Permissions

| Permission                            | Why it is needed                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `tabs`, `storage`                     | Find source and destination tabs; store settings.                                                                |
| `cookies`                             | Read and set cookies for permitted hosts.                                                                        |
| `scripting`                           | Read and write Local Storage and Session Storage in the selected tabs.                                           |
| `debugger`                            | Short-lived fallback when the Cookies API omits cookies visible in DevTools. Chrome may show a debugging banner. |
| `unlimitedStorage`                    | Keep several persona snapshots.                                                                                  |
| `https://*.vercel.app/*`              | Granted at install for Vercel deployments.                                                                       |
| Optional: `https://*/*`, `http://*/*` | Requested per site, only when you sync or save a persona.                                                        |

## Security and privacy

Session cookies are credentials. Only sync to sites you trust and treat access to your Chrome profile
as access to any saved personas. See [SECURITY.md](SECURITY.md) for details and how to report a
vulnerability.

## Development

Requires Node.js 20 or newer.

```bash
npm ci
npm run check   # lint + format check + tests
```

| Script                 | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `npm test`             | Unit tests (`node --test`)                     |
| `npm run lint`         | ESLint                                         |
| `npm run format`       | Format with Prettier                           |
| `npm run format:check` | Verify formatting                              |
| `npm run build:icons`  | Regenerate PNG icons from `src/icons/icon.svg` |

### Project structure

```text
src/                     The unpacked extension (load this folder in Chrome)
  manifest.json
  background.js          Guarded auto-sync workflow
  popup.html|css|js      Onboarding and manual-sync UI
  icons/                 icon.svg is the single source for the popup and toolbar icons
  core/                  Pure, browser-independent logic
    urls.js              Host validation, permission patterns, cross-site safeguards
    projects.js          Project validation and auto-routing rules
    sync-options.js      Per-project selection of data types
    sync-summary.js      Human-readable sync results
    config.js            Persisted settings
  platform/              Chrome API adapters
    cookie-store.js      Cookies, storage and DevTools-Protocol adapter
    persona-vault.js     Local-only persona storage
    auto-sync-ledger.js  Per-tab record of automatic syncs
tests/                   Unit tests for the core and storage modules
scripts/                 Maintenance scripts (build-icons.js renders the PNG icons)
```

`core/` has no dependency on Chrome APIs, so it is covered by unit tests. The `platform/` adapters,
popup and background worker need a loaded extension to verify; see [CONTRIBUTING.md](CONTRIBUTING.md)
for the manual checklist.

## Known limitations

- Only Local Storage and Session Storage are copied alongside cookies. IndexedDB, Cache Storage,
  in-memory state and credentials held outside cookies are not.
- Source and destination are compared by hostname, so two ports on the same host
  (`localhost:3000` → `localhost:4000`) cannot be synced.
- Applications that rely on server-side sessions bound to a host, different auth audiences or
  redirect settings may not accept a copied session.
- This is not a Vercel administration client: it does not use the Vercel API.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first, and see the
[changelog](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)
