export type InspectionState = "ready" | "missing" | "ambiguous" | "error";

export interface NativeBuildMetadata {
  sdkVersion: string | null;
  pluginId: string | null;
  pluginVersion: string | null;
  bbVersion: string | null;
}

export interface PluginTarget {
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

export interface PluginInspection {
  state: InspectionState;
  message: string | null;
  candidates: string[];
  target: PluginTarget | null;
  modes: {
    fixture: PreviewCapability;
    harness: PreviewCapability & { sdkVersion: string | null };
    live: PreviewCapability & {
      pluginId: string | null;
      status: string | null;
      sourceKind: string | null;
      url: string | null;
    };
  };
  native: {
    bbVersion: string | null;
    connectUrl: string | null;
  };
}
