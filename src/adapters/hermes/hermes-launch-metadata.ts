import fs from "node:fs/promises";
import path from "node:path";
import type { EngineRunRequest, HermesRuntimeConfig, SessionAttachment } from "../../shared/types";

export const HERMES_LAUNCH_METADATA_ENV = "HERMES_FORGE_LAUNCH_METADATA";
export const HERMES_LAUNCH_METADATA_VERSION_ENV = "HERMES_FORGE_LAUNCH_METADATA_VERSION";
export const HERMES_LAUNCH_METADATA_FIELDS_ENV = "HERMES_FORGE_LAUNCH_METADATA_FIELDS";
export const HERMES_LAUNCH_METADATA_DIAGNOSTICS_ENV = "HERMES_FORGE_LAUNCH_METADATA_DIAGNOSTICS";

export type LaunchMetadataPath = {
  windowsPath: string;
  runtimePath: string;
};

export type LaunchMetadataAttachment = LaunchMetadataPath & {
  id: string;
  name: string;
  kind: SessionAttachment["kind"];
  originalWindowsPath?: string;
  originalRuntimePath?: string;
};

export type LaunchMetadataBridge = {
  enabled: boolean;
  available: boolean;
  mode?: HermesRuntimeConfig["windowsAgentMode"];
  capabilities: string[];
  reason?: string;
};

export type LaunchMetadataCliSession = {
  status: "fresh" | "resumed" | "continued" | "degraded";
  forgeSessionId?: string;
  cliSessionId?: string;
  degradationReason?: string;
};

export type HermesLaunchMetadataV1 = {
  version: 1;
  createdAt: string;
  forgeSessionId?: string;
  taskRunId: string;
  workspace: LaunchMetadataPath;
  selectedFilePaths: LaunchMetadataPath[];
  attachmentPaths: LaunchMetadataAttachment[];
  imagePaths: LaunchMetadataPath[];
  windowsDesktopPathAlias?: LaunchMetadataPath & { alias: "desktop" };
  bridgeAvailability: LaunchMetadataBridge;
  cliSession: LaunchMetadataCliSession;
};

export type HermesLaunchMetadataDelivery = {
  metadata: HermesLaunchMetadataV1;
  metadataPath: string;
  metadataRuntimePath: string;
  env: Record<string, string>;
  queryContextItems: string[];
  querySnippet: string;
  queryFields: string[];
  diagnosticSummary: Record<string, unknown>;
};

export type CreateHermesLaunchMetadataInput = {
  request: EngineRunRequest;
  runtime: HermesRuntimeConfig;
  forgeSessionId?: string;
  cliSession: LaunchMetadataCliSession;
  windowsDesktopPath: string;
  bridge: LaunchMetadataBridge;
  toRuntimePath: (inputPath: string) => string;
};

export async function createHermesLaunchMetadataSidecar(
  input: CreateHermesLaunchMetadataInput,
  sidecarDir: string,
): Promise<HermesLaunchMetadataDelivery> {
  const metadata = createHermesLaunchMetadata(input);
  await fs.mkdir(sidecarDir, { recursive: true });
  const metadataPath = path.join(sidecarDir, `launch-${input.request.sessionId}-${Date.now()}.json`);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  const metadataRuntimePath = input.toRuntimePath(metadataPath);
  const queryFields = queryFieldsFor(metadata);
  return {
    metadata,
    metadataPath,
    metadataRuntimePath,
    env: {
      [HERMES_LAUNCH_METADATA_ENV]: metadataRuntimePath,
      [HERMES_LAUNCH_METADATA_VERSION_ENV]: "1",
      [HERMES_LAUNCH_METADATA_FIELDS_ENV]: queryFields.join(","),
      [HERMES_LAUNCH_METADATA_DIAGNOSTICS_ENV]: "1",
    },
    queryContextItems: [],
    querySnippet: "",
    queryFields,
    diagnosticSummary: summarizeLaunchMetadata(metadata, metadataPath, metadataRuntimePath, queryFields),
  };
}

export function createHermesLaunchMetadata(input: CreateHermesLaunchMetadataInput): HermesLaunchMetadataV1 {
  const { request, toRuntimePath } = input;
  const attachments = request.attachments ?? [];
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    forgeSessionId: input.forgeSessionId,
    taskRunId: request.sessionId,
    workspace: {
      windowsPath: request.workspacePath,
      runtimePath: toRuntimePath(request.workspacePath),
    },
    selectedFilePaths: request.selectedFiles.map((filePath) => ({
      windowsPath: filePath,
      runtimePath: toRuntimePath(filePath),
    })),
    attachmentPaths: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      kind: attachment.kind,
      windowsPath: attachment.path,
      runtimePath: toRuntimePath(attachment.path),
      originalWindowsPath: attachment.originalPath,
      originalRuntimePath: attachment.originalPath ? toRuntimePath(attachment.originalPath) : undefined,
    })),
    imagePaths: attachments
      .filter((attachment) => attachment.kind === "image")
      .map((attachment) => ({
        windowsPath: attachment.path,
        runtimePath: toRuntimePath(attachment.path),
      })),
    windowsDesktopPathAlias: {
      alias: "desktop",
      windowsPath: input.windowsDesktopPath,
      runtimePath: toRuntimePath(input.windowsDesktopPath),
    },
    bridgeAvailability: input.bridge,
    cliSession: input.cliSession,
  };
}

function queryFieldsFor(metadata: HermesLaunchMetadataV1) {
  const fields = ["metadata-file"];
  if (metadata.selectedFilePaths.length) fields.push("selectedFilePaths");
  if (metadata.attachmentPaths.length) fields.push("attachmentPaths");
  if (metadata.imagePaths.length) fields.push("imagePaths");
  if (metadata.windowsDesktopPathAlias) fields.push("windowsDesktopPathAlias");
  if (metadata.bridgeAvailability.enabled || metadata.bridgeAvailability.reason) fields.push("bridgeAvailability");
  if (metadata.cliSession.status === "degraded") fields.push("degradationReason");
  return fields;
}

function summarizeLaunchMetadata(
  metadata: HermesLaunchMetadataV1,
  metadataPath: string,
  metadataRuntimePath: string,
  queryFields: string[],
) {
  return {
    version: metadata.version,
    sidecarPath: metadataPath,
    sidecarRuntimePath: metadataRuntimePath,
    forgeSessionId: metadata.forgeSessionId,
    taskRunId: metadata.taskRunId,
    workspace: metadata.workspace,
    selectedFilePaths: metadata.selectedFilePaths,
    attachmentPaths: metadata.attachmentPaths.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      kind: attachment.kind,
      windowsPath: attachment.windowsPath,
      runtimePath: attachment.runtimePath,
      originalWindowsPath: attachment.originalWindowsPath,
      originalRuntimePath: attachment.originalRuntimePath,
    })),
    imagePaths: metadata.imagePaths,
    windowsDesktopPathAlias: metadata.windowsDesktopPathAlias,
    bridgeAvailability: metadata.bridgeAvailability,
    cliSession: metadata.cliSession,
    queryFields,
  };
}
