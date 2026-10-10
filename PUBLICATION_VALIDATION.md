# Initial source validation

Local validation date: 10 October 2026.

Executed on macOS with Node 24.11.1, Python 3.12, Java 21/25 and the project-specific tools where applicable. This covers local source preparation, not every supported OS/runtime combination or production deployment.

## Passed checks

- Community/publication baseline and reporting-contact checks.
- Candidate source secret scan with Gitleaks: no untriaged findings. Known public contract addresses/checksums in DORON have exact, scoped exceptions.
- Workflow/community YAML syntax and duplicate-key validation.
- Root README local file/image links resolve.

| Working directory | Executed check | Result |
| --- | --- | --- |
| `.` | `points migrations, PostgreSQL acceptance, test:pilot, typecheck:pilot` | Passed |
| `.` | `npm test` | Passed |
| `.` | `npm run build` | Passed |
| `.` | `npm run test:demo` | Passed |
| `.` | `npm run build:pages` | Passed |

## Dependency audits

- npm lockfile audit (root): 0 known vulnerabilities reported, including development dependencies.

## Remaining boundaries

- Hosted GitHub Actions must be rerun on the initial commit. The previous hosted jobs were prevented from starting by GitHub billing/spending-limit restrictions; local success does not resolve the account restriction.
- Enable supported public-repository protections and private vulnerability reporting after visibility changes using the organization finalizer. The repositories remain private during preparation.
- Demo hosting and package/container publication are manual and separate from source visibility.
- No live provider, real user/customer data, production financial activity or physical hardware deployment was validated. Container runtime/restore checks and platform-specific hosted matrices remain separate where not listed above.
- Dependency metadata is recorded in THIRD_PARTY_INVENTORY.json; preserve upstream license files for anything bundled. An inventory is not a rights assignment or external certification.

Only points-based simulation is in scope. Passing local PostgreSQL pilot checks does not authorize real-money services or replace an observed deployment pilot.
