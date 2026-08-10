import os from "node:os";

import { defaultRunBb } from "./native.ts";
import { parseReleasedNativeInventoryRow } from "./native-inventory-row.ts";
import { issueNativeInventoryObservation } from "./native-inventory-transition.ts";
import {
  NATIVE_INVENTORY_MAX_ENTRIES,
  NATIVE_INVENTORY_MAX_OUTPUT_BYTES,
  type NativeInventoryEntry,
  type NativeInventoryMalformedRow,
  type NativeInventoryObservation,
  type NativeInventoryTopLevelStatus,
  type NativeInventoryTransitionFacts,
  type ObserveNativePluginInventoryOptions,
  type ObserveNativePluginInventoryTestOptions,
} from "./native-inventory-types.ts";

export async function observeNativePluginInventory(
  options: ObserveNativePluginInventoryOptions,
): Promise<NativeInventoryObservation> {
  return observeNativePluginInventoryWithDependencies(options);
}

/** Test-only deterministic seam. It is intentionally not package-root exported. */
export async function observeNativePluginInventoryForTest(
  options: ObserveNativePluginInventoryTestOptions,
): Promise<NativeInventoryObservation> {
  return observeNativePluginInventoryWithDependencies(options);
}

async function observeNativePluginInventoryWithDependencies(
  options: ObserveNativePluginInventoryTestOptions,
): Promise<NativeInventoryObservation> {
  const observedAt = options.now?.() ?? Date.now();
  const hostname = normalizeHostname(options.hostname?.() ?? os.hostname());
  assertObservationIdentity(options.runtimeInstanceId, observedAt);
  const runner =
    options.runBb ??
    ((args) =>
      defaultRunBb(args, {
        timeoutMs: 5_000,
        maxOutputBytes: NATIVE_INVENTORY_MAX_OUTPUT_BYTES,
      }));
  let result;
  try {
    result = await runner(["plugin", "list", "--json"]);
  } catch {
    return issueTopLevelObservation(
      options.runtimeInstanceId,
      hostname,
      observedAt,
      "command-error",
    );
  }
  if (
    result.exitCode === 125 ||
    Buffer.byteLength(result.stdout, "utf8") > NATIVE_INVENTORY_MAX_OUTPUT_BYTES
  ) {
    return issueTopLevelObservation(
      options.runtimeInstanceId,
      hostname,
      observedAt,
      "output-limit",
    );
  }
  if (result.exitCode !== 0) {
    return issueTopLevelObservation(
      options.runtimeInstanceId,
      hostname,
      observedAt,
      "command-error",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return issueTopLevelObservation(
      options.runtimeInstanceId,
      hostname,
      observedAt,
      "malformed",
    );
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.plugins)) {
    return issueTopLevelObservation(
      options.runtimeInstanceId,
      hostname,
      observedAt,
      "malformed",
    );
  }
  if (parsed.plugins.length > NATIVE_INVENTORY_MAX_ENTRIES) {
    return issueTopLevelObservation(
      options.runtimeInstanceId,
      hostname,
      observedAt,
      "entry-limit",
    );
  }

  const entries: NativeInventoryEntry[] = [];
  const malformedRows: NativeInventoryMalformedRow[] = [];
  for (const [index, row] of parsed.plugins.entries()) {
    const normalized = await parseReleasedNativeInventoryRow(row, index);
    if ("issues" in normalized) malformedRows.push(normalized);
    else entries.push(normalized);
  }
  return issueNativeInventoryObservation({
    schemaVersion: 1,
    observedAt,
    runtimeInstanceId: options.runtimeInstanceId,
    hostname,
    topLevelStatus: "ok",
    entries,
    malformedRows,
  });
}

function issueTopLevelObservation(
  runtimeInstanceId: string,
  hostname: string,
  observedAt: number,
  topLevelStatus: Exclude<NativeInventoryTopLevelStatus, "ok">,
): NativeInventoryObservation {
  return issueNativeInventoryObservation({
    schemaVersion: 1,
    observedAt,
    runtimeInstanceId,
    hostname,
    topLevelStatus,
    entries: [],
    malformedRows: [],
  });
}

function assertObservationIdentity(
  runtimeInstanceId: string,
  observedAt: number,
): void {
  if (!/^[A-Za-z0-9_-]{32}$/u.test(runtimeInstanceId)) {
    throw new TypeError("Expected an opaque runtime instance identifier");
  }
  if (!Number.isSafeInteger(observedAt) || observedAt < 0) {
    throw new TypeError("Invalid native inventory observation metadata");
  }
}

function normalizeHostname(value: string): string {
  const hostname = value.trim();
  if (
    hostname.length < 1 ||
    hostname.length > 253 ||
    hostname.includes(":") ||
    hostname.includes("/") ||
    hostname.includes("@") ||
    hostname.includes("..") ||
    !hostname
      .split(".")
      .every(
        (label) =>
          label.length >= 1 &&
          label.length <= 63 &&
          /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u.test(label),
      )
  ) {
    throw new TypeError("Invalid native inventory hostname");
  }
  return hostname;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
