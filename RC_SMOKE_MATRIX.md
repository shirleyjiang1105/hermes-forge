# Hermes Forge RC Smoke Matrix

This matrix is the release-candidate gate for the WSL main path after session, metadata, capability negotiation, permission overview, and front-end overview unification.

## Matrix

| ID | Combination | Expected Result | Gate |
| --- | --- | --- | --- |
| M1 | `WSL + bridge_guarded + guarded` | Runnable, `native-arg-env`, green preflight | P0 |
| M2 | `WSL + passthrough + guarded` | Runnable, yellow preflight, no blocked mismatch | P1 |
| M3 | `WSL + bridge_guarded + yolo` | Runnable, yellow preflight, CLI mode shown as `yolo` everywhere | P1 |
| M4 | `WSL + restricted_workspace` | Blocked everywhere with `policy_not_enforceable` | P0 |
| M5 | `CLI capability below minimum gate` | Blocked everywhere with capability-based block reason | P0 |
| M6 | `Bridge disabled / capability not reported` | Bridge panel shows "backend did not report capability" or disabled state consistently | P1 |
| M7 | `sessionMode = fresh / resumed / degraded` | Settings, preflight strip, agent panel, and diagnostics keep the same session mode semantics | P1 |

## Consistency Targets

Every matrix row should keep these surfaces aligned:

- `SettingsPanel`
- `ChatInput` preflight strip
- `AgentRunPanel`
- task diagnostics / exported diagnostics

## Release Gate

### P0 blockers

- Any blocked state differs across the four surfaces.
- WSL main path runs without `native-arg-env`.
- `restricted_workspace` does not block.
- Capability gate failure does not block.
- Diagnostics export misses `permissionOverview`, `capabilityProbe`, `taskDiagnostics`, or `sessionMappings`.

### P1 warnings

- `passthrough` / `yolo` risk strip tone differs from overview.
- Bridge capability display is inconsistent when backend reports no capabilities.
- `sessionMode = degraded` is not clearly shown.

## Diagnostic Bundle Minimum

The RC diagnostic bundle must include or embed:

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

