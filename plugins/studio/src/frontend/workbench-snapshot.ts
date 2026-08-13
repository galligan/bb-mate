export interface TargetSummary {
  id: string;
  label: string;
  pluginId: string;
  revision: number;
}

export interface ProjectActivity {
  active: boolean;
  lastThreadUpdatedAt: number | null;
}

export type ProjectScanUnavailableReason =
  "source_changed" | "scan_failed" | "capacity_reached";

export type ProjectScan =
  | { state: "not_scanned"; items: [] }
  | { state: "ready" | "partial"; items: TargetSummary[] }
  | {
      state: "unavailable";
      reason: ProjectScanUnavailableReason;
      items: [];
    };

export interface ProjectOption {
  id: string;
  label: string;
  activity: ProjectActivity;
  scan: ProjectScan;
}

export type ProjectCatalog =
  | {
      state: "ready" | "partial";
      truncated: boolean;
      items: ProjectOption[];
    }
  | { state: "unavailable"; items: [] };

export interface PluginWorkbenchSnapshot {
  schemaVersion: 4;
  browserLaunch: "unavailable";
  projects: ProjectCatalog;
}

export type PluginWorkbenchStatusInput = Record<string, never>;
export type PluginWorkbenchRefreshInput = Record<string, never>;

const scanUnavailableReasons = new Set([
  "source_changed",
  "scan_failed",
  "capacity_reached",
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

function hasUniqueIds(items: readonly { id: string }[]): boolean {
  return new Set(items.map(({ id }) => id)).size === items.length;
}

function parseTargets(value: unknown): TargetSummary[] | null {
  if (!Array.isArray(value) || value.length > 128) return null;
  const items: TargetSummary[] = [];
  for (const item of value) {
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
  return hasUniqueIds(items) ? items : null;
}

function parseScan(value: unknown): ProjectScan | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  if (value.state === "not_scanned") {
    return isExactRecord(value, ["state", "items"]) && value.items.length === 0
      ? { state: "not_scanned", items: [] }
      : null;
  }
  if (value.state === "unavailable") {
    if (
      !isExactRecord(value, ["state", "reason", "items"]) ||
      typeof value.reason !== "string" ||
      !scanUnavailableReasons.has(value.reason) ||
      value.items.length !== 0
    ) {
      return null;
    }
    return {
      state: "unavailable",
      reason: value.reason as ProjectScanUnavailableReason,
      items: [],
    };
  }
  if (
    (value.state !== "ready" && value.state !== "partial") ||
    !isExactRecord(value, ["state", "items"])
  ) {
    return null;
  }
  const items = parseTargets(value.items);
  return items ? { state: value.state, items } : null;
}

function parseProjects(value: unknown): ProjectCatalog | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  if (value.state === "unavailable") {
    return isExactRecord(value, ["state", "items"]) && value.items.length === 0
      ? { state: "unavailable", items: [] }
      : null;
  }
  if (
    (value.state !== "ready" && value.state !== "partial") ||
    !isExactRecord(value, ["state", "truncated", "items"]) ||
    typeof value.truncated !== "boolean" ||
    value.items.length > 128
  ) {
    return null;
  }
  const items: ProjectOption[] = [];
  let targetCount = 0;
  for (const item of value.items) {
    if (
      !isExactRecord(item, ["id", "label", "activity", "scan"]) ||
      !isProjectId(item.id) ||
      !isDisplayLabel(item.label, 256) ||
      !isExactRecord(item.activity, ["active", "lastThreadUpdatedAt"]) ||
      typeof item.activity.active !== "boolean" ||
      (item.activity.lastThreadUpdatedAt !== null &&
        (!Number.isSafeInteger(item.activity.lastThreadUpdatedAt) ||
          (item.activity.lastThreadUpdatedAt as number) < 0))
    ) {
      return null;
    }
    const scan = parseScan(item.scan);
    if (!scan) return null;
    targetCount += scan.items.length;
    items.push({
      id: item.id,
      label: item.label,
      activity: {
        active: item.activity.active,
        lastThreadUpdatedAt: item.activity.lastThreadUpdatedAt as number | null,
      },
      scan,
    });
  }
  const incomplete = items.some(
    ({ scan }) => scan.state === "partial" || scan.state === "unavailable",
  );
  return hasUniqueIds(items) &&
    targetCount <= 128 &&
    (value.state === "partial"
      ? value.truncated || incomplete
      : !value.truncated && !incomplete)
    ? { state: value.state, truncated: value.truncated, items }
    : null;
}

export function parsePluginWorkbenchSnapshot(
  value: unknown,
): PluginWorkbenchSnapshot {
  if (
    !isExactRecord(value, ["schemaVersion", "browserLaunch", "projects"]) ||
    value.schemaVersion !== 4 ||
    value.browserLaunch !== "unavailable"
  ) {
    throw new Error("Plugin Studio returned an invalid snapshot.");
  }
  const projects = parseProjects(value.projects);
  if (!projects) {
    throw new Error("Plugin Studio returned an invalid snapshot.");
  }
  const snapshot: PluginWorkbenchSnapshot = {
    schemaVersion: 4,
    browserLaunch: "unavailable",
    projects,
  };
  return snapshot;
}

function parseEmptyInput(value: unknown) {
  if (!isExactRecord(value, [])) {
    throw new Error("Plugin Studio returned an invalid request.");
  }
  return value as Record<string, never>;
}

export function parsePluginWorkbenchStatusInput(
  value: unknown,
): PluginWorkbenchStatusInput {
  return parseEmptyInput(value);
}

export function parsePluginWorkbenchRefreshInput(
  value: unknown,
): PluginWorkbenchRefreshInput {
  return parseEmptyInput(value);
}
