# xBET release checklist

- Run documented component tests and required hosted checks on the exact candidate commit.
- Scan the candidate for secrets and dependency vulnerabilities.
- Preserve LICENSE, NOTICE and all third-party license/attribution files.
- Use synthetic fixtures; exclude credentials, private data and internal working notes.
- Review documented deployment prerequisites and security limitations.
- Obtain an organization owner's publication decision; this repository remains private until then.
- After publication enable private vulnerability reporting, supported security scanning and branch protection.
- Publish release evidence and artifacts only after the relevant release gates pass.

xBET is a points-only reference and simulation platform. Database-backed pilot and container validation are required before operating a pilot; real-money services are outside its supported deployment.
