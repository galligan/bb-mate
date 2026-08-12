export { inspectPlugin } from "./inspect.ts";
export { discoverPluginRoots } from "./manifest.ts";
export { discoverSourceCandidates } from "./discover-source-candidates.ts";
export { discoverWorkspaceSourceCandidates } from "./discover-workspace-source-candidates.ts";
export { sourceCandidateDiscoveringRootKeys } from "./discovery-scan-state.ts";
export {
  admitTrustedRoots,
  trustedRootCanonicalRoot,
} from "./trusted-roots.ts";
export { runCapturedCommand } from "./captured-command.ts";
export type { CapturedCommandOptions } from "./captured-command.ts";
export { nativeCommandEnv } from "./native-env.ts";
export {
  consumeIssuedNativeInventory,
  observeNativePluginInventory,
  readNativeInventoryTransition,
} from "./native-inventory.ts";
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
export type {
  NativeInventoryEntry,
  NativeInventoryMalformedRow,
  NativeInventoryObservation,
  NativeInventoryPluginStatus,
  NativeInventoryProvenance,
  NativeInventoryRowIssue,
  NativeInventorySourceKind,
  NativeInventoryTopLevelStatus,
  NativeInventoryTransitionFacts,
  ObserveNativePluginInventoryOptions,
} from "./native-inventory.ts";
export type {
  DiscoveryDiagnostic,
  DiscoveryOperationOptions,
  SourceCandidate,
  SourceDiscoveryResult,
  TrustedRoot,
  TrustedRootAdmission,
  TrustedRootAlias,
  TrustedRootInput,
  TrustedRootKind,
} from "./discovery-types.ts";
