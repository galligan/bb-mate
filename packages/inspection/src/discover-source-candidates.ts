import type { Dirent } from "node:fs";
import { readBoundedDirectoryEntries } from "./bounded-directory-reader.ts";
import type {
  DiscoveryDiagnostic,
  SourceCandidate,
  SourceDiscoveryResult,
  TrustedRoot,
} from "./discovery-types.ts";
import { discoveryDiagnostic } from "./discovery-diagnostic.ts";
import { DiscoveryFailure } from "./discovery-errors.ts";
import { candidateAtRoot } from "./discovery-manifest.ts";
import {
  attestScanDirectory,
  displayPathFor,
  type ScanDirectoryAttestation,
} from "./discovery-path-safety.ts";
import {
  consumeEntries,
  createRootScanStates,
  type PendingDirectory,
  recordCandidate,
  redistributeUnusedCandidateCapacity,
  redistributeUnusedEntryCapacity,
  reportTrueLimits,
  type RootScanState,
} from "./discovery-scan-state.ts";
import { runDiscoveryTestHook } from "./discovery-test-hook.ts";

export async function discoverSourceCandidates(
  roots: readonly TrustedRoot[],
): Promise<SourceDiscoveryResult> {
  const candidates: SourceCandidate[] = [];
  const diagnostics: DiscoveryDiagnostic[] = [];
  const states = createRootScanStates(roots);

  for (const state of states) {
    await scanAvailable(state, candidates, diagnostics);
  }
  await redistributeUnusedEntryCapacity(
    states,
    candidates,
    diagnostics,
    scanAvailable,
  );
  redistributeUnusedCandidateCapacity(states, candidates);
  reportTrueLimits(states, candidates.length, diagnostics);

  candidates.sort((left, right) =>
    left.canonicalRoot.localeCompare(right.canonicalRoot),
  );
  return {
    candidates: Object.freeze(candidates),
    diagnostics: Object.freeze(diagnostics),
  };
}

async function scanAvailable(
  state: RootScanState,
  candidates: SourceCandidate[],
  diagnostics: DiscoveryDiagnostic[],
): Promise<void> {
  while (true) {
    while (state.queue.length > 0) {
      const current = state.queue.shift();
      if (!current) break;
      await inspectPendingDirectory(state, current, candidates, diagnostics);
    }
    if (state.budget.visitedEntries >= state.budget.maxVisitedEntries) return;
    const continuation = state.continuations.shift();
    if (!continuation) return;
    if (continuation.kind === "entries") {
      consumeEntries(
        state,
        continuation.current,
        continuation.entries,
        diagnostics,
      );
      continue;
    }
    const entries = await readDirectoryEntries(
      state,
      continuation.current,
      diagnostics,
      continuation.attestation,
    );
    if (entries) {
      consumeEntries(state, continuation.current, entries, diagnostics);
    }
  }
}

async function inspectPendingDirectory(
  state: RootScanState,
  current: PendingDirectory,
  candidates: SourceCandidate[],
  diagnostics: DiscoveryDiagnostic[],
): Promise<void> {
  const attestation = await attestDirectoryOrReport(
    state,
    current,
    diagnostics,
  );
  if (!attestation) return;
  const candidate = await inspectDirectory(state.root, current, diagnostics);
  const stable = await attestDirectoryOrReport(
    state,
    current,
    diagnostics,
    attestation,
  );
  if (!stable) return;

  if (state.budget.visitedEntries < state.budget.maxVisitedEntries) {
    const entries = await readDirectoryEntries(
      state,
      current,
      diagnostics,
      stable,
    );
    if (!entries) return;
    consumeEntries(state, current, entries, diagnostics);
  } else {
    state.continuations.push({
      kind: "children",
      current,
      attestation: stable,
    });
    state.entryLimitDisplayPath ??= displayPathFor(
      state.root,
      current.relative,
    );
  }
  if (candidate) recordCandidate(state, candidate, candidates);
}

async function readDirectoryEntries(
  state: RootScanState,
  current: PendingDirectory,
  diagnostics: DiscoveryDiagnostic[],
  expected: ScanDirectoryAttestation,
): Promise<Dirent[] | null> {
  const stableBefore = await attestDirectoryOrReport(
    state,
    current,
    diagnostics,
    expected,
  );
  if (!stableBefore) return null;
  let entries: Dirent[];
  try {
    await runDiscoveryTestHook({
      point: "before-directory-read",
      path: current.directory,
    });
    const read = await readBoundedDirectoryEntries(current.directory);
    entries = [...read.entries];
    if (read.limited) {
      state.truncatedEntries = true;
      diagnostics.push(
        discoveryDiagnostic(
          "scan-directory-limit",
          state.root,
          displayPathFor(state.root, current.relative),
          "A source directory reached its bounded enumeration limit; results are partial.",
        ),
      );
    }
  } catch {
    const displayPath = displayPathFor(state.root, current.relative);
    diagnostics.push(
      discoveryDiagnostic(
        "scan-directory-unreadable",
        state.root,
        displayPath,
        `Source directory ${displayPath} could not be read.`,
      ),
    );
    return null;
  }
  await runDiscoveryTestHook({
    point: "after-directory-read",
    path: current.directory,
  });
  const stableAfter = await attestDirectoryOrReport(
    state,
    current,
    diagnostics,
    stableBefore,
  );
  if (!stableAfter) return null;
  return entries;
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
      discoveryDiagnostic(
        error instanceof DiscoveryFailure ? error.code : "manifest-invalid",
        root,
        displayPath,
        `Manifest at ${displayPath} is invalid: ${reason}`,
      ),
    );
    return null;
  }
}

async function attestDirectoryOrReport(
  state: RootScanState,
  current: PendingDirectory,
  diagnostics: DiscoveryDiagnostic[],
  expected?: ScanDirectoryAttestation,
): Promise<ScanDirectoryAttestation | null> {
  try {
    return await attestScanDirectory(
      current.directory,
      state.canonicalRoot,
      expected,
    );
  } catch (error) {
    const displayPath = displayPathFor(state.root, current.relative);
    diagnostics.push(
      discoveryDiagnostic(
        error instanceof DiscoveryFailure
          ? error.code
          : "scan-directory-changed",
        state.root,
        displayPath,
        `Source directory ${displayPath} could not be scanned safely.`,
      ),
    );
    return null;
  }
}
