import type { Dirent } from "node:fs";
import path from "node:path";
import type {
  DiscoveryDiagnostic,
  SourceCandidate,
  TrustedRoot,
} from "./discovery-types.ts";
import {
  allocateDiscoveryRootBudgets,
  allocateFairShares,
  type DiscoveryRootBudget,
} from "./discovery-budget.ts";
import { discoveryDiagnostic } from "./discovery-diagnostic.ts";
import {
  displayPathFor,
  type ScanDirectoryAttestation,
} from "./discovery-path-safety.ts";
import { trustedRootDetails } from "./trusted-roots.ts";

export const MAX_SCAN_DEPTH = 4;
export const MAX_VISITED_ENTRIES = 2048;
export const MAX_CANDIDATES = 128;

export interface PendingDirectory {
  readonly directory: string;
  readonly relative: string;
  readonly depth: number;
}

export type ScanContinuation =
  | {
      readonly kind: "children";
      readonly current: PendingDirectory;
      readonly attestation: ScanDirectoryAttestation;
    }
  | {
      readonly kind: "entries";
      readonly current: PendingDirectory;
      readonly entries: readonly Dirent[];
    };

export interface RootScanState {
  readonly root: TrustedRoot;
  readonly canonicalRoot: string;
  readonly budget: DiscoveryRootBudget;
  readonly queue: PendingDirectory[];
  readonly continuations: ScanContinuation[];
  readonly overflowCandidates: SourceCandidate[];
  readonly candidateByCanonicalRoot: Map<string, SourceCandidate>;
  entryLimitDisplayPath: string | null;
  truncatedEntries: boolean;
}

export function createRootScanStates(
  roots: readonly TrustedRoot[],
): RootScanState[] {
  const candidateByCanonicalRoot = new Map<string, SourceCandidate>();
  const ordered = roots
    .map((root) => ({
      root,
      canonicalRoot: trustedRootDetails(root).canonicalRoot,
    }))
    .sort((left, right) =>
      left.canonicalRoot.localeCompare(right.canonicalRoot),
    );
  const budgets = allocateDiscoveryRootBudgets(
    ordered.length,
    MAX_VISITED_ENTRIES,
    MAX_CANDIDATES,
  );
  return ordered.map((state, index) => ({
    ...state,
    budget: budgets[index]!,
    queue: [{ directory: state.canonicalRoot, relative: "", depth: 0 }],
    continuations: [],
    overflowCandidates: [],
    candidateByCanonicalRoot,
    entryLimitDisplayPath: null,
    truncatedEntries: false,
  }));
}

export function consumeEntries(
  state: RootScanState,
  current: PendingDirectory,
  entries: readonly Dirent[],
  diagnostics: DiscoveryDiagnostic[],
): void {
  for (const [index, entry] of entries.entries()) {
    if (state.budget.visitedEntries >= state.budget.maxVisitedEntries) {
      const retained = entries.slice(index, index + MAX_VISITED_ENTRIES);
      state.continuations.unshift({
        kind: "entries",
        current,
        entries: retained,
      });
      state.truncatedEntries ||= index + retained.length < entries.length;
      state.entryLimitDisplayPath ??= displayPathFor(
        state.root,
        current.relative,
      );
      return;
    }
    state.budget.visitedEntries += 1;
    const relative = path.join(current.relative, entry.name);
    if (entry.isSymbolicLink()) {
      if (entry.name !== "package.json") {
        const displayPath = displayPathFor(state.root, relative);
        diagnostics.push(
          discoveryDiagnostic(
            "path-symlink",
            state.root,
            displayPath,
            `Source path ${displayPath} is a symlink and was skipped.`,
          ),
        );
      }
      continue;
    }
    if (!entry.isDirectory() || shouldIgnoreDirectory(entry.name)) continue;
    if (current.depth >= MAX_SCAN_DEPTH) {
      const displayPath = displayPathFor(state.root, relative);
      diagnostics.push(
        discoveryDiagnostic(
          "scan-depth-limit",
          state.root,
          displayPath,
          `Source path ${displayPath} exceeds the depth-${MAX_SCAN_DEPTH} scan limit.`,
        ),
      );
      continue;
    }
    state.queue.push({
      directory: path.join(current.directory, entry.name),
      relative,
      depth: current.depth + 1,
    });
  }
}

export function recordCandidate(
  state: RootScanState,
  candidate: SourceCandidate,
  candidates: SourceCandidate[],
): void {
  const existing = state.candidateByCanonicalRoot.get(candidate.canonicalRoot);
  if (existing !== undefined) {
    const rootKeys = discoveringRootKeys.get(existing);
    if (rootKeys !== undefined && !rootKeys.includes(candidate.rootKey)) {
      rootKeys.push(candidate.rootKey);
    }
    return;
  }
  if (state.budget.acceptedCandidates < state.budget.maxCandidates) {
    recordUniqueCandidate(state, candidate);
    candidates.push(candidate);
    state.budget.acceptedCandidates += 1;
    return;
  }
  if (state.overflowCandidates.length < MAX_CANDIDATES) {
    recordUniqueCandidate(state, candidate);
    state.overflowCandidates.push(candidate);
  }
}

const discoveringRootKeys = new WeakMap<object, string[]>();

export function sourceCandidateDiscoveringRootKeys(
  candidate: SourceCandidate,
): readonly string[] {
  const rootKeys = discoveringRootKeys.get(candidate);
  if (rootKeys === undefined) {
    throw new TypeError("source candidate was not recorded by discovery");
  }
  return Object.freeze([...rootKeys]);
}

function recordUniqueCandidate(
  state: RootScanState,
  candidate: SourceCandidate,
): void {
  state.candidateByCanonicalRoot.set(candidate.canonicalRoot, candidate);
  discoveringRootKeys.set(candidate, [candidate.rootKey]);
}

export async function redistributeUnusedEntryCapacity(
  states: RootScanState[],
  candidates: SourceCandidate[],
  diagnostics: DiscoveryDiagnostic[],
  scanAvailable: (
    state: RootScanState,
    candidates: SourceCandidate[],
    diagnostics: DiscoveryDiagnostic[],
  ) => Promise<void>,
): Promise<void> {
  while (true) {
    const used = visitedEntryCount(states);
    const remaining = MAX_VISITED_ENTRIES - used;
    const active = states.filter((state) => state.continuations.length > 0);
    if (remaining <= 0 || active.length === 0) return;
    const shares = allocateFairShares(remaining, active.length);
    for (const [index, state] of active.entries()) {
      state.budget.maxVisitedEntries += shares[index] ?? 0;
      await scanAvailable(state, candidates, diagnostics);
    }
    if (visitedEntryCount(states) === used) return;
  }
}

export function redistributeUnusedCandidateCapacity(
  states: RootScanState[],
  candidates: SourceCandidate[],
): void {
  while (candidates.length < MAX_CANDIDATES) {
    let progressed = false;
    for (const state of states) {
      const candidate = state.overflowCandidates.shift();
      if (!candidate) continue;
      candidates.push(candidate);
      state.budget.acceptedCandidates += 1;
      progressed = true;
      if (candidates.length >= MAX_CANDIDATES) return;
    }
    if (!progressed) return;
  }
}

export function reportTrueLimits(
  states: RootScanState[],
  candidateCount: number,
  diagnostics: DiscoveryDiagnostic[],
): void {
  if (visitedEntryCount(states) >= MAX_VISITED_ENTRIES) {
    for (const state of states) {
      if (state.continuations.length === 0 && !state.truncatedEntries) continue;
      const displayPath = state.entryLimitDisplayPath ?? state.root.displayName;
      diagnostics.push(
        discoveryDiagnostic(
          "scan-entry-limit",
          state.root,
          displayPath,
          `Source scan at ${displayPath} reached the global ${MAX_VISITED_ENTRIES}-entry limit.`,
        ),
      );
    }
  }
  if (candidateCount >= MAX_CANDIDATES) {
    for (const state of states) {
      const overflow = state.overflowCandidates[0];
      if (!overflow) continue;
      diagnostics.push(
        discoveryDiagnostic(
          "candidate-limit",
          state.root,
          overflow.displayPath,
          `Source candidate ${overflow.displayPath} exceeds the global ${MAX_CANDIDATES}-candidate limit.`,
        ),
      );
    }
  }
}

function visitedEntryCount(states: RootScanState[]): number {
  return states.reduce(
    (total, state) => total + state.budget.visitedEntries,
    0,
  );
}

function shouldIgnoreDirectory(name: string): boolean {
  return (
    name.startsWith(".") ||
    ["node_modules", "dist", "cache", "caches"].includes(name)
  );
}
