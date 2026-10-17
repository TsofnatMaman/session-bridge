# Security Policy

Session Bridge handles authentication cookies and browser storage, so security reports are taken
seriously.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository
(<https://github.com/TsofnatMaman/session-bridge/security/advisories/new>).

Include the affected version, steps to reproduce and the impact you observed. You can expect an
initial response within a few days.

## Supported versions

Only the latest release receives security fixes.

## Security model

- Cookie and storage values stay inside your Chrome profile. The extension makes no network
  requests and has no remote components.
- Persona snapshots are stored unencrypted in `chrome.storage.local`. Anyone with access to your
  Chrome profile can read them.
- Copying a session gives the destination site the source's signed-in state. The extension requires
  an explicit acknowledgement for unrelated sites and never auto-syncs across them.
- The `debugger` permission is used only as a short-lived fallback to read cookies the Cookies API
  does not return.
