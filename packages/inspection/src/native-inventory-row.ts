import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  NativeInventoryEntry,
  NativeInventoryMalformedRow,
  NativeInventoryPluginStatus,
  NativeInventoryProvenance,
  NativeInventoryRowIssue,
} from "./native-inventory-types.ts";

type RawNativeInventorySourceKind = "path" | "npm" | "git" | "builtin";

export async function parseReleasedNativeInventoryRow(
  value: unknown,
  index: number,
): Promise<NativeInventoryEntry | NativeInventoryMalformedRow> {
  if (!isRecord(value)) return malformedRow(index, null, ["row"]);
  const issues: NativeInventoryRowIssue[] = [];
  const id = boundedString(value.id, 128);
  const source = boundedString(value.source, 4_096);
  const rootDir = boundedString(value.rootDir, 4_096);
  const version = boundedString(value.version, 128);
  const provenance = isProvenance(value.provenance) ? value.provenance : null;
  const status = isPluginStatus(value.status) ? value.status : null;

  if (!id) issues.push("id");
  if (!source) issues.push("source");
  if (!rootDir || !path.isAbsolute(rootDir)) issues.push("rootDir");
  if (!version) issues.push("version");
  if (!provenance) issues.push("provenance");
  if (typeof value.isOrphanedBuiltin !== "boolean") {
    issues.push("isOrphanedBuiltin");
  }
  if (typeof value.enabled !== "boolean") issues.push("enabled");
  if (!status) issues.push("status");

  const rawSourceKind = source ? sourceKind(source) : null;
  if (source && !rawSourceKind) issues.push("source");
  if (
    rawSourceKind &&
    provenance &&
    !sourceAndProvenanceAgree(rawSourceKind, provenance)
  ) {
    issues.push("source-provenance");
  }
  if (
    value.isOrphanedBuiltin === true &&
    rawSourceKind !== null &&
    rawSourceKind !== "builtin"
  ) {
    issues.push("isOrphanedBuiltin");
  }

  const canonicalRoot = await canonicalDirectRoot({
    issues,
    provenance,
    rootDir,
    source,
    sourceKind: rawSourceKind,
  });
  if (
    issues.length > 0 ||
    !id ||
    !version ||
    !provenance ||
    !status ||
    !rawSourceKind
  ) {
    return malformedRow(index, id, issues, canonicalRoot);
  }

  return Object.freeze({
    id,
    sourceKind:
      rawSourceKind === "builtin" && provenance === "catalog"
        ? "catalog"
        : rawSourceKind,
    canonicalRoot,
    version,
    provenance,
    isOrphanedBuiltin: value.isOrphanedBuiltin as boolean,
    enabled: value.enabled as boolean,
    status,
  });
}

async function canonicalDirectRoot(input: {
  readonly issues: NativeInventoryRowIssue[];
  readonly provenance: NativeInventoryProvenance | null;
  readonly rootDir: string | null;
  readonly source: string | null;
  readonly sourceKind: RawNativeInventorySourceKind | null;
}): Promise<string | null> {
  if (
    input.sourceKind !== "path" ||
    input.provenance !== "direct" ||
    !input.rootDir ||
    !path.isAbsolute(input.rootDir)
  ) {
    return null;
  }
  const declaredRoot = input.source?.slice("path:".length) ?? "";
  if (!declaredRoot || !path.isAbsolute(declaredRoot)) {
    input.issues.push("source");
    return null;
  }
  try {
    const [canonicalDeclaredRoot, canonicalRuntimeRoot] = await Promise.all([
      fs.realpath(declaredRoot),
      fs.realpath(input.rootDir),
    ]);
    if (canonicalDeclaredRoot === canonicalRuntimeRoot) {
      return canonicalRuntimeRoot;
    }
    input.issues.push("source");
  } catch {
    input.issues.push("canonical-root");
  }
  return null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && Buffer.byteLength(trimmed, "utf8") <= maxLength
    ? trimmed
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProvenance(value: unknown): value is NativeInventoryProvenance {
  return value === "builtin" || value === "direct" || value === "catalog";
}

function isPluginStatus(value: unknown): value is NativeInventoryPluginStatus {
  return (
    value === "running" ||
    value === "error" ||
    value === "incompatible" ||
    value === "missing" ||
    value === "disabled" ||
    value === "degraded" ||
    value === "needs-configuration"
  );
}

function sourceKind(value: string): RawNativeInventorySourceKind | null {
  if (hasSourceIdentity(value, "path:")) return "path";
  if (hasSourceIdentity(value, "npm:")) return "npm";
  if (hasSourceIdentity(value, "git:")) return "git";
  if (hasSourceIdentity(value, "builtin:")) return "builtin";
  return null;
}

function hasSourceIdentity(value: string, prefix: string): boolean {
  return (
    value.startsWith(prefix) && value.slice(prefix.length).trim().length > 0
  );
}

function sourceAndProvenanceAgree(
  kind: RawNativeInventorySourceKind,
  provenance: NativeInventoryProvenance,
): boolean {
  return kind === "builtin"
    ? provenance === "builtin" || provenance === "catalog"
    : provenance === "direct";
}

function malformedRow(
  index: number,
  id: string | null,
  issues: readonly NativeInventoryRowIssue[],
  canonicalRoot: string | null = null,
): NativeInventoryMalformedRow {
  return Object.freeze({
    index,
    id,
    canonicalRoot,
    issues: Object.freeze([...new Set(issues)]),
  });
}
