# Security Policy

## Project status

xBET Wager Platform is undergoing security, ownership, and release review. No version is currently approved for production use, real-money gambling, or customer data.

## Supported versions

Security fixes are considered only for the current default branch. There are no supported production releases or long-term-support branches at this time.

| Version | Supported |
| --- | --- |
| Default branch | Best effort during development |
| Tagged or packaged releases | No supported release currently exists |
| Legacy CakePHP application | Fully decommissioned and removed from repository |

## Reporting a vulnerability

Do not report exploitable security issues in a public issue, discussion, or pull request.

Use GitHub's private vulnerability reporting or a private security advisory for this repository when available. Email kokutbon@gmail.com for private reports; GitHub private vulnerability reporting may require publication first. Do not send secrets, personal data, or working exploit material until a secure channel has been confirmed.

Include enough information to reproduce and assess the issue:

- affected component, file, route, or commit;
- vulnerability type and likely impact;
- required configuration or preconditions;
- minimal reproduction steps or proof of concept;
- suggested remediation, if known;
- whether the issue may expose credentials, funds, or personal data.

## Response process

The maintainers should acknowledge a valid private report, reproduce it, assess affected versions, prepare a fix, and coordinate disclosure. Response times are not guaranteed while the project has no formal security team. Please avoid public disclosure until a fix or reasonable coordination period has been agreed.

## Security expectations

- Never commit real passwords, API keys, payment credentials, signing material, database dumps, customer information, or private media.
- Treat any credential found in Git history as compromised and rotate it.
- Replace development defaults before running services on a shared network.
- Use test accounts and synthetic data only.
- Independently review authentication, authorization, wallet operations, payment webhooks, iframe or cross-window messaging, CORS, and deployment secrets before production use.
- Preserve evidence needed to investigate a suspected incident.

## Out of scope for guarantees

Automated tests, demonstration cryptography, simulated ledgers, or “provably fair” labels do not constitute an independent security, financial, fairness, legal, or regulatory certification.
