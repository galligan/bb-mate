export {
  admitTrustedRoots,
  trustedRootCanonicalRoot,
} from "./trusted-roots.ts";
export { discoverWorkspaceSourceCandidates } from "./discover-workspace-source-candidates.ts";
export { sourceCandidateDiscoveringRootKeys } from "./discovery-scan-state.ts";
export type {
  DiscoveryOperationOptions,
  SourceDiscoveryResult,
  TrustedRoot,
  TrustedRootAdmission,
  TrustedRootInput,
} from "./discovery-types.ts";
