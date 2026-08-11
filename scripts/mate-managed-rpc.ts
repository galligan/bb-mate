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
    value !== null && typeof value === "object",
    `Mate RPC ${label} is not an object.`,
  );
  return value as Record<string, unknown>;
}

export interface MateProjectOption {
  readonly id: string;
  readonly label: string;
  readonly admission: "available" | "no_source";
}

export interface MateTargetSummary {
  readonly id: string;
  readonly label: string;
  readonly pluginId: string;
  readonly revision: number;
}

export interface MateSnapshot {
  readonly schemaVersion: 2;
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
  readonly projects:
    | { readonly state: "ready"; readonly items: readonly MateProjectOption[] }
    | { readonly state: "unavailable"; readonly items: readonly [] };
  readonly targets:
    | {
        readonly state: "ready" | "partial";
        readonly items: readonly MateTargetSummary[];
      }
    | { readonly state: "project_not_selected"; readonly items: readonly [] }
    | {
        readonly state: "unavailable";
        readonly reason:
          "runtime_not_ready" | "runtime_incompatible" | "catalog_unavailable";
        readonly items: readonly [];
      };
}

function safeLabel(value: unknown, maximumBytes: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    Buffer.byteLength(value, "utf8") <= maximumBytes &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function projectCatalog(value: unknown): MateSnapshot["projects"] {
  const catalog = record(value, "project catalog");
  exactKeys(catalog, ["state", "items"], "project catalog");
  assert(
    Array.isArray(catalog.items),
    "Mate RPC project items are not an array.",
  );
  assert(catalog.items.length <= 128, "Mate RPC returned too many projects.");
  const items = catalog.items.map((item): MateProjectOption => {
    const option = record(item, "project option");
    exactKeys(option, ["id", "label", "admission"], "project option");
    assert(
      typeof option.id === "string" &&
        /^[A-Za-z0-9_-]+$/u.test(option.id) &&
        Buffer.byteLength(option.id, "utf8") <= 128 &&
        safeLabel(option.label, 256) &&
        (option.admission === "available" || option.admission === "no_source"),
      "Mate RPC project option values are invalid.",
    );
    return option as unknown as MateProjectOption;
  });
  assert(
    new Set(items.map(({ id }) => id)).size === items.length,
    "Mate RPC project IDs are duplicated.",
  );
  if (catalog.state === "ready") return { state: "ready", items };
  assert(
    catalog.state === "unavailable" && items.length === 0,
    "Mate RPC project catalog values are invalid.",
  );
  return { state: "unavailable", items: [] };
}

function targetCatalog(value: unknown): MateSnapshot["targets"] {
  const catalog = record(value, "target catalog");
  assert(
    Array.isArray(catalog.items),
    "Mate RPC target items are not an array.",
  );
  assert(catalog.items.length <= 128, "Mate RPC returned too many targets.");
  const items = catalog.items.map((item): MateTargetSummary => {
    const target = record(item, "target summary");
    exactKeys(
      target,
      ["id", "label", "pluginId", "revision"],
      "target summary",
    );
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
  });
  assert(
    new Set(items.map(({ id }) => id)).size === items.length,
    "Mate RPC target IDs are duplicated.",
  );
  if (catalog.state === "ready" || catalog.state === "partial") {
    exactKeys(catalog, ["state", "items"], "target catalog");
    return { state: catalog.state, items };
  }
  assert(items.length === 0, "Unavailable Mate target catalog is not empty.");
  if (catalog.state === "project_not_selected") {
    exactKeys(catalog, ["state", "items"], "target catalog");
    return { state: "project_not_selected", items: [] };
  }
  exactKeys(catalog, ["state", "reason", "items"], "target catalog");
  assert(
    catalog.state === "unavailable" &&
      [
        "runtime_not_ready",
        "runtime_incompatible",
        "catalog_unavailable",
      ].includes(String(catalog.reason)),
    "Mate RPC target catalog values are invalid.",
  );
  return catalog as unknown as MateSnapshot["targets"];
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
      "targets",
    ],
    "snapshot",
  );
  const projects = projectCatalog(snapshot.projects);
  const targets = targetCatalog(snapshot.targets);
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
    snapshot.schemaVersion === 2 &&
      states.includes(state) &&
      (reason === null || reasons.includes(String(reason))) &&
      (runtimeVersion === null || typeof runtimeVersion === "string") &&
      (snapshot.apiVersion === null || snapshot.apiVersion === 2) &&
      typeof snapshot.canStart === "boolean" &&
      snapshot.browserLaunch === "unavailable" &&
      coherent,
    "Mate RPC snapshot values are invalid.",
  );
  return { ...snapshot, projects, targets } as unknown as MateSnapshot;
}

export async function callMateRpc(
  serverUrl: string,
  method: "status" | "admit",
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

export function assertTargetRefresh(
  before: MateSnapshot,
  after: MateSnapshot,
): void {
  assert(
    (before.targets.state === "ready" || before.targets.state === "partial") &&
      (after.targets.state === "ready" || after.targets.state === "partial"),
    "Mate target refresh snapshots are not ready.",
  );
  const prior = [...before.targets.items].sort((left, right) =>
    left.pluginId.localeCompare(right.pluginId),
  );
  const next = [...after.targets.items].sort((left, right) =>
    left.pluginId.localeCompare(right.pluginId),
  );
  assert(
    JSON.stringify(
      prior.map(({ id, label, pluginId }) => ({ id, label, pluginId })),
    ) ===
      JSON.stringify(
        next.map(({ id, label, pluginId }) => ({ id, label, pluginId })),
      ),
    "Mate target identity changed across refresh.",
  );
  assert(
    next.every((target, index) => target.revision > prior[index]!.revision),
    "Mate target revisions did not advance across refresh.",
  );
}
