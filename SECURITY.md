# Security Policy

Hermes Forge is a local-first desktop client that can interact with local files, commands, provider credentials and optional Windows bridge tools. Please treat security reports seriously and avoid publishing exploit details before a fix is available.

## Supported Versions

The project is currently pre-1.0. Security fixes target the `main` branch first.

## Reporting a Vulnerability

Please open a private security advisory on GitHub when available. If private advisories are not enabled yet, open an issue with a minimal description and avoid including secrets, exploit payloads or private environment details in public text.

Useful report details:

- Affected version or commit
- Operating system and runtime mode, such as Windows or WSL
- Steps to reproduce
- Expected and actual behavior
- Whether the issue touches secrets, IPC, path validation, file writes, command execution, bridge tokens or packaged builds

## Sensitive Data Rules

Do not commit:

- `.env` files with real keys
- Hermes Agent local config
- Electron `user-data/`
- session logs, snapshots or local workspaces
- bridge tokens or provider API keys
- packaged output from `release/`, `dist/`, `out/` or `build/`

## Runtime Boundaries

- Renderer code should not access plaintext credentials.
- IPC channels should stay allowlisted and schema-validated.
- File reads, file writes and command execution should pass through main-process permission checks.
- Windows bridge tokens should be generated at runtime and never appear in source code, logs or screenshots.
- Diagnostic exports should redact secrets and local-only identifiers where possible.
