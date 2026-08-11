import type {
  InspectionCheck,
  InspectionOutcome,
  PluginInspection,
  ProvenanceKind,
} from "./types.ts";

export function inspectionOutcome(
  checks: readonly InspectionCheck[],
): InspectionOutcome {
  if (checks.some((check) => check.status === "fail")) return "blocked";
  if (
    checks.some(
      (check) => check.status === "warning" || check.status === "unavailable",
    )
  ) {
    return "attention";
  }
  return "ready";
}

export function provenanceKind(source: string | null): ProvenanceKind {
  const prefix = source?.split(":", 1)[0]?.toLowerCase();
  if (prefix === "path") return "path";
  if (prefix === "npm") return "npm";
  if (prefix === "git" || prefix === "github") return "git";
  if (prefix === "builtin" || prefix === "bundled") return "bundled";
  return "unknown";
}

function statusLabel(status: InspectionCheck["status"]): string {
  return status.toUpperCase();
}

export function formatInspection(report: PluginInspection): string {
  const lines = [
    `bb Plugin Studio compatibility report v${report.schemaVersion}`,
    `Outcome: ${report.outcome}`,
    report.target
      ? `Plugin: ${report.target.displayName} (${report.target.displayPath})`
      : `Plugin: ${report.message ?? "not selected"}`,
    report.provenance
      ? `Provenance: ${report.provenance.kind} (${report.provenance.resolved ?? report.provenance.requested ?? "source unavailable"})`
      : "Provenance: not installed in native bb",
    `Native bb: ${report.native.bbVersion ?? "unavailable"}`,
    "",
  ];

  for (const check of report.checks) {
    if (check.id === "trust.disclosure") continue;
    lines.push(`[${statusLabel(check.status)}] ${check.summary}`);
    if (check.detail) lines.push(`  ${check.detail}`);
    if (check.nextAction) lines.push(`  Next: ${check.nextAction}`);
    if (check.nativeError) {
      const detail =
        check.nativeError.stderr || check.nativeError.stdout || "no output";
      lines.push(
        `  Native error (exit ${check.nativeError.exitCode}): ${detail}`,
      );
    }
  }

  lines.push(
    "",
    "Trust: bb plugins are full-trust local code. Supported metadata does not disclose general filesystem, network, secret, or external-service access.",
    `Trust metadata: settings=${report.trust.hasSettings === null ? "unknown" : String(report.trust.hasSettings)}; capabilities=${report.trust.capabilities.join(", ") || "none reported"}; services=${report.trust.services.join(", ") || "none reported"}.`,
  );
  return lines.join("\n");
}
