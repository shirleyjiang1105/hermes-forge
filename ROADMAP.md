# Hermes Forge Roadmap

Hermes Forge is an early community release. The goal is to turn a working local Hermes desktop shell into a reliable, extensible and privacy-conscious desktop workspace.

## High Priority

- Finish WeChat QR login: QR generation, polling, confirmation state, timeout handling, token persistence, gateway handoff and recovery from expired sessions.
- Stabilize first-run setup: dependency diagnostics, Hermes install progress, retry actions, manual path selection and clearer failure messages.
- Harden model setup: guided local endpoint configuration, provider profile validation, secret reference checks and live connection tests.
- Improve Windows bridge consent: explicit permission review, command previews, audit logging and safer defaults for file writes and shell actions.

## Connectors and Automation

- Implement production-grade connector adapters beyond static configuration forms.
- Add connector health checks and gateway lifecycle controls.
- Keep secrets in main-process storage and prevent renderer-side credential exposure.
- Define connector test fixtures so contributors can validate behavior without real accounts.

## Platform and Packaging

- Verify Windows installer and portable builds on clean machines.
- Add code signing and release provenance.
- Document WSL assumptions and failure modes.
- Add macOS and Linux runtime discovery once maintainers can test those platforms.
- Explore auto-update channels after release signing is solved.

## Extension System

- Design a plugin contract for dashboard panels, Hermes tools, model providers and connector packs.
- Define extension permissions and review boundaries.
- Add examples for a minimal panel plugin and a minimal connector plugin.

## Security and Privacy

- Expand tests for path validation, IPC schemas and command execution boundaries.
- Improve redaction for diagnostics, logs and copied error output.
- Document the local-agent threat model.
- Add security review checklist for PRs touching IPC, secrets, bridges or process execution.

## Documentation

- Add screenshots and short demos.
- Add architecture diagrams for IPC, task execution, setup and bridge access.
- Add troubleshooting guides for Hermes CLI, Python, WSL, local model endpoints and packaging.
- Translate core docs between Chinese and English as the community grows.
