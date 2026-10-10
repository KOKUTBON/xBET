# Contributing to xBET Wager Platform

Thank you for helping improve xBET Wager Platform. Contributions may include bug fixes, tests, documentation, security hardening, accessibility improvements, and focused changes to the sportsbook, betting, casino, wallet, migration, or infrastructure components.

KOKUTBON maintains the complete Apache-2.0 source. Discuss substantial architectural work, new integrations, and changes involving third-party assets in an issue before investing significant effort.

## Before you begin

- Read the [README](README.md) and [code of conduct](CODE_OF_CONDUCT.md).
- Search existing issues and pull requests to avoid duplicate work.
- Keep real credentials, customer data, database exports, private media, and commercial provider data out of commits and test fixtures.
- Preserve copyright notices and third-party license files.
- Confirm that you have the right to contribute any code or asset you submit.

## Development setup

Use Node.js 24 or newer and npm 10 or newer.

```bash
npm install
cp .env.example .env
npm run build
```

Use development-only values in `.env`. PostgreSQL and Redis are required for database-backed and live-messaging workflows. Some migration utilities also require Python 3.

## Making a change

1. Create a short branch that describes the work.
2. Keep the change focused and avoid unrelated formatting or refactoring.
3. Add or update tests when behavior changes.
4. Update documentation when commands, APIs, configuration, or user behavior change.
5. Run the smallest relevant test suite, followed by broader checks when the change affects shared code.

Common checks:

```bash
npm run build
npm run test:web
npm run test:betting
npm run test:odds
npm run test:casino
npm run test:bridge
git diff --check
```

Run `npm test` for changes that cross service boundaries. If an unrelated known failure prevents a complete run, identify the exact failing test in the pull request and include the focused checks that passed.

## Pull request guidelines

A useful pull request includes:

- a clear problem statement and the reason for the change;
- a concise description of the implementation;
- the commands used to verify it;
- screenshots for visible interface changes;
- migration, compatibility, security, or operational considerations;
- links to related issues.

Do not combine generated bundles, dependency upgrades, large asset changes, and unrelated application behavior in one pull request unless they are inseparable. Regenerate committed browser output when its TypeScript source changes and explain how it was produced.

## Coding and documentation style

- Follow the conventions already used in the component you edit.
- Prefer explicit names and small, reviewable functions.
- Validate external input at service boundaries.
- Avoid hardcoded credentials, identities, balances, URLs, and production defaults.
- Keep documentation factual and distinguish simulations from production integrations.
- Use accessible HTML controls, visible focus states, and reduced-motion behavior for frontend work.

## Security reports

Do not open a public issue for a vulnerability that could expose accounts, credentials, funds, or private data. Follow [SECURITY.md](SECURITY.md) for private reporting.

## Conduct and licensing

All contributors must follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). By submitting a contribution, you represent that you are entitled to submit it under the applicable project terms. Contributions are accepted under the project's Apache-2.0 license.
