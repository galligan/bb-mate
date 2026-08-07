export type InspectionState = "ready" | "missing" | "ambiguous" | "error";
export type InspectionOutcome = "ready" | "attention" | "blocked";
export type InspectionCheckStatus =
  "pass" | "info" | "warning" | "fail" | "unavailable";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface NativeErrorEvidence {
  command: string;
  exitCode: number;
  stderr: string;
  stdout: string | null;
}

export interface InspectionCheck {
  id: string;
  status: InspectionCheckStatus;
  summary: string;
  detail?: string;
  nextAction?: string;
  nativeError?: NativeErrorEvidence;
}

export interface NativeBuildMetadata {
  artifactFormatVersion: number | null;
  sdkMajor: number | null;
  sdkVersion: string;
  pluginId: string;
  pluginVersion: string;
  bbVersion: string | null;
  pluginSdkVersion: string | null;
}

export interface PluginTarget {
  rootPath: string;
  displayPath: string;
  packageName: string;
  displayName: string;
  version: string;
  serverEntry: string | null;
  appEntry: string | null;
  engines: {
    bb: string | null;
    pluginSdk: string | null;
  };
  build: {
    server: NativeBuildMetadata | null;
    app: NativeBuildMetadata | null;
  };
}

export interface PreviewCapability {
  available: boolean;
  detail: string;
}

export type ProvenanceKind = "path" | "npm" | "git" | "bundled" | "unknown";

export interface ProvenanceReport {
  kind: ProvenanceKind;
  requested: string | null;
  resolved: string | null;
  registry: string | null;
}

export interface TrustReport {
  model: "full-trust-local-code";
  entrypoints: string[];
  skills: string[];
  themes: string[];
  hasSettings: boolean | null;
  capabilities: string[];
  services: string[];
  undisclosedAccess: Array<
    "filesystem" | "network" | "secrets" | "external-services"
  >;
  detail: string;
}

export type HarnessResolutionState =
  | "available"
  | "headless"
  | "package-not-declared"
  | "dependency-unresolved"
  | "testing-subpath-unavailable";

export type SdkPublicationState = "published" | "missing" | "unknown";

export interface HarnessResolution {
  state: HarnessResolutionState;
  version: string | null;
  detail: string;
}

export interface SdkPublicationResolution {
  state: SdkPublicationState;
  version: string | null;
  detail: string;
}

export interface PluginInspection {
  schemaVersion: 1;
  state: InspectionState;
  outcome: InspectionOutcome;
  message: string | null;
  candidates: string[];
  target: PluginTarget | null;
  checks: InspectionCheck[];
  modes: {
    fixture: PreviewCapability;
    harness: PreviewCapability & {
      sdkVersion: string | null;
      resolution: HarnessResolutionState;
      publication: SdkPublicationState | "not-applicable";
      publishedVersion: string | null;
    };
    live: PreviewCapability & {
      pluginId: string | null;
      status: string | null;
      sourceKind: ProvenanceKind | null;
      url: string | null;
    };
  };
  native: {
    bbVersion: string | null;
    connectUrl: string | null;
  };
  provenance: ProvenanceReport | null;
  trust: TrustReport;
}

export interface CommandRunner {
  (args: readonly string[]): Promise<CommandResult>;
}

export interface InspectPluginOptions {
  workspaceRoot: string;
  targetPath?: string;
  runBb?: CommandRunner;
  resolveHarness?: (
    pluginRoot: string,
    packageJson: Readonly<Record<string, unknown>>,
  ) => Promise<HarnessResolution>;
  resolveSdkPublication?: () => Promise<SdkPublicationResolution>;
}
