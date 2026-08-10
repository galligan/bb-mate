import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  DiscoveryDiagnostic,
  SourceCandidate,
  SourceDiscoveryResult,
  TrustedRoot,
} from "./discovery-types.ts";
import {
  boundedDiagnosticDetail,
  DiscoveryFailure,
} from "./discovery-errors.ts";
import {
  allocateDiscoveryRootBudgets,
  type DiscoveryRootBudget,
} from "./discovery-budget.ts";
import { candidateAtRoot } from "./discovery-manifest.ts";
import {
  attestScanDirectory,
  displayPathFor,
  type ScanDirectoryAttestation,
} from "./discovery-path-safety.ts";
import { runDiscoveryTestHook } from "./discovery-test-hook.ts";
import { trustedRootDetails } from "./trusted-roots.ts";

const MAX_SCAN_DEPTH = 4;
const MAX_VISITED_ENTRIES = 2048;
const MAX_CANDIDATES = 128;

interface PendingDirectory {
  readonly directory: string;
  readonly relative: string;
  readonly depth: number;
}

export async function discoverSourceCandidates(
  roots: readonly TrustedRoot[],
): Promise<SourceDiscoveryResult> {
  const candidates: SourceCandidate[] = [];
  const diagnostics: DiscoveryDiagnostic[] = [];
  const rootBudgets = allocateDiscoveryRootBudgets(
    roots.length,
    MAX_VISITED_ENTRIES,
    MAX_CANDIDATES,
  );

  for (const [rootIndex, root] of roots.entries()) {
    const budget = rootBudgets[rootIndex];
    if (!budget) continue;
    const { canonicalRoot } = trustedRootDetails(root);
    const queue: PendingDirectory[] = [
      { directory: canonicalRoot, relative: "", depth: 0 },
    ];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const attestation = await attestDirectoryOrReport(
        root,
        current,
        canonicalRoot,
        diagnostics,
      );
      if (!attestation) continue;
      const candidate = await inspectDirectory(root, current, diagnostics);
      const stableAfterManifest = await attestDirectoryOrReport(
        root,
        current,
        canonicalRoot,
        diagnostics,
        attestation,
      );
      if (!stableAfterManifest) continue;
      const stableAfterRead = await enqueueChildren(
        root,
        current,
        queue,
        diagnostics,
        budget,
        canonicalRoot,
        stableAfterManifest,
      );
      if (!stableAfterRead) continue;
      if (candidate && budget.acceptedCandidates < budget.maxCandidates) {
        candidates.push(candidate);
        budget.acceptedCandidates += 1;
      } else if (candidate && !budget.candidateLimitReported) {
        diagnostics.push(
          diagnostic(
            "candidate-limit",
            root,
            candidate.displayPath,
            `Source candidate ${candidate.displayPath} exceeds its ${budget.maxCandidates}-candidate share of the global ${MAX_CANDIDATES}-candidate limit.`,
          ),
        );
        budget.candidateLimitReported = true;
      }
    }
  }

  candidates.sort((left, right) =>
    left.canonicalRoot.localeCompare(right.canonicalRoot),
  );
  return {
    candidates: Object.freeze(candidates),
    diagnostics: Object.freeze(diagnostics),
  };
}

async function inspectDirectory(
  root: TrustedRoot,
  current: PendingDirectory,
  diagnostics: DiscoveryDiagnostic[],
): Promise<SourceCandidate | null> {
  try {
    return await candidateAtRoot(root, current.directory, current.relative);
  } catch (error) {
    const displayPath = displayPathFor(root, current.relative);
    const reason =
      error instanceof SyntaxError
        ? error.message
        : "declared manifest fields could not be validated";
    diagnostics.push(
      diagnostic(
        error instanceof DiscoveryFailure ? error.code : "manifest-invalid",
        root,
        displayPath,
        `Manifest at ${displayPath} is invalid: ${reason}`,
      ),
    );
    return null;
  }
}

async function enqueueChildren(
  root: TrustedRoot,
  current: PendingDirectory,
  queue: PendingDirectory[],
  diagnostics: DiscoveryDiagnostic[],
  budget: DiscoveryRootBudget,
  canonicalRoot: string,
  attestation: ScanDirectoryAttestation,
): Promise<boolean> {
  let entries;
  try {
    await runDiscoveryTestHook({
      point: "before-directory-read",
      path: current.directory,
    });
    entries = await fs.readdir(current.directory, { withFileTypes: true });
  } catch {
    const displayPath = displayPathFor(root, current.relative);
    diagnostics.push(
      diagnostic(
        "scan-directory-unreadable",
        root,
        displayPath,
        `Source directory ${displayPath} could not be read.`,
      ),
    );
    return false;
  }
  await runDiscoveryTestHook({
    point: "after-directory-read",
    path: current.directory,
  });
  const stable = await attestDirectoryOrReport(
    root,
    current,
    canonicalRoot,
    diagnostics,
    attestation,
  );
  if (!stable) return false;
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (budget.visitedEntries >= budget.maxVisitedEntries) {
      if (!budget.entryLimitReported) {
        const displayPath = displayPathFor(root, current.relative);
        diagnostics.push(
          diagnostic(
            "scan-entry-limit",
            root,
            displayPath,
            `Source scan at ${displayPath} reached its ${budget.maxVisitedEntries}-entry share of the global ${MAX_VISITED_ENTRIES}-entry limit.`,
          ),
        );
        budget.entryLimitReported = true;
      }
      break;
    }
    budget.visitedEntries += 1;
    const relative = path.join(current.relative, entry.name);
    if (entry.isSymbolicLink()) {
      if (entry.name !== "package.json") {
        const displayPath = displayPathFor(root, relative);
        diagnostics.push(
          diagnostic(
            "path-symlink",
            root,
            displayPath,
            `Source path ${displayPath} is a symlink and was skipped.`,
          ),
        );
      }
      continue;
    }
    if (!entry.isDirectory() || shouldIgnoreDirectory(entry.name)) continue;
    if (current.depth >= MAX_SCAN_DEPTH) {
      const displayPath = displayPathFor(root, relative);
      diagnostics.push(
        diagnostic(
          "scan-depth-limit",
          root,
          displayPath,
          `Source path ${displayPath} exceeds the depth-${MAX_SCAN_DEPTH} scan limit.`,
        ),
      );
      continue;
    }
    queue.push({
      directory: path.join(current.directory, entry.name),
      relative,
      depth: current.depth + 1,
    });
  }
  return true;
}

async function attestDirectoryOrReport(
  root: TrustedRoot,
  current: PendingDirectory,
  canonicalRoot: string,
  diagnostics: DiscoveryDiagnostic[],
  expected?: ScanDirectoryAttestation,
): Promise<ScanDirectoryAttestation | null> {
  try {
    return await attestScanDirectory(
      current.directory,
      canonicalRoot,
      expected,
    );
  } catch (error) {
    const displayPath = displayPathFor(root, current.relative);
    diagnostics.push(
      diagnostic(
        error instanceof DiscoveryFailure
          ? error.code
          : "scan-directory-changed",
        root,
        displayPath,
        `Source directory ${displayPath} could not be scanned safely.`,
      ),
    );
    return null;
  }
}

function diagnostic(
  code: string,
  root: TrustedRoot,
  displayPath: string,
  detail: string,
): DiscoveryDiagnostic {
  return {
    code,
    rootKey: root.rootKey,
    displayPath,
    detail: boundedDiagnosticDetail(detail),
  };
}

function shouldIgnoreDirectory(name: string): boolean {
  return (
    name.startsWith(".") ||
    ["node_modules", "dist", "cache", "caches"].includes(name)
  );
}
