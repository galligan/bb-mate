import type { PluginInspection } from "@/plugin-inspection";
import { isOpaqueTargetId } from "@/workbench-state";

export interface PluginCandidate {
  id: string;
  label: string;
  displayPath: string;
}

export interface PluginHandoffs {
  launchCommand: string | null;
  checkCommand: string | null;
  liveCommand: string | null;
  detail: string;
}

export interface PluginSession {
  schemaVersion: 2;
  workspace: {
    label: string;
    candidates: PluginCandidate[];
    selectedTargetId: string | null;
    selectionError: string | null;
  };
  inspection: PluginInspection;
  handoffs: PluginHandoffs;
}

const invalidSession = () =>
  new Error("Plugin inspection returned an invalid session.");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    hasOnlyKeys(value, keys)
  );
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function isNullableString(value: unknown, maximum: number): boolean {
  return value === null || isBoundedString(value, maximum);
}

function isDisplayPath(value: unknown): value is string {
  return (
    isBoundedString(value, 256) &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) &&
    !/[\u0000-\u001f\u007f]/u.test(value) &&
    value.split("/").every((segment) => segment !== "..")
  );
}

function isStringArray(
  value: unknown,
  maximum: number,
  stringMaximum: number,
): boolean {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every((item) => isBoundedString(item, stringMaximum))
  );
}

function isInspectionTarget(value: unknown): boolean {
  if (value === null) return true;
  if (
    !isExactRecord(value, [
      "rootPath",
      "displayPath",
      "packageName",
      "displayName",
      "version",
      "serverEntry",
      "appEntry",
      "engines",
      "build",
    ])
  )
    return false;
  return (
    isDisplayPath(value.rootPath) &&
    isDisplayPath(value.displayPath) &&
    value.rootPath === value.displayPath &&
    isBoundedString(value.packageName, 214) &&
    isBoundedString(value.displayName, 128) &&
    isBoundedString(value.version, 64) &&
    (value.serverEntry === null || value.serverEntry === "[declared]") &&
    (value.appEntry === null || value.appEntry === "[declared]") &&
    isExactRecord(value.engines, ["bb", "pluginSdk"]) &&
    value.engines.bb === null &&
    value.engines.pluginSdk === null &&
    isExactRecord(value.build, ["server", "app"]) &&
    value.build.server === null &&
    value.build.app === null
  );
}

const checkStatuses = new Set([
  "pass",
  "info",
  "warning",
  "fail",
  "unavailable",
]);

function isInspectionCheck(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "status", "summary", "detail", "nextAction"])
  )
    return false;
  if (!["id", "status", "summary"].every((key) => Object.hasOwn(value, key)))
    return false;
  return (
    isBoundedString(value.id, 128) &&
    typeof value.status === "string" &&
    checkStatuses.has(value.status) &&
    isBoundedString(value.summary, 8_192) &&
    (value.detail === undefined || isBoundedString(value.detail, 8_192)) &&
    (value.nextAction === undefined || isBoundedString(value.nextAction, 8_192))
  );
}

function isInspectionModes(value: unknown): boolean {
  if (!isExactRecord(value, ["fixture", "harness", "live"])) return false;
  const { fixture, harness, live } = value;
  return (
    isExactRecord(fixture, ["available", "detail"]) &&
    fixture.available === true &&
    isBoundedString(fixture.detail, 8_192) &&
    isExactRecord(harness, [
      "available",
      "detail",
      "sdkVersion",
      "resolution",
      "publication",
      "publishedVersion",
    ]) &&
    harness.available === false &&
    isBoundedString(harness.detail, 8_192) &&
    harness.sdkVersion === null &&
    harness.resolution === "package-not-declared" &&
    harness.publication === "not-applicable" &&
    harness.publishedVersion === null &&
    isExactRecord(live, [
      "available",
      "detail",
      "pluginId",
      "status",
      "sourceKind",
      "url",
    ]) &&
    live.available === false &&
    isBoundedString(live.detail, 8_192) &&
    live.pluginId === null &&
    live.status === null &&
    live.sourceKind === null &&
    live.url === null
  );
}

function isInspectionTrust(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "model",
      "entrypoints",
      "skills",
      "themes",
      "hasSettings",
      "capabilities",
      "services",
      "undisclosedAccess",
      "detail",
    ])
  )
    return false;
  return (
    value.model === "full-trust-local-code" &&
    isStringArray(value.entrypoints, 16, 256) &&
    Array.isArray(value.skills) &&
    value.skills.length === 0 &&
    Array.isArray(value.themes) &&
    value.themes.length === 0 &&
    value.hasSettings === null &&
    Array.isArray(value.capabilities) &&
    value.capabilities.length === 0 &&
    Array.isArray(value.services) &&
    value.services.length === 0 &&
    Array.isArray(value.undisclosedAccess) &&
    value.undisclosedAccess.join("\0") ===
      "filesystem\0network\0secrets\0external-services" &&
    isBoundedString(value.detail, 8_192)
  );
}

function isPluginInspection(value: unknown): value is PluginInspection {
  if (
    !isExactRecord(value, [
      "schemaVersion",
      "state",
      "outcome",
      "message",
      "candidates",
      "target",
      "checks",
      "modes",
      "native",
      "provenance",
      "trust",
    ])
  )
    return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.state === "string" &&
    ["ready", "missing", "ambiguous", "error"].includes(value.state) &&
    typeof value.outcome === "string" &&
    ["ready", "attention", "blocked"].includes(value.outcome) &&
    isNullableString(value.message, 8_192) &&
    Array.isArray(value.candidates) &&
    value.candidates.length <= 128 &&
    value.candidates.every(isDisplayPath) &&
    isInspectionTarget(value.target) &&
    Array.isArray(value.checks) &&
    value.checks.length <= 128 &&
    value.checks.every(isInspectionCheck) &&
    isInspectionModes(value.modes) &&
    isExactRecord(value.native, ["bbVersion", "connectUrl"]) &&
    value.native.bbVersion === null &&
    value.native.connectUrl === null &&
    value.provenance === null &&
    isInspectionTrust(value.trust)
  );
}

export function parsePluginSession(value: unknown): PluginSession {
  if (
    !isExactRecord(value, [
      "schemaVersion",
      "workspace",
      "inspection",
      "handoffs",
    ]) ||
    value.schemaVersion !== 2 ||
    !isPluginInspection(value.inspection)
  )
    throw invalidSession();
  const { workspace, handoffs } = value;
  if (
    !isExactRecord(workspace, [
      "label",
      "candidates",
      "selectedTargetId",
      "selectionError",
    ]) ||
    !isBoundedString(workspace.label, 256) ||
    !Array.isArray(workspace.candidates) ||
    workspace.candidates.length > 128 ||
    !workspace.candidates.every(
      (candidate) =>
        isExactRecord(candidate, ["id", "label", "displayPath"]) &&
        typeof candidate.id === "string" &&
        isOpaqueTargetId(candidate.id) &&
        isBoundedString(candidate.label, 128) &&
        isDisplayPath(candidate.displayPath),
    ) ||
    (workspace.selectedTargetId !== null &&
      (typeof workspace.selectedTargetId !== "string" ||
        !isOpaqueTargetId(workspace.selectedTargetId) ||
        !workspace.candidates.some(
          (candidate) =>
            isRecord(candidate) && candidate.id === workspace.selectedTargetId,
        ))) ||
    !isNullableString(workspace.selectionError, 8_192) ||
    !isExactRecord(handoffs, [
      "launchCommand",
      "checkCommand",
      "liveCommand",
      "detail",
    ]) ||
    handoffs.launchCommand !== null ||
    handoffs.checkCommand !== null ||
    handoffs.liveCommand !== null ||
    !isBoundedString(handoffs.detail, 8_192)
  )
    throw invalidSession();
  return value as unknown as PluginSession;
}

const maximumSessionBytes = 256 * 1_024;

export async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (
    !contentType ||
    contentType.split(";", 1)[0]?.trim() !== "application/json"
  )
    throw invalidSession();
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes > maximumSessionBytes
    )
      throw invalidSession();
  }
  if (!response.body) throw invalidSession();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumSessionBytes) {
      await reader.cancel();
      throw invalidSession();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalidSession();
  }
}
