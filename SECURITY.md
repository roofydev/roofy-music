# Security Policy

## Supported Versions

Security fixes are provided for the latest public release and the current default branch.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately by opening a GitHub security advisory for this repository. Do not open a public issue for secrets, authentication bypasses, remote code execution, payment abuse, or other exploitable security issues.

Include:

- Affected version or commit.
- Steps to reproduce.
- Expected and observed behavior.
- Any logs or screenshots needed to understand the issue, with secrets redacted.

## Handling Secrets

Do not commit credentials, signing keys, `.env` files, local databases, generated app data, or private deployment configuration. Use local environment variables or GitHub Actions secrets for release credentials.
