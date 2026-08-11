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
    `Mate RPC ${label} keys differ.`,
  );
}

function record(value: unknown, label: string): Record<string, unknown> {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `Mate RPC ${label} is not an object.`,
  );
  return value as Record<string, unknown>;
}

export interface MateTargetSummary {
  readonly id: string;
  readonly label: string;
  readonly pluginId: string;
  readonly revision: number;
}

export type MateProjectScan =
  | { readonly state: "not_scanned"; readonly items: readonly [] }
  | {
      readonly state: "ready" | "partial";
      readonly items: readonly MateTargetSummary[];
    }
  | {
      readonly state: "unavailable";
      readonly reason: "source_changed" | "scan_failed" | "capacity_reached";
      readonly items: readonly [];
    };

export interface MateProjectOption {
  readonly id: string;
  readonly label: string;
  readonly activity: {
    readonly active: boolean;
    readonly lastThreadUpdatedAt: number | null;
  };
  readonly scan: MateProjectScan;
}

export type MateProjectCatalog =
  | {
      readonly state: "ready" | "partial";
      readonly items: readonly MateProjectOption[];
    }
  | { readonly state: "unavailable"; readonly items: readonly [] };

export interface MateSnapshot {
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
  readonly projects: MateProjectCatalog;
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

function targetSummary(value: unknown): MateTargetSummary {
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
    "Mate RPC target summary values are invalid.",
  );
  return target as unknown as MateTargetSummary;
}

function projectScan(value: unknown): MateProjectScan {
  const scan = record(value, "project scan");
  assert(Array.isArray(scan.items), "Mate RPC scan items are not an array.");
  assert(scan.items.length <= 128, "Mate RPC returned too many targets.");
  const items = scan.items.map(targetSummary);
  assert(
    new Set(items.map(({ id }) => id)).size === items.length,
    "Mate RPC target IDs are duplicated within a project.",
  );
  if (scan.state === "not_scanned") {
    exactKeys(scan, ["state", "items"], "project scan");
    assert(items.length === 0, "Unscanned Mate project is not empty.");
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
    "Mate RPC project scan values are invalid.",
  );
  return scan as unknown as MateProjectScan;
}

function projectOption(value: unknown): MateProjectOption {
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
    "Mate RPC project option values are invalid.",
  );
  return {
    id: option.id,
    label: option.label,
    activity: activity as unknown as MateProjectOption["activity"],
    scan: projectScan(option.scan),
  };
}

function projectCatalog(value: unknown): MateProjectCatalog {
  const catalog = record(value, "project catalog");
  exactKeys(catalog, ["state", "items"], "project catalog");
  assert(
    Array.isArray(catalog.items),
    "Mate RPC project items are not an array.",
  );
  assert(catalog.items.length <= 128, "Mate RPC returned too many projects.");
  const items = catalog.items.map(projectOption);
  assert(
    new Set(items.map(({ id }) => id)).size === items.length,
    "Mate RPC project IDs are duplicated.",
  );
  assert(
    new Set(items.flatMap(({ scan }) => scan.items.map(({ id }) => id))).size <=
      128,
    "Mate RPC returned too many distinct targets.",
  );
  if (catalog.state === "unavailable") {
    assert(
      items.length === 0,
      "Unavailable Mate project catalog is not empty.",
    );
    return { state: "unavailable", items: [] };
  }
  const incomplete = items.some(
    ({ scan }) => scan.state === "partial" || scan.state === "unavailable",
  );
  assert(
    (catalog.state === "ready" || catalog.state === "partial") &&
      incomplete === (catalog.state === "partial"),
    "Mate RPC project catalog values are invalid.",
  );
  return { state: catalog.state, items };
}

export function parseMateSnapshot(value: unknown): MateSnapshot {
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
    "Mate RPC snapshot values are invalid.",
  );
  return { ...snapshot, projects } as unknown as MateSnapshot;
}

export async function callMateRpc(
  serverUrl: string,
  method: "status" | "refresh",
  input: Record<string, unknown>,
): Promise<MateSnapshot> {
  const response = await fetch(
    `${serverUrl}/api/v1/plugins/mate/rpc/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  assert(
    response.status === 200,
    `Mate RPC ${method} returned HTTP ${response.status}.`,
  );
  const body = record(await response.json(), `${method} envelope`);
  exactKeys(body, ["ok", "result"], `${method} envelope`);
  assert(body.ok === true, `Mate RPC ${method} did not succeed.`);
  return parseMateSnapshot(body.result);
}

function scannedProjects(snapshot: MateSnapshot): readonly MateProjectOption[] {
  assert(
    snapshot.projects.state === "ready" ||
      snapshot.projects.state === "partial",
    "Mate project refresh catalog is unavailable.",
  );
  assert(
    snapshot.projects.items.every(
      ({ scan }) => scan.state === "ready" || scan.state === "partial",
    ),
    "Mate project refresh contains an unscanned project.",
  );
  return snapshot.projects.items;
}

export function assertCatalogRefresh(
  before: MateSnapshot,
  after: MateSnapshot,
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
    "Mate project identity changed across refresh.",
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
      "Mate target identity changed across refresh.",
    );
    assert(
      nextTargets.every(
        (target, targetIndex) =>
          target.revision >= priorTargets[targetIndex]!.revision,
      ),
      "Mate target revisions regressed across refresh.",
    );
  }
}
