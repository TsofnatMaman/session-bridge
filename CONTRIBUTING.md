# Contributing

Thanks for your interest in Session Bridge! Bug reports, ideas and pull requests are welcome.

## Getting started

```bash
git clone https://github.com/TsofnatMaman/session-bridge.git
cd session-bridge
npm ci
npm run check
```

Load the [`src/`](src) folder in `chrome://extensions` (Developer mode → **Load unpacked**) to try
your changes. Reload the extension after editing files.

## Workflow

1. Open an issue first for anything beyond a small fix, so the approach can be agreed.
2. Create a branch from `main` and keep the change focused on one concern.
3. Run `npm run check` (lint, formatting and tests) before pushing.
4. Open a pull request and fill in the template.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Guidelines

- Keep browser-independent logic in `src/core/` and Chrome API calls in `src/platform/`, popup or
  background code. Logic in `core/` must be covered by unit tests.
- The icon lives in one place, `src/icons/icon.svg`; the popup uses it directly. After editing it, run `npm run build:icons` and commit the regenerated PNGs.
- Never log, display or transmit cookie or storage values.
- Request the minimum permissions; new permissions need a justification in the pull request and an
  entry in the README permissions table.
- Update `CHANGELOG.md` under an "Unreleased" heading for user-visible changes.

## Manual verification

The popup, background worker and `platform/` adapters are not covered by automated tests. For
changes that touch them, verify in a loaded extension:

- Manual sync of cookies, Local Storage and Session Storage between two sites.
- The permission prompt on a site that has not been granted yet.
- Persona capture, switch and delete.
- Auto-sync runs once per tab, and the overlap warning appears for conflicting patterns.
- Cross-site acknowledgement keeps **Sync** disabled until ticked.

## Reporting security issues

Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
