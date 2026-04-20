# Hermes Forge

Hermes Forge is a local-first desktop workspace for Hermes Agent, built with Electron, React and Tailwind CSS.

It wraps Hermes CLI, local workspaces, streaming task execution, runtime configuration and optional Windows / WSL bridge capabilities into a desktop client that can be inspected, modified and extended by the community.

Hermes Forge is not an official Hermes Agent client. It is an open community project for people who want to improve the local desktop experience around Hermes Agent.

## Status

This project is in early public release. The core desktop shell, Hermes runtime detection, one-click Hermes bootstrap flow, secure IPC boundary, local workspace model and Windows bridge foundation are already in place.

Some product areas are intentionally unfinished and need community help. See [Current Limitations](#current-limitations) and [ROADMAP.md](ROADMAP.md).

## Features

- Local-first Hermes workspace: run Hermes from your own machine and keep project files, sessions and runtime data local.
- Electron security boundary: renderer access is limited through a preload bridge and main-process IPC handlers.
- Streaming task surface: task state, Hermes output and tool events are projected into the desktop UI.
- Runtime profiles: configure Hermes root path, Windows / WSL mode, Python command, model providers and local endpoints.
- One-click Hermes bootstrap: detect Git, Python and Hermes CLI, clone Hermes Agent when missing, install dependencies and run a real health check.
- Workspace isolation: session folders, snapshots, file locks and attachment copies are managed outside renderer code.
- Windows bridge foundation: optional bridge layer for native Windows operations such as PowerShell, files, clipboard, screenshots and UI automation.
- Community-ready repository: MIT license, CI, issue templates, PR template, security notes and contribution guide.

## Quick Start

```bash
git clone https://github.com/Mahiruxia/hermes-forge.git
cd hermes-forge
npm install
cp .env.example .env
npm run dev
```

Windows PowerShell:

```powershell
git clone https://github.com/Mahiruxia/hermes-forge.git
cd hermes-forge
npm install
Copy-Item .env.example .env
npm run dev
```

Useful commands:

```bash
npm run check
npm test
npm run build
npm run package:portable
```

## Runtime Configuration

Hermes Forge does not hardcode a maintainer-specific Hermes path. The app resolves Hermes in this order:

1. Hermes root path saved in the app settings
2. `HERMES_HOME`
3. `HERMES_AGENT_HOME`
4. `%USERPROFILE%\Hermes Agent`
5. `<project-root>\Hermes Agent`

One-click bootstrap can be customized through:

```dotenv
HERMES_INSTALL_DIR=
HERMES_INSTALL_REPO_URL=https://github.com/NousResearch/hermes-agent.git
```

Real provider keys, bridge tokens and local model secrets should live in `.env` or app-managed local settings. Do not commit them.

## Current Limitations

Hermes Forge is usable, but it is not feature-complete. The following areas are known gaps and good contribution targets:

- WeChat QR login is not production-ready. The connector registry and UI placeholders exist, but the end-to-end QR session lifecycle, polling, confirmation state, token persistence, gateway handoff and error recovery still need implementation.
- Connector gateway orchestration is incomplete. Several platform connectors expose configuration surfaces, but many still need real runtime adapters, health checks, credential validation and lifecycle management.
- First-run onboarding needs refinement. Hermes detection and bootstrap work, but the UI should provide clearer progress details, retry paths, dependency diagnostics and manual fallback guidance.
- Model configuration is still developer-oriented. Local OpenAI-compatible endpoints, provider profiles and secret references need a more guided setup flow with live validation and safer defaults.
- Windows bridge permissions need stronger UX. The backend permission boundary exists, but high-impact file, shell, keyboard and clipboard actions need clearer consent prompts and audit trails.
- Cross-platform support is not verified. The project is currently optimized for Windows and WSL; macOS and Linux packaging, runtime discovery and bridge behavior need maintainers to test and adapt them.
- Release packaging is unsigned. Windows portable and installer builds are available, but code signing, release provenance, auto-update channels and installer hardening are not done.
- Plugin architecture is not formalized. Panels, tools, providers and connector extensions need a stable extension contract before external plugin authors can build confidently.
- Documentation needs real-world examples. The repository needs screenshots, architecture diagrams, troubleshooting guides and sample workflows from actual users.

## Project Structure

```text
src/
  main/       Electron main process, IPC, runtime config and native services
  preload/    Safe renderer bridge
  renderer/   React UI, dashboard panels, store and styles
  adapters/   Hermes adapter and engine abstraction
  process/    Task runner, command runner, snapshots and workspace locks
  memory/     Memory broker and context budgeting
  security/   Path validation and permission utilities
  shared/     Shared TypeScript types, schemas and IPC contracts
  setup/      First-run checks and Hermes bootstrap flow
```

## Contributing

Hermes Forge is being released so the community can reshape it. Contributions are welcome in code, design, docs, testing, packaging and security review.

Good first directions:

- Implement the WeChat QR login lifecycle end to end.
- Improve Hermes first-run setup and dependency diagnostics.
- Add real connector adapters and gateway health checks.
- Design a safer permission review flow for Windows bridge actions.
- Add macOS and Linux runtime notes or packaging support.
- Propose a plugin API for panels, tools and provider integrations.
- Improve README screenshots, architecture docs and troubleshooting guides.

Before opening a PR:

```bash
npm run check
npm test
```

Draft PRs are welcome. Please describe the user impact, security implications and validation steps.

## Security

- Never commit `.env`, local Hermes config, Electron `user-data`, logs, snapshots or build output.
- Renderer code should not access plaintext credentials.
- IPC handlers should stay schema-validated and allowlisted.
- Bridge tokens should be generated at runtime and redacted from logs.
- File writes, command execution and native bridge calls should pass through explicit permission checks.

For security reports and handling expectations, see [SECURITY.md](SECURITY.md).

## License

MIT
