# Hermes Forge Roadmap

This roadmap is intentionally community-friendly. Pick an area, open an issue, sketch the approach, and send a Draft PR when you want early feedback.

## 0.1 Release Readiness

- Finish public naming and release metadata.
- Keep the repository free of local paths, secrets, logs, caches and build output.
- Publish clear setup, build and contribution docs.
- Add a basic GitHub Actions workflow for typecheck, tests and build.

## Desktop Experience

- Improve first-run onboarding for Hermes path selection and model setup.
- Add a theme system with documented tokens.
- Refine the glass UI for accessibility, contrast and keyboard navigation.
- Add better empty states for new users who have not configured Hermes yet.

## Runtime and Platform

- Harden Windows / WSL runtime detection.
- Add macOS and Linux runtime notes once maintainers can test those flows.
- Improve diagnostics for Python, Hermes CLI, local models and bridge connectivity.
- Make packaging output easier to sign and publish.

## Extensions

- Define a plugin contract for panels, tools and provider integrations.
- Add connector presets without storing secrets in the renderer.
- Support community-maintained tool packs and setup recipes.

## Security and Privacy

- Expand tests around path validation, IPC schemas and command permissions.
- Improve redaction for diagnostics, logs and copied error output.
- Add permission review UX before high-impact tool calls.
- Document the threat model for local Agent operations.

## Documentation

- Add screenshots or short demos after the UI stabilizes.
- Add troubleshooting for common Hermes, WSL and local model issues.
- Add architecture diagrams for IPC, task execution and bridge access.
- Translate core docs between Chinese and English as community bandwidth allows.
