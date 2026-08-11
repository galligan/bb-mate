export type PluginWorkbenchRuntimeState =
  "idle" | "starting" | "ready" | "stopping" | "unavailable" | "failed";

export type PluginWorkbenchUnavailableReason =
  | "unsupported_platform"
  | "artifact_missing"
  | "artifact_invalid"
  | "runtime_incompatible"
  | "startup_failed";

export interface ProjectOption {
  id: string;
  label: string;
  admission: "available" | "no_source";
}

export type ProjectCatalog =
  | { state: "ready"; items: ProjectOption[] }
  | { state: "unavailable"; items: [] };

export interface TargetSummary {
  id: string;
  label: string;
  pluginId: string;
  revision: number;
}

export type TargetCatalog =
  | { state: "ready" | "partial"; items: TargetSummary[] }
  | { state: "project_not_selected"; items: [] }
  | {
      state: "unavailable";
      reason:
        "runtime_not_ready" | "runtime_incompatible" | "catalog_unavailable";
      items: [];
    };

export interface PluginWorkbenchSnapshot {
  schemaVersion: 2;
  runtimeState: PluginWorkbenchRuntimeState;
  reason: PluginWorkbenchUnavailableReason | null;
  runtimeVersion: string | null;
  apiVersion: 2 | null;
  canStart: boolean;
  browserLaunch: "unavailable";
  projects: ProjectCatalog;
  targets: TargetCatalog;
}

export type PluginWorkbenchStatusInput = Record<string, never>;
export interface PluginWorkbenchAdmitInput {
  projectId: string;
}

const runtimeStates = new Set<PluginWorkbenchRuntimeState>([
  "idle",
  "starting",
  "ready",
  "stopping",
  "unavailable",
  "failed",
]);
const unavailableReasons = new Set<PluginWorkbenchUnavailableReason>([
  "unsupported_platform",
  "artifact_missing",
  "artifact_invalid",
  "runtime_incompatible",
  "startup_failed",
]);
const targetUnavailableReasons = new Set([
  "runtime_not_ready",
  "runtime_incompatible",
  "catalog_unavailable",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
}

function isBoundedString(
  value: unknown,
  minimumBytes: number,
  maximumBytes: number,
): value is string {
  if (typeof value !== "string") return false;
  const length = new TextEncoder().encode(value).byteLength;
  return length >= minimumBytes && length <= maximumBytes;
}

function isDisplayLabel(value: unknown, maximumBytes: number): value is string {
  return (
    isBoundedString(value, 1, maximumBytes) &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f\\/]/u.test(value) &&
    value !== "." &&
    value !== ".." &&
    value !== "~" &&
    !/^[A-Za-z]:/u.test(value)
  );
}

function isProjectId(value: unknown): value is string {
  return isBoundedString(value, 1, 128) && /^[A-Za-z0-9_-]+$/u.test(value);
}

function isTargetId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32}$/u.test(value);
}

function isPluginId(value: unknown): value is string {
  return (
    isBoundedString(value, 1, 64) &&
    /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(value)
  );
}

function isRuntimeVersion(value: unknown): value is string {
  return (
    isBoundedString(value, 1, 64) &&
    /^[0-9A-Za-z][0-9A-Za-z._+-]*$/u.test(value)
  );
}

function hasUniqueIds(items: readonly { id: string }[]): boolean {
  return new Set(items.map(({ id }) => id)).size === items.length;
}

function parseProjects(value: unknown): ProjectCatalog | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  if (value.state === "unavailable") {
    return isExactRecord(value, ["state", "items"]) && value.items.length === 0
      ? { state: "unavailable", items: [] }
      : null;
  }
  if (
    value.state !== "ready" ||
    !isExactRecord(value, ["state", "items"]) ||
    value.items.length > 128
  ) {
    return null;
  }
  const items: ProjectOption[] = [];
  for (const item of value.items) {
    if (
      !isExactRecord(item, ["id", "label", "admission"]) ||
      !isProjectId(item.id) ||
      !isDisplayLabel(item.label, 256) ||
      (item.admission !== "available" && item.admission !== "no_source")
    ) {
      return null;
    }
    items.push({
      id: item.id,
      label: item.label,
      admission: item.admission,
    });
  }
  return hasUniqueIds(items) ? { state: "ready", items } : null;
}

function parseTargets(value: unknown): TargetCatalog | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  if (value.state === "unavailable") {
    if (
      !isExactRecord(value, ["state", "reason", "items"]) ||
      typeof value.reason !== "string" ||
      !targetUnavailableReasons.has(value.reason) ||
      value.items.length !== 0
    ) {
      return null;
    }
    const reason = value.reason as
      "runtime_not_ready" | "runtime_incompatible" | "catalog_unavailable";
    return {
      state: "unavailable",
      reason,
      items: [],
    };
  }
  if (value.state === "project_not_selected") {
    return isExactRecord(value, ["state", "items"]) && value.items.length === 0
      ? { state: "project_not_selected", items: [] }
      : null;
  }
  if (
    (value.state !== "ready" && value.state !== "partial") ||
    !isExactRecord(value, ["state", "items"]) ||
    value.items.length > 128
  ) {
    return null;
  }
  const items: TargetSummary[] = [];
  for (const item of value.items) {
    if (
      !isExactRecord(item, ["id", "label", "pluginId", "revision"]) ||
      !isTargetId(item.id) ||
      !isDisplayLabel(item.label, 128) ||
      !isPluginId(item.pluginId) ||
      !Number.isSafeInteger(item.revision) ||
      (item.revision as number) < 1
    ) {
      return null;
    }
    items.push({
      id: item.id,
      label: item.label,
      pluginId: item.pluginId,
      revision: item.revision as number,
    });
  }
  return hasUniqueIds(items) ? { state: value.state, items } : null;
}

function hasCoherentState(snapshot: PluginWorkbenchSnapshot): boolean {
  const hasRuntimeVersion = snapshot.runtimeVersion !== null;
  const hasApiVersion = snapshot.apiVersion === 2;
  if (hasRuntimeVersion !== hasApiVersion) return false;
  const hasRuntimeIdentity = hasRuntimeVersion && hasApiVersion;
  if (
    (snapshot.runtimeState === "ready" ||
      snapshot.runtimeState === "stopping") !== hasRuntimeIdentity
  ) {
    return false;
  }
  if (snapshot.runtimeState === "ready") {
    if (
      snapshot.targets.state === "unavailable" &&
      snapshot.targets.reason !== "catalog_unavailable"
    ) {
      return false;
    }
  } else if (
    snapshot.targets.state !== "unavailable" ||
    snapshot.targets.reason === "catalog_unavailable"
  ) {
    return false;
  }
  if (snapshot.runtimeState === "idle") {
    return snapshot.canStart && snapshot.reason === null;
  }
  if (snapshot.runtimeState === "unavailable") {
    return snapshot.canStart === false && snapshot.reason !== null;
  }
  if (snapshot.runtimeState === "failed") {
    return snapshot.canStart && snapshot.reason === "startup_failed";
  }
  return snapshot.canStart === false && snapshot.reason === null;
}

export function parsePluginWorkbenchSnapshot(
  value: unknown,
): PluginWorkbenchSnapshot {
  if (
    !isExactRecord(value, [
      "schemaVersion",
      "runtimeState",
      "reason",
      "runtimeVersion",
      "apiVersion",
      "canStart",
      "browserLaunch",
      "projects",
      "targets",
    ]) ||
    value.schemaVersion !== 2 ||
    typeof value.runtimeState !== "string" ||
    !runtimeStates.has(value.runtimeState as PluginWorkbenchRuntimeState) ||
    (value.reason !== null &&
      (typeof value.reason !== "string" ||
        !unavailableReasons.has(
          value.reason as PluginWorkbenchUnavailableReason,
        ))) ||
    (value.runtimeVersion !== null &&
      !isRuntimeVersion(value.runtimeVersion)) ||
    (value.apiVersion !== null && value.apiVersion !== 2) ||
    typeof value.canStart !== "boolean" ||
    value.browserLaunch !== "unavailable"
  ) {
    throw new Error("Plugin Workbench returned an invalid snapshot.");
  }
  const projects = parseProjects(value.projects);
  const targets = parseTargets(value.targets);
  if (!projects || !targets) {
    throw new Error("Plugin Workbench returned an invalid snapshot.");
  }
  const snapshot: PluginWorkbenchSnapshot = {
    schemaVersion: 2,
    runtimeState: value.runtimeState as PluginWorkbenchRuntimeState,
    reason: value.reason as PluginWorkbenchUnavailableReason | null,
    runtimeVersion: value.runtimeVersion as string | null,
    apiVersion: value.apiVersion as 2 | null,
    canStart: value.canStart,
    browserLaunch: "unavailable",
    projects,
    targets,
  };
  if (!hasCoherentState(snapshot)) {
    throw new Error("Plugin Workbench returned an invalid snapshot.");
  }
  return snapshot;
}

export function parsePluginWorkbenchStatusInput(
  value: unknown,
): PluginWorkbenchStatusInput {
  if (!isExactRecord(value, [])) {
    throw new Error("Plugin Workbench returned an invalid request.");
  }
  return value as PluginWorkbenchStatusInput;
}

export function parsePluginWorkbenchAdmitInput(
  value: unknown,
): PluginWorkbenchAdmitInput {
  if (!isExactRecord(value, ["projectId"]) || !isProjectId(value.projectId)) {
    throw new Error("Plugin Workbench returned an invalid request.");
  }
  return { projectId: value.projectId };
}
