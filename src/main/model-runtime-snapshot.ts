import type { RuntimeConfig } from "../shared/types";

export function modelRuntimeSnapshot(config: RuntimeConfig) {
  return {
    defaultModelProfileId: config.defaultModelProfileId,
    modelRoleAssignments: config.modelRoleAssignments,
    modelProfiles: config.modelProfiles,
    providerProfiles: config.providerProfiles,
  };
}

export function modelRuntimeChanged(previous: RuntimeConfig, next: RuntimeConfig) {
  return JSON.stringify(modelRuntimeSnapshot(previous)) !== JSON.stringify(modelRuntimeSnapshot(next));
}
