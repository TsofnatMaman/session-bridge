# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [2.0.0]

### Added

- Any http(s) site, including `localhost` and `127.0.0.1`, can be a source or destination. Sites
  outside `*.vercel.app` are optional host permissions requested on demand.
- Per-project choice of data types to copy (cookies, Local Storage, Session Storage).
- Saved test personas with capture time and cookie-expiry hints.
- Auto-sync for new tabs matching a single project's target pattern, with an overlap warning when
  saving conflicting patterns and a ✓ badge on tabs where a session was applied.
- Per-type sync summary that reports skipped cookies and keeps the popup open on partial failure.
- Inline acknowledgement required before copying a session between unrelated sites.
- "Open source site in a new tab" shortcut and one-click first-run project creation.

### Changed

- Renamed from "Vercel Preview Session Sync" to **Session Bridge**.
- Redesigned the popup around a sync-first flow; the popup is now available on every tab.
- Auto-sync runs once per tab and deployment, tracked in `chrome.storage.session`.
- Confirmation before deleting a project or persona.

### Fixed

- Target patterns no longer match hosts shorter than their fixed prefix and suffix combined.
- Failures in popup handlers are shown to the user instead of being silently dropped.

### Removed

- Migration code for settings saved in earlier formats. Data stored in those formats is no longer
  read.
