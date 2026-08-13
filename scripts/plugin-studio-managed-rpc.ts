function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  assert(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort()),
    `Studio RPC ${label} keys differ.`,
  );
}

function record(value: unknown, label: string): Record<string, unknown> {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `Studio RPC ${label} is not an object.`,
  );
  return value as Record<string, unknown>;
}

export interface StudioTargetSummary {
  readonly id: string;
  readonly label: string;
  readonly pluginId: string;
  readonly revision: number;
}

export type StudioProjectScan =
  | { readonly state: "not_scanned"; readonly items: readonly [] }
  | {
      readonly state: "ready" | "partial";
      readonly items: readonly StudioTargetSummary[];
    }
  | {
      readonly state: "unavailable";
      readonly reason: "source_changed" | "scan_failed" | "capacity_reached";
      readonly items: readonly [];
    };

export interface StudioProjectOption {
  readonly id: string;
  readonly label: string;
  readonly activity: {
    readonly active: boolean;
    readonly lastThreadUpdatedAt: number | null;
  };
  readonly scan: StudioProjectScan;
}

export type StudioProjectCatalog =
  | {
      readonly state: "ready" | "partial";
      readonly truncated: boolean;
      readonly items: readonly StudioProjectOption[];
    }
  | { readonly state: "unavailable"; readonly items: readonly [] };

export interface StudioSnapshot {
  readonly schemaVersion: 3;
  readonly runtimeState:
    "idle" | "starting" | "ready" | "stopping" | "unavailable" | "failed";
  readonly reason:
    | "unsupported_platform"
    | "artifact_missing"
    | "artifact_invalid"
    | "runtime_incompatible"
    | "startup_failed"
    | null;
  readonly runtimeVersion: string | null;
  readonly apiVersion: 2 | null;
  readonly canStart: boolean;
  readonly browserLaunch: "unavailable";
  readonly projects: StudioProjectCatalog;
}

function safeLabel(value: unknown, maximumBytes: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    Buffer.byteLength(value, "utf8") <= maximumBytes &&
    !/[\u0000-\u001f\u007f\\/]/u.test(value) &&
    value !== "." &&
    value !== ".." &&
    value !== "~" &&
    !/^[A-Za-z]:/u.test(value)
  );
}

function targetSummary(value: unknown): StudioTargetSummary {
  const target = record(value, "target summary");
  exactKeys(target, ["id", "label", "pluginId", "revision"], "target summary");
  assert(
    typeof target.id === "string" &&
      /^[A-Za-z0-9_-]{32}$/u.test(target.id) &&
      safeLabel(target.label, 128) &&
      typeof target.pluginId === "string" &&
      /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(target.pluginId) &&
      Number.isSafeInteger(target.revision) &&
      Number(target.revision) > 0,
    "Studio RPC target summary values are invalid.",
  );
  return target as unknown as StudioTargetSummary;
}

function projectScan(value: unknown): StudioProjectScan {
  const scan = record(value, "project scan");
  assert(Array.isArray(scan.items), "Studio RPC scan items are not an array.");
  assert(scan.items.length <= 128, "Studio RPC returned too many targets.");
  const items = scan.items.map(targetSummary);
  assert(
    new Set(items.map(({ id }) => id)).size === items.length,
    "Studio RPC target IDs are duplicated within a project.",
  );
  if (scan.state === "not_scanned") {
    exactKeys(scan, ["state", "items"], "project scan");
    assert(items.length === 0, "Unscanned Studio project is not empty.");
    return { state: "not_scanned", items: [] };
  }
  if (scan.state === "ready" || scan.state === "partial") {
    exactKeys(scan, ["state", "items"], "project scan");
    return { state: scan.state, items };
  }
  exactKeys(scan, ["state", "reason", "items"], "project scan");
  assert(
    scan.state === "unavailable" &&
      ["source_changed", "scan_failed", "capacity_reached"].includes(
        String(scan.reason),
      ) &&
      items.length === 0,
    "Studio RPC project scan values are invalid.",
  );
  return scan as unknown as StudioProjectScan;
}

function projectOption(value: unknown): StudioProjectOption {
  const option = record(value, "project option");
  exactKeys(option, ["id", "label", "activity", "scan"], "project option");
  const activity = record(option.activity, "project activity");
  exactKeys(activity, ["active", "lastThreadUpdatedAt"], "project activity");
  assert(
    typeof option.id === "string" &&
      /^[A-Za-z0-9_-]+$/u.test(option.id) &&
      Buffer.byteLength(option.id, "utf8") <= 128 &&
      safeLabel(option.label, 256) &&
      typeof activity.active === "boolean" &&
      (activity.lastThreadUpdatedAt === null ||
        (Number.isSafeInteger(activity.lastThreadUpdatedAt) &&
          Number(activity.lastThreadUpdatedAt) >= 0)),
    "Studio RPC project option values are invalid.",
  );
  return {
    id: option.id,
    label: option.label,
    activity: activity as unknown as StudioProjectOption["activity"],
    scan: projectScan(option.scan),
  };
}

function projectCatalog(value: unknown): StudioProjectCatalog {
  const catalog = record(value, "project catalog");
  assert(
    Array.isArray(catalog.items),
    "Studio RPC project items are not an array.",
  );
  assert(catalog.items.length <= 128, "Studio RPC returned too many projects.");
  const items = catalog.items.map(projectOption);
  assert(
    new Set(items.map(({ id }) => id)).size === items.length,
    "Studio RPC project IDs are duplicated.",
  );
  assert(
    items.reduce((count, { scan }) => count + scan.items.length, 0) <= 128,
    "Studio RPC returned too many target entries.",
  );
  if (catalog.state === "unavailable") {
    exactKeys(catalog, ["state", "items"], "project catalog");
    assert(
      items.length === 0,
      "Unavailable Studio project catalog is not empty.",
    );
    return { state: "unavailable", items: [] };
  }
  exactKeys(catalog, ["state", "truncated", "items"], "project catalog");
  const incomplete = items.some(
    ({ scan }) => scan.state === "partial" || scan.state === "unavailable",
  );
  assert(
    (catalog.state === "ready" || catalog.state === "partial") &&
      typeof catalog.truncated === "boolean" &&
      (catalog.state === "partial") === (catalog.truncated || incomplete),
    "Studio RPC project catalog values are invalid.",
  );
  return { state: catalog.state, truncated: catalog.truncated, items };
}

export function parseStudioSnapshot(value: unknown): StudioSnapshot {
  const snapshot = record(value, "snapshot");
  exactKeys(
    snapshot,
    [
      "schemaVersion",
      "runtimeState",
      "reason",
      "runtimeVersion",
      "apiVersion",
      "canStart",
      "browserLaunch",
      "projects",
    ],
    "snapshot",
  );
  const projects = projectCatalog(snapshot.projects);
  const states = [
    "idle",
    "starting",
    "ready",
    "stopping",
    "unavailable",
    "failed",
  ];
  const reasons = [
    "unsupported_platform",
    "artifact_missing",
    "artifact_invalid",
    "runtime_incompatible",
    "startup_failed",
  ];
  const state = String(snapshot.runtimeState);
  const reason = snapshot.reason;
  const runtimeVersion = snapshot.runtimeVersion;
  const hasIdentity =
    typeof runtimeVersion === "string" &&
    Buffer.byteLength(runtimeVersion, "utf8") <= 64 &&
    /^[0-9A-Za-z][0-9A-Za-z._+-]*$/u.test(runtimeVersion) &&
    snapshot.apiVersion === 2;
  const identityFieldsCoherent =
    hasIdentity || (runtimeVersion === null && snapshot.apiVersion === null);
  const coherent =
    identityFieldsCoherent &&
    (state === "ready" || state === "stopping") === hasIdentity &&
    (state === "idle"
      ? snapshot.canStart === true && reason === null
      : state === "unavailable"
        ? snapshot.canStart === false &&
          typeof reason === "string" &&
          reason !== "startup_failed"
        : state === "failed"
          ? snapshot.canStart === true && reason === "startup_failed"
          : snapshot.canStart === false && reason === null);
  assert(
    snapshot.schemaVersion === 3 &&
      states.includes(state) &&
      (reason === null || reasons.includes(String(reason))) &&
      (runtimeVersion === null || typeof runtimeVersion === "string") &&
      (snapshot.apiVersion === null || snapshot.apiVersion === 2) &&
      typeof snapshot.canStart === "boolean" &&
      snapshot.browserLaunch === "unavailable" &&
      coherent,
    "Studio RPC snapshot values are invalid.",
  );
  return { ...snapshot, projects } as unknown as StudioSnapshot;
}

export async function callStudioRpc(
  serverUrl: string,
  method: "status" | "refresh",
  input: Record<string, unknown>,
): Promise<StudioSnapshot> {
  const response = await fetch(
    `${serverUrl}/api/v1/plugins/studio/rpc/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  assert(
    response.status === 200,
    `Studio RPC ${method} returned HTTP ${response.status}.`,
  );
  const body = record(await response.json(), `${method} envelope`);
  exactKeys(body, ["ok", "result"], `${method} envelope`);
  assert(body.ok === true, `Studio RPC ${method} did not succeed.`);
  return parseStudioSnapshot(body.result);
}

function scannedProjects(
  snapshot: StudioSnapshot,
): readonly StudioProjectOption[] {
  assert(
    snapshot.projects.state === "ready" ||
      snapshot.projects.state === "partial",
    "Studio project refresh catalog is unavailable.",
  );
  assert(
    snapshot.projects.items.every(
      ({ scan }) => scan.state === "ready" || scan.state === "partial",
    ),
    "Studio project refresh contains an unscanned project.",
  );
  return snapshot.projects.items;
}

export function assertCatalogRefresh(
  before: StudioSnapshot,
  after: StudioSnapshot,
): void {
  const priorProjects = [...scannedProjects(before)].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const nextProjects = [...scannedProjects(after)].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  assert(
    JSON.stringify(priorProjects.map(({ id, label }) => ({ id, label }))) ===
      JSON.stringify(nextProjects.map(({ id, label }) => ({ id, label }))),
    "Studio project identity changed across refresh.",
  );
  for (let index = 0; index < priorProjects.length; index += 1) {
    const prior = priorProjects[index]!;
    const next = nextProjects[index]!;
    const priorTargets = [...prior.scan.items].sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId),
    );
    const nextTargets = [...next.scan.items].sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId),
    );
    assert(
      JSON.stringify(
        priorTargets.map(({ id, label, pluginId }) => ({
          id,
          label,
          pluginId,
        })),
      ) ===
        JSON.stringify(
          nextTargets.map(({ id, label, pluginId }) => ({
            id,
            label,
            pluginId,
          })),
        ),
      "Studio target identity changed across refresh.",
    );
    assert(
      nextTargets.every(
        (target, targetIndex) =>
          target.revision >= priorTargets[targetIndex]!.revision,
      ),
      "Studio target revisions regressed across refresh.",
    );
  }
}
