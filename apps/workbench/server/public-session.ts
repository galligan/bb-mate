import type { PluginInspection } from "@bb-mate/inspection";
import type {
  DevelopmentTargetProjection,
  TargetId,
} from "../../../packages/runtime/src/index.ts";

import type { PreparedWorkbenchCatalog } from "./development-target-adapter";

export interface BrowserPluginCandidate {
  id: TargetId;
  label: string;
  displayPath: string;
}

export interface BrowserPluginSession {
  schemaVersion: 2;
  workspace: {
    label: "Plugin Studio";
    candidates: BrowserPluginCandidate[];
    selectedTargetId: TargetId | null;
    selectionError: string | null;
  };
  inspection: PluginInspection;
  handoffs: {
    launchCommand: null;
    checkCommand: null;
    liveCommand: null;
    detail: string;
  };
}

export function projectSession(
  catalog: PreparedWorkbenchCatalog,
  requestedTargetId: string | null | undefined,
): BrowserPluginSession {
  const supplied =
    requestedTargetId !== null && requestedTargetId !== undefined;
  const selected = supplied
    ? catalog.resolve(requestedTargetId)
    : catalog.targets.length === 1
      ? catalog.targets[0]!
      : null;
  return {
    schemaVersion: 2,
    workspace: {
      label: "Plugin Studio",
      candidates: catalog.targets.map((target) => ({
        id: target.id,
        label: target.displayName,
        displayPath: target.displayPath,
      })),
      selectedTargetId: selected?.id ?? null,
      selectionError:
        supplied && !selected
          ? "The requested plugin selection is unavailable. Choose a server-discovered target."
          : null,
    },
    inspection: projectInspection(selected, catalog.targets),
    handoffs: {
      launchCommand: null,
      checkCommand: null,
      liveCommand: null,
      detail:
        "Terminal handoffs are unavailable from the read-only catalog session.",
    },
  };
}

function projectInspection(
  target: DevelopmentTargetProjection | null,
  candidates: readonly DevelopmentTargetProjection[],
): PluginInspection {
  const state = target
    ? "ready"
    : candidates.length === 0
      ? "missing"
      : "ambiguous";
  return {
    schemaVersion: 1,
    state,
    outcome: target ? "ready" : "attention",
    message: target
      ? null
      : candidates.length === 0
        ? "No server-admitted development targets were discovered."
        : "Choose a server-discovered development target.",
    candidates: candidates.map(({ displayPath }) => displayPath),
    target: target
      ? {
          rootPath: target.displayPath,
          displayPath: target.displayPath,
          packageName: target.manifest.packageName,
          displayName: target.displayName,
          version: target.manifest.version,
          serverEntry: target.manifest.hasServer ? "[declared]" : null,
          appEntry: target.manifest.hasApp ? "[declared]" : null,
          engines: { bb: null, pluginSdk: null },
          build: { server: null, app: null },
        }
      : null,
    checks: [
      {
        id: "catalog.source",
        status: target ? "pass" : candidates.length === 0 ? "fail" : "info",
        summary: target
          ? "The selected source target is catalog-backed."
          : candidates.length === 0
            ? "No admitted source target is available."
            : "Select one admitted source target.",
      },
      ...(target
        ? [
            {
              id: "catalog.native",
              status: "info" as const,
              summary: nativeStatusSummary(target.native.status),
            },
          ]
        : []),
      {
        id: "mode.fixture",
        status: "pass",
        summary: "The deterministic browser fixture remains available.",
      },
      {
        id: "mode.harness",
        status: "unavailable",
        summary: "Harness mode is unavailable in this source-catalog session.",
      },
      {
        id: "mode.live",
        status: "unavailable",
        summary: "Live mode requires a separately authorized native adapter.",
      },
    ],
    modes: {
      fixture: {
        available: true,
        detail: "Deterministic browser-only state for visual iteration.",
      },
      harness: {
        available: false,
        sdkVersion: null,
        resolution: "package-not-declared",
        publication: "not-applicable",
        publishedVersion: null,
        detail: "Harness mode is unavailable in the source-catalog adapter.",
      },
      live: {
        available: false,
        pluginId: null,
        status: null,
        sourceKind: null,
        url: null,
        detail: "Live mode requires a separately authorized native adapter.",
      },
    },
    native: { bbVersion: null, connectUrl: null },
    provenance: null,
    trust: {
      model: "full-trust-local-code",
      entrypoints: [],
      skills: [],
      themes: [],
      hasSettings: null,
      capabilities: [],
      services: [],
      undisclosedAccess: [
        "filesystem",
        "network",
        "secrets",
        "external-services",
      ],
      detail:
        "Passive source discovery does not execute or infer plugin capabilities.",
    },
  };
}

function nativeStatusSummary(
  status: DevelopmentTargetProjection["native"]["status"],
): string {
  const summaries: Record<typeof status, string> = {
    "exact-path": "The persisted native status is exact path.",
    "other-path": "The persisted native status is another path.",
    managed: "The persisted native status is managed.",
    "builtin-conflict": "The persisted native status is a builtin conflict.",
    absent: "The persisted native status is absent.",
    duplicate: "The persisted native status is duplicate.",
    malformed: "The persisted native status is malformed.",
    stale: "The persisted native status is stale.",
  };
  return summaries[status];
}
