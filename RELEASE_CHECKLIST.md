# Hermes Forge Release Checklist

This checklist is for small stability releases such as v0.1.3. Do not include local secrets, `.env`, user-data, logs, snapshots, or private paths in release notes.

## Command Checks

Run these from the repository root:

```powershell
npm run check
npm test
npm run build
npm run package:portable
```

## RC Smoke Matrix

Run and record these combinations before RC:

- `WSL + bridge_guarded + guarded`
- `WSL + passthrough + guarded`
- `WSL + bridge_guarded + yolo`
- `WSL + restricted_workspace -> blocked`
- `CLI capability below minimum gate -> blocked`
- `Bridge disabled / capability not reported`
- `sessionMode = fresh / resumed / degraded`

For each combination, confirm these areas stay consistent:

- `SettingsPanel`
- `ChatInput` preflight strip
- `AgentRunPanel`
- task diagnostics / last report

## Release Gate

### P0 - Must Pass For RC

- WSL main path enters only with `native-arg-env` transport.
- `restricted_workspace` is blocked everywhere with the same reason.
- CLI capability below minimum gate is blocked everywhere with the same reason.
- `SettingsPanel`, `ChatInput`, `AgentRunPanel`, and diagnostics agree on:
  - `permissionPolicy`
  - `cliPermissionMode`
  - `transport`
  - `blocked`
- Diagnostics export contains:
  - runtime config summary
  - capability probe
  - permission overview
  - WSL doctor
  - last install report
  - task diagnostics
  - session mapping
  - transport / policy / bridge status

### P1 - Should Pass Before Wide Rollout

- Bridge capability display clearly distinguishes "backend did not report capability".
- `sessionMode` display is consistent for `fresh`, `resumed`, and `degraded`.
- Permission overview refreshes after config changes without requiring app restart.

## Manual Acceptance

- Launch the client from the packaged app.
- Confirm the chat input shows model, workspace, and permission status.
- Configure a model source, test the connection, then save it as default.
- Send 5 normal text tasks in one session and confirm each reaches a final result.
- Create a second session, send 2-3 tasks, then switch back and confirm history does not mix.
- Quit and reopen the app, then confirm recent session history is restored.
- Upload one file or image attachment and send a task with it.
- Trigger an approval flow and test both allow and deny.
- Export diagnostics from the app and confirm the output path is shown.

## Diagnostic Bundle Structure

The exported diagnostics package should contain or embed at least:

- `runtimeConfigSummary`
- `runtimeConfig`
- `permissionOverview`
- `probes`
- `runtimeProbe`
- `wslDoctor`
- `lastInstallReport`
- `taskDiagnostics`
- `sessionMappings`
- `recentEvents`
- transport / policy / bridge state inside `permissionOverview`

## Release Notes Minimum

- Version number and date.
- User-facing fixes.
- Known limitations.
- Any manual verification completed.
