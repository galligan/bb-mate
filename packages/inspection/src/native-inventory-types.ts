import type { CommandRunner } from "./types.ts";

export const NATIVE_INVENTORY_MAX_OUTPUT_BYTES = 1_048_576;
export const NATIVE_INVENTORY_MAX_ENTRIES = 256;

export type NativeInventoryTopLevelStatus =
  "ok" | "command-error" | "output-limit" | "malformed" | "entry-limit";

export type NativeInventorySourceKind =
  "path" | "npm" | "git" | "builtin" | "catalog";

export type NativeInventoryProvenance = "builtin" | "direct" | "catalog";

export type NativeInventoryPluginStatus =
  | "running"
  | "error"
  | "incompatible"
  | "missing"
  | "disabled"
  | "degraded"
  | "needs-configuration";

export type NativeInventoryRowIssue =
  | "row"
  | "id"
  | "source"
  | "rootDir"
  | "version"
  | "provenance"
  | "isOrphanedBuiltin"
  | "enabled"
  | "status"
  | "source-provenance"
  | "canonical-root";

export interface NativeInventoryEntry {
  readonly id: string;
  readonly sourceKind: NativeInventorySourceKind;
  readonly canonicalRoot: string | null;
  readonly version: string;
  readonly provenance: NativeInventoryProvenance;
  readonly isOrphanedBuiltin: boolean;
  readonly enabled: boolean;
  readonly status: NativeInventoryPluginStatus;
}

export interface NativeInventoryMalformedRow {
  readonly index: number;
  readonly id: string | null;
  readonly canonicalRoot: string | null;
  readonly issues: readonly NativeInventoryRowIssue[];
}

export interface NativeInventoryTransitionFacts {
  readonly schemaVersion: 1;
  readonly observedAt: number;
  readonly runtimeInstanceId: string;
  readonly hostname: string;
  readonly topLevelStatus: NativeInventoryTopLevelStatus;
  readonly entries: readonly NativeInventoryEntry[];
  readonly malformedRows: readonly NativeInventoryMalformedRow[];
}

export interface NativeInventoryObservation {
  readonly observedAt: number;
}

export interface ObserveNativePluginInventoryOptions {
  readonly runtimeInstanceId: string;
}

export interface ObserveNativePluginInventoryTestOptions extends ObserveNativePluginInventoryOptions {
  readonly runBb?: CommandRunner;
  readonly now?: () => number;
  readonly hostname?: () => string;
}
