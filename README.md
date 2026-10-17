# Session Bridge

Session Bridge is a browser-native developer tool for mirroring a selected environment's browser state into an open tab (Vercel previews, localhost, or any site). It is useful when a preview needs the same signed-in browser state as a source environment.

It is independent of application framework, database, authentication provider, and backend. It does not require Supabase, a Vercel token, a Vercel account connection, or a server-side component.

## What it does

- Works on any http(s) site: Vercel previews, `localhost` / `127.0.0.1` (any port), or any other domain, as source or destination.
- Saves multiple project profiles, each with its own source hostname.
- Lets you switch the selected project before every manual sync.
- Uses the current tab as the destination. Chrome asks for access to a site the first time you sync with it; automatic sync only runs on sites that were already allowed.
- Lets each project choose what to copy: Cookies, Local Storage, Session Storage, or all three (the default).
- Copies every selected cookie scoped to the source host, including `HttpOnly` and partitioned cookies when Chrome permits it.
- Replaces selected Local Storage and Session Storage areas in the destination with the source snapshot, avoiding stale browser-state keys.
- Preserves cookie path, expiry, Secure, SameSite, and partition data while changing the cookie domain to the target deployment.
- Can optionally sync a newly opened tab when exactly one saved project has a matching target-hostname pattern (for example `marketing-*.vercel.app` or `*.staging.example.com`).
- Can save several named, local-only cookie snapshots (test personas) for each project and reuse them without signing in again.
- Never displays browser-data values or transmits them off the browser.

## What it does not do

This release is a session-bridge extension, not a Vercel administration client. It does not list Vercel projects, retrieve deployments or logs, change Vercel environment variables, or connect to the Vercel REST API. Those capabilities require a separately designed OAuth/token flow and a backend/security review; they are intentionally not implied or simulated here.

It does not copy IndexedDB, Cache Storage, in-memory application state, or credentials held outside cookies. Local Storage and Session Storage are supported when selected.

Source: https://github.com/TsofnatMaman/session-bridge

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `vercel-extension` directory.
4. Accept Chrome's requested permissions.

The extension requests:

- `tabs` and `storage` for source/target selection and local configuration.
- `cookies` to read and set browser cookies for permitted hosts.
- `scripting` to read and write Local Storage and Session Storage in the selected tabs.
- `debugger` only as a short-lived fallback when Chrome's Cookies API omits cookies that DevTools can see. Chrome may show a temporary debugging indicator.
- `unlimitedStorage` to retain several optional local test-persona snapshots, which can contain session cookies.
- Access to `https://*.vercel.app/*` is granted at install. Every other site is an optional host permission: Chrome asks for it only when you sync (or save a persona) and never requests access to all sites at install.
- Copying a session between unrelated sites (different registrable domains, excluding localhost) keeps the Sync button disabled until you tick a checkbox confirming you trust the destination, because that site receives the source's signed-in session. The checkbox resets each time you open the popup.

## Use

1. Open the site that has the browser state for your first project (a Vercel deployment, or any other site).
2. Open Session Bridge, either click **Use … as the source** on the first run (one click creates the project), or open **Project setup**, name it, choose **Use current tab as source** (or type a hostname) and save.
3. Under **What to copy**, keep all three default choices or select only Cookies, Local Storage, and/or Session Storage. The choice is saved automatically for that project.
4. Repeat for every other project. Keep the relevant source tabs open while working, unless you use a saved test persona.
5. Navigate to the destination (a preview, `localhost`, or any other site) and select **Sync … to this site**. The sync plan immediately above the button names the exact source, destination, and selected data types.

The deployment reloads after a successful sync. If part of the sync fails (for example some cookies cannot be set) the popup stays open and says what was skipped. When the source site is not open, **Open source site in a new tab** appears under the source fields. After an automatic sync, the toolbar icon shows a ✓ badge on that tab. Manual sync works for any different `*.vercel.app` destination and ignores the saved target pattern.

### Test personas

For each project, **Live source session** copies the browser state currently present in its open source tab. To keep several test users, sign in as a user once, open **Saved test personas**, select **Live source session**, name the persona (for example, `Admin` or `Member`), then select **Save new persona**. Select a saved persona to sync it without keeping the source tab open. Select **Live source session** at any time to return to current source-tab browser state.

Persona snapshots include authentication cookies. They are stored only in `chrome.storage.local` for this Chrome profile: the extension never displays them, sends them over the network, or puts them in `chrome.storage.sync`. Removing a project also removes its personas from this Chrome profile. Treat access to this Chrome profile as access to the saved personas.

For automatic routing, the target-pattern field is prefilled from the source name. For a Vercel source, `my-app.vercel.app` suggests `my-app-*.vercel.app`, which matches Vercel's `my-app-<hash>-<team>` and `my-app-git-<branch>-<team>` preview names. You can edit it to another pattern, such as `marketing-site-*.vercel.app`, or an exact hostname such as `marketing-release.vercel.app`. Enable **Auto-sync new previews** only when patterns do not overlap: the extension refuses to guess when more than one profile matches a deployment. A missing pattern never blocks manual sync. Saving a pattern that overlaps another project shows a warning. Automatic sync never copies a session between unrelated sites (it cannot ask for confirmation), so use manual sync for those. Automatic sync runs once per tab and deployment; after that, use manual sync to re-apply the session.

If Chrome's Cookies API returns an empty result despite the cookies appearing in DevTools, the extension temporarily uses the Chrome DevTools Protocol. Close DevTools for the source and destination tabs first: Chrome disconnects `chrome.debugger` when DevTools is opened.

## Architecture

```text
core/
  urls.js          Host validation, permission patterns, and cross-site safeguards
  sync-options.js  Per-project selection of supported browser-state types
  config.js        Persisted user configuration
  projects.js      Project-profile validation and auto-routing rules
platform/
  cookie-store.js  Chrome cookie and DevTools-Protocol adapter
  persona-vault.js Local-only test-persona snapshot storage
  auto-sync-ledger.js Per-tab record of automatic syncs (session storage)
background.js      Optional, guarded auto-sync workflow
popup.*            Onboarding and explicit manual-sync UI
tests/             Pure core unit tests
```

The core modules do not know about Supabase, Vercel APIs, an application framework, or an auth provider. `platform/cookie-store.js` is the browser-infrastructure boundary; a different browser/runtime adapter can replace it without changing URL validation, configuration, or UI workflow.

## Configuration

There are no environment variables, embedded secrets, API keys, or remote services. Project settings (label, Vercel source hostname, optional target pattern, and selected data types), the selected project, and the auto-sync preference are stored in `chrome.storage.sync`. Test-persona snapshots, including cookie values and selected browser storage, are stored separately in `chrome.storage.local` only for the current Chrome profile.

## Development and verification

Requires a current Node.js release for tests.

```powershell
npm test
node --check background.js
node --check popup.js
node --check platform/cookie-store.js
```

The unit tests cover host validation, same-host safeguards, target-pattern matching, project-profile validation, data-type selection, local persona storage, and safe auto-routing. Browser API calls require a manually loaded Chrome extension and are deliberately not faked in the test suite.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| The sync button is disabled | Keep the source tab open (or select a saved persona) and use a tab on a different host as destination. |
| Auto-sync does not run | Add a unique Vercel target pattern to the relevant project. Automatic sync is intentionally disabled for missing or ambiguous matches. If a saved persona is selected, that persona is used; otherwise the current source tab is used. |
| Expected browser state is missing | Enable the relevant type under **What to copy**. IndexedDB and Cache Storage are not copied by this release. |
| Sync is unavailable | The popup opens on any tab. Syncing needs a regular http/https destination tab, and Chrome access to the sites involved (allow the prompt). |
| `debugger` or `attach` error | Close DevTools for both tabs and retry. |
| Destination is not signed in | The application may use non-cookie state, different auth audience/redirect settings, or a server-side session that cannot be reused across hosts. |

## Extension points

Future versions can add a separate Vercel API client (OAuth/token handling, project/deployment metadata, and logs) behind its own platform boundary. It must remain optional: browser-state syncing should continue to work without a Vercel API integration or any database/auth vendor adapter.
