export type PluginWorkbenchRuntimeState =
  "idle" | "starting" | "ready" | "stopping" | "unavailable" | "failed";

export type PluginWorkbenchUnavailableReason =
  | "unsupported_platform"
  | "artifact_missing"
  | "artifact_invalid"
  | "runtime_incompatible"
  | "startup_failed";

export interface PluginWorkbenchSnapshot {
  schemaVersion: 1;
  runtimeState: PluginWorkbenchRuntimeState;
  reason: PluginWorkbenchUnavailableReason | null;
  runtimeVersion: string | null;
  apiVersion: 1 | null;
  canStart: boolean;
  browserLaunch: "unavailable";
  targets: "unavailable_pending_runtime_admission";
}

export interface PluginWorkbenchStatusInput {
  projectId: string | null;
}

export interface PluginWorkbenchEnsureInput {
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
  maximumBytes: number,
): value is string {
  return (
    typeof value === "string" &&
    new TextEncoder().encode(value).byteLength <= maximumBytes
  );
}

function isProjectId(value: unknown): value is string {
  return (
    isBoundedString(value, 128) &&
    value.length > 0 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function isRuntimeVersion(value: unknown): value is string {
  return (
    isBoundedString(value, 64) &&
    value.length > 0 &&
    /^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(value)
  );
}

function hasCoherentState(snapshot: PluginWorkbenchSnapshot): boolean {
  const hasRuntimeIdentity =
    snapshot.runtimeVersion !== null && snapshot.apiVersion === 1;
  if (
    (snapshot.runtimeState === "ready" ||
      snapshot.runtimeState === "stopping") !== hasRuntimeIdentity
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
      "targets",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.runtimeState !== "string" ||
    !runtimeStates.has(value.runtimeState as PluginWorkbenchRuntimeState) ||
    (value.reason !== null &&
      (typeof value.reason !== "string" ||
        !unavailableReasons.has(
          value.reason as PluginWorkbenchUnavailableReason,
        ))) ||
    (value.runtimeVersion !== null &&
      !isRuntimeVersion(value.runtimeVersion)) ||
    (value.apiVersion !== null && value.apiVersion !== 1) ||
    typeof value.canStart !== "boolean" ||
    value.browserLaunch !== "unavailable" ||
    value.targets !== "unavailable_pending_runtime_admission"
  ) {
    throw new Error("Plugin Workbench returned an invalid snapshot.");
  }
  const snapshot = value as unknown as PluginWorkbenchSnapshot;
  if (!hasCoherentState(snapshot)) {
    throw new Error("Plugin Workbench returned an invalid snapshot.");
  }
  return snapshot;
}

export function parsePluginWorkbenchStatusInput(
  value: unknown,
): PluginWorkbenchStatusInput {
  if (
    !isExactRecord(value, ["projectId"]) ||
    (value.projectId !== null && !isProjectId(value.projectId))
  ) {
    throw new Error("Plugin Workbench returned an invalid request.");
  }
  return value as unknown as PluginWorkbenchStatusInput;
}

export function parsePluginWorkbenchEnsureInput(
  value: unknown,
): PluginWorkbenchEnsureInput {
  if (!isExactRecord(value, ["projectId"]) || !isProjectId(value.projectId)) {
    throw new Error("Plugin Workbench returned an invalid request.");
  }
  return value as unknown as PluginWorkbenchEnsureInput;
}
