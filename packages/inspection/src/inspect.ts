import path from "node:path";
import {
  artifactCheck,
  artifactConsistencyCheck,
  readBuildMetadata,
} from "./artifacts.ts";
import {
  engineCheck,
  harnessCheck,
  liveCapability,
  publicationCheck,
} from "./capabilities.ts";
import {
  resolveHarness as defaultResolveHarness,
  resolveSdkPublication as defaultResolveSdkPublication,
} from "./harness.ts";
import {
  discoverPluginRoots,
  readPackageJson,
  validatePluginManifest,
  type PluginPackageJson,
} from "./manifest.ts";
import { readNativeState } from "./native.ts";
import { inspectionOutcome, provenanceKind } from "./report.ts";
import type {
  HarnessResolution,
  InspectPluginOptions,
  InspectionCheck,
  PluginInspection,
  PluginTarget,
  ProvenanceReport,
  SdkPublicationResolution,
  TrustReport,
} from "./types.ts";

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const result = stringOrNull(entry);
        return result ? [result] : [];
      })
    : [];
}

function themeIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const id = stringOrNull(recordOrNull(entry)?.id);
        return id ? [id] : [];
      })
    : [];
}

function displayPath(workspaceRoot: string, pluginRoot: string): string {
  const relative = path.relative(workspaceRoot, pluginRoot);
  return relative.startsWith("..") ? pluginRoot : relative || ".";
}

function capabilitySummaries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = recordOrNull(entry);
    if (!record) return [];
    const kind = stringOrNull(record.kind);
    const id = stringOrNull(record.id);
    return kind || id ? [[kind, id].filter(Boolean).join(":")] : [];
  });
}

function serviceSummaries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    const record = recordOrNull(entry);
    const id = record
      ? (stringOrNull(record.id) ?? stringOrNull(record.name))
      : null;
    return id ? [id] : [];
  });
}

function emptyTrust(): TrustReport {
  return {
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
      "Supported metadata does not disclose general filesystem, network, secret, or external-service access.",
  };
}

function emptyInspection(
  state: PluginInspection["state"],
  message: string,
  check: InspectionCheck,
  candidates: string[] = [],
): PluginInspection {
  const checks = [
    check,
    {
      id: "mode.fixture",
      status: "pass" as const,
      summary: "The deterministic browser fixture remains available.",
    },
  ];
  return {
    schemaVersion: 1,
    state,
    outcome: inspectionOutcome(checks),
    message,
    candidates,
    target: null,
    checks,
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
        detail:
          "Choose a valid frontend plugin before resolving the official harness.",
      },
      live: {
        available: false,
        pluginId: null,
        status: null,
        sourceKind: null,
        url: null,
        detail:
          "Choose a valid installed frontend plugin before opening Live bb.",
      },
    },
    native: { bbVersion: null, connectUrl: null },
    provenance: null,
    trust: emptyTrust(),
  };
}

export async function inspectPlugin(
  options: InspectPluginOptions,
): Promise<PluginInspection> {
  const candidates = options.targetPath
    ? [path.resolve(options.workspaceRoot, options.targetPath)]
    : await discoverPluginRoots(options.workspaceRoot);
  if (candidates.length === 0) {
    return emptyInspection(
      "missing",
      "No plugin package directories were found.",
      {
        id: "manifest.discovery",
        status: "fail",
        summary: "No bb plugin package was found.",
        nextAction:
          "Pass an explicit plugin path or add one package under the workspace plugins directory.",
      },
    );
  }
  if (candidates.length > 1) {
    return emptyInspection(
      "ambiguous",
      "More than one plugin package directory was found.",
      {
        id: "manifest.discovery",
        status: "fail",
        summary: "Plugin selection is ambiguous.",
        nextAction: "Pass the explicit plugin path to inspect.",
      },
      candidates.map((candidate) =>
        displayPath(options.workspaceRoot, candidate),
      ),
    );
  }

  const pluginRoot = candidates[0]!;
  let rawPackage: unknown;
  try {
    rawPackage = await readPackageJson(pluginRoot);
  } catch (error) {
    return emptyInspection(
      "error",
      `Could not read ${displayPath(options.workspaceRoot, pluginRoot)}/package.json.`,
      {
        id: "manifest.read",
        status: "fail",
        summary: "The plugin package manifest cannot be read.",
        detail: error instanceof Error ? error.message : String(error),
        nextAction: "Repair package.json and rerun inspection.",
      },
    );
  }

  let packageJson: PluginPackageJson;
  try {
    packageJson = await validatePluginManifest(rawPackage, pluginRoot);
  } catch (error) {
    return emptyInspection(
      "error",
      `${displayPath(options.workspaceRoot, pluginRoot)}/package.json is not a valid bb plugin manifest.`,
      {
        id: "manifest.schema",
        status: "fail",
        summary: "The plugin package manifest is invalid.",
        detail: error instanceof Error ? error.message : String(error),
        nextAction:
          "Repair the public bb manifest fields and rerun inspection.",
      },
    );
  }

  const serverEntry = packageJson.bb.server;
  const appEntry = packageJson.bb.app ?? null;
  const packageName = packageJson.name;
  const packageVersion = packageJson.version;
  const expectedPluginId = packageJson.pluginId;
  const [serverArtifact, appArtifact, native, harness, publication] =
    await Promise.all([
      readBuildMetadata(pluginRoot, "server"),
      readBuildMetadata(pluginRoot, "app"),
      readNativeState(pluginRoot, options.runBb),
      !appEntry
        ? Promise.resolve<HarnessResolution>({
            state: "headless",
            version: null,
            detail: "This plugin declares no bb.app entry.",
          })
        : (options.resolveHarness ?? defaultResolveHarness)(
            pluginRoot,
            packageJson,
          ),
      !appEntry
        ? Promise.resolve<SdkPublicationResolution | null>(null)
        : (options.resolveSdkPublication ?? defaultResolveSdkPublication)(),
    ]);

  const installedId = stringOrNull(native.installed?.id);
  const installedStatus = stringOrNull(native.installed?.status);
  const listSource = stringOrNull(native.installed?.source);
  const requested = stringOrNull(native.source?.requested);
  const resolved = stringOrNull(native.source?.resolved) ?? listSource;
  const registryValue = native.source?.registry;
  const registry =
    typeof registryValue === "string"
      ? registryValue
      : stringOrNull(recordOrNull(registryValue)?.name);
  const provenance: ProvenanceReport | null = native.installed
    ? {
        kind: provenanceKind(resolved ?? requested),
        requested,
        resolved,
        registry,
      }
    : null;

  const target: PluginTarget = {
    rootPath: pluginRoot,
    displayPath: displayPath(options.workspaceRoot, pluginRoot),
    packageName,
    displayName: packageJson.bb.name,
    version: packageVersion,
    serverEntry,
    appEntry,
    engines: {
      bb: packageJson.engines?.bb ?? null,
      pluginSdk: packageJson.engines?.bbPluginSdk ?? null,
    },
    build: {
      server: serverArtifact.metadata,
      app: appArtifact.metadata,
    },
  };
  const installedBundle = recordOrNull(
    recordOrNull(native.installed?.app)?.bundle,
  );
  const observedSdk =
    appArtifact.metadata?.sdkVersion ??
    serverArtifact.metadata?.sdkVersion ??
    stringOrNull(installedBundle?.sdkVersion);
  const live = liveCapability(appEntry, native.installed);
  const checks: InspectionCheck[] = [
    {
      id: "manifest.read",
      status: "pass",
      summary: "Plugin package manifest is valid JSON.",
    },
    {
      id: "manifest.schema",
      status: "pass",
      summary:
        "Plugin package matches the supported public bb manifest contract.",
    },
    artifactCheck(
      "server",
      serverEntry,
      serverArtifact,
      expectedPluginId,
      packageVersion,
    ),
    artifactCheck(
      "app",
      appEntry,
      appArtifact,
      expectedPluginId,
      packageVersion,
    ),
    artifactConsistencyCheck(serverArtifact.metadata, appArtifact.metadata),
    ...native.checks,
    engineCheck("engine.bb", "bb", target.engines.bb, native.bbVersion),
    engineCheck(
      "engine.plugin-sdk",
      "bbPluginSdk",
      target.engines.pluginSdk,
      observedSdk,
    ),
    publicationCheck(appEntry, publication),
    {
      id: "mode.fixture",
      status: "pass",
      summary: "Fixture mode is available as a deterministic approximation.",
    },
    harnessCheck(harness, publication),
    !appEntry
      ? {
          id: "mode.live",
          status: "info",
          summary:
            "Live frontend mode is not applicable to this headless plugin.",
          detail: live.detail,
        }
      : live.available
        ? {
            id: "mode.live",
            status: "pass",
            summary: `Live bb can load installed plugin ${installedId}.`,
          }
        : {
            id: "mode.live",
            status: "unavailable",
            summary: "Live bb cannot currently load this frontend plugin.",
            detail: live.detail,
            nextAction: live.nextAction,
          },
    {
      id: "trust.disclosure",
      status: "info",
      summary: "bb plugins are full-trust local code.",
      detail:
        "Supported metadata does not disclose general filesystem, network, secret, or external-service access.",
    },
  ];

  const trust: TrustReport = {
    model: "full-trust-local-code",
    entrypoints: [serverEntry, appEntry].filter(
      (entry): entry is string => entry !== null,
    ),
    skills: stringArray(packageJson.bb.skills),
    themes: themeIds(packageJson.bb.themes),
    hasSettings:
      typeof native.installed?.hasSettings === "boolean"
        ? native.installed.hasSettings
        : null,
    capabilities: capabilitySummaries(native.installed?.capabilities),
    services: serviceSummaries(native.installed?.services),
    undisclosedAccess: [
      "filesystem",
      "network",
      "secrets",
      "external-services",
    ],
    detail:
      "Supported metadata does not disclose general filesystem, network, secret, or external-service access.",
  };

  return {
    schemaVersion: 1,
    state: "ready",
    outcome: inspectionOutcome(checks),
    message: null,
    candidates: [],
    target,
    checks,
    modes: {
      fixture: {
        available: true,
        detail: "Deterministic browser-only state for visual iteration.",
      },
      harness: {
        available: harness.state === "available",
        sdkVersion: harness.version,
        resolution: harness.state,
        publication: appEntry
          ? (publication?.state ?? "unknown")
          : "not-applicable",
        publishedVersion: publication?.version ?? null,
        detail: harness.detail,
      },
      live: {
        available: live.available,
        pluginId: installedId,
        status: installedStatus,
        sourceKind: provenance?.kind ?? null,
        url: live.available ? native.connectUrl : null,
        detail: live.detail,
      },
    },
    native: {
      bbVersion: native.bbVersion,
      connectUrl: native.connectUrl,
      ...(native.connect ? { connect: native.connect } : {}),
    },
    provenance,
    trust,
  };
}
