export { inspectPlugin } from "./inspect.ts";
export { discoverPluginRoots } from "./manifest.ts";
export { runCapturedCommand } from "./captured-command.ts";
export type { CapturedCommandOptions } from "./captured-command.ts";
export { nativeCommandEnv } from "./native-env.ts";
export {
  formatInspection,
  inspectionOutcome,
  provenanceKind,
} from "./report.ts";
export type {
  CommandResult,
  CommandRunner,
  HarnessResolution,
  HarnessResolutionState,
  InspectPluginOptions,
  InspectionCheck,
  InspectionCheckStatus,
  InspectionOutcome,
  InspectionState,
  NativeBuildMetadata,
  NativeConnectHost,
  NativeConnectShare,
  NativeConnectStatus,
  NativeErrorEvidence,
  PluginInspection,
  PluginTarget,
  PreviewCapability,
  ProvenanceKind,
  ProvenanceReport,
  SdkPublicationResolution,
  SdkPublicationState,
  TrustReport,
} from "./types.ts";
