import { constants, promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";

import { discoveryDiagnostic } from "./discovery-diagnostic.ts";
import { DiscoveryFailure } from "./discovery-errors.ts";
import { candidateAtRoot } from "./discovery-manifest.ts";
import { readBoundedManifest } from "./discovery-manifest-reader.ts";
import {
  attestScanDirectory,
  displayPathFor,
  type ScanDirectoryAttestation,
} from "./discovery-path-safety.ts";
import {
  createRootScanStates,
  recordCandidate,
  redistributeUnusedCandidateCapacity,
  redistributeUnusedEntryCapacity,
  reportTrueLimits,
  type PendingDirectory,
  type RootScanState,
} from "./discovery-scan-state.ts";
import { runDiscoveryTestHook } from "./discovery-test-hook.ts";
import type {
  DiscoveryDiagnostic,
  DiscoveryOperationOptions,
  SourceCandidate,
  SourceDiscoveryResult,
  TrustedRoot,
} from "./discovery-types.ts";

const MAX_WORKSPACE_PATTERN_COUNT = 256;
const MAX_WORKSPACE_PATTERN_BYTES = 1_024;
const MAX_WORKSPACE_PATTERN_SEGMENTS = 32;
const MAX_PNPM_WORKSPACE_BYTES = 64 * 1024;
const MAX_WORKSPACE_MATCH_WORK = 8_000_000;

interface WorkspacePattern {
  readonly negative: boolean;
  readonly segments: readonly string[];
}

interface WorkspaceScanState extends RootScanState {
  readonly patterns: readonly WorkspacePattern[];
  readonly matchBudget: WorkspaceMatchBudget;
  readonly signal?: AbortSignal;
  matchComplete: boolean;
}

interface WorkspaceMatchBudget {
  activeRoot: TrustedRoot | null;
  used: number;
}

class WorkspaceMatchLimitError extends Error {
  constructor(readonly root: TrustedRoot) {
    super("workspace match limit");
  }
}

export async function discoverWorkspaceSourceCandidates(
  roots: readonly TrustedRoot[],
  options: DiscoveryOperationOptions = {},
): Promise<SourceDiscoveryResult> {
  options.signal?.throwIfAborted();
  const candidates: SourceCandidate[] = [];
  const diagnostics: DiscoveryDiagnostic[] = [];
  const baseStates = createRootScanStates(roots);
  const states: WorkspaceScanState[] = [];
  const matchBudget: WorkspaceMatchBudget = { activeRoot: null, used: 0 };

  for (const state of baseStates) {
    options.signal?.throwIfAborted();
    states.push({
      ...state,
      patterns: await readWorkspacePatterns(state, diagnostics, options.signal),
      matchBudget,
      matchComplete: false,
      signal: options.signal,
    });
  }
  try {
    for (const state of states) {
      options.signal?.throwIfAborted();
      await scanAvailable(state, candidates, diagnostics);
    }
    await redistributeUnusedEntryCapacity(
      states,
      candidates,
      diagnostics,
      scanWorkspaceRootState,
    );
  } catch (error) {
    if (!(error instanceof WorkspaceMatchLimitError)) throw error;
    for (const state of states) {
      if (state.matchComplete) continue;
      diagnostics.push(
        discoveryDiagnostic(
          "workspace-config-invalid",
          state.root,
          state.root.displayName,
          `Workspace matching at ${state.root.displayName} did not complete because the global ${MAX_WORKSPACE_MATCH_WORK}-step limit was reached; results are partial.`,
        ),
      );
    }
  }
  redistributeUnusedCandidateCapacity(states, candidates);
  reportTrueLimits(states, candidates.length, diagnostics);
  options.signal?.throwIfAborted();

  candidates.sort((left, right) =>
    left.canonicalRoot.localeCompare(right.canonicalRoot),
  );
  return {
    candidates: Object.freeze(candidates),
    diagnostics: Object.freeze(diagnostics),
  };
}

async function scanWorkspaceRootState(
  state: RootScanState,
  candidates: SourceCandidate[],
  diagnostics: DiscoveryDiagnostic[],
): Promise<void> {
  await scanAvailable(state as WorkspaceScanState, candidates, diagnostics);
}

async function readWorkspacePatterns(
  state: RootScanState,
  diagnostics: DiscoveryDiagnostic[],
  signal?: AbortSignal,
): Promise<readonly WorkspacePattern[]> {
  signal?.throwIfAborted();
  try {
    const pnpmPatterns = await readPnpmWorkspacePatterns(
      state.canonicalRoot,
      signal,
    );
    signal?.throwIfAborted();
    if (pnpmPatterns !== null) return parseWorkspacePatterns(pnpmPatterns);
    const source = await readBoundedManifest(
      path.join(state.canonicalRoot, "package.json"),
    );
    signal?.throwIfAborted();
    if (source === null) return [];
    const manifest = JSON.parse(source) as unknown;
    if (!isRecord(manifest)) throw new Error();
    const workspaces = manifest.workspaces;
    if (workspaces === undefined) return [];
    const values = Array.isArray(workspaces)
      ? workspaces
      : isRecord(workspaces) && Array.isArray(workspaces.packages)
        ? workspaces.packages
        : null;
    if (!values) throw new Error();
    return parseWorkspacePatterns(values);
  } catch {
    signal?.throwIfAborted();
    diagnostics.push(
      discoveryDiagnostic(
        "workspace-config-invalid",
        state.root,
        state.root.displayName,
        `Workspace configuration at ${state.root.displayName} is invalid; only the project root was inspected.`,
      ),
    );
    return [];
  }
}

async function readPnpmWorkspacePatterns(
  canonicalRoot: string,
  signal?: AbortSignal,
): Promise<readonly string[] | null> {
  signal?.throwIfAborted();
  const workspacePath = path.join(canonicalRoot, "pnpm-workspace.yaml");
  const leaf = await fs.lstat(workspacePath).catch((error: unknown) => {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw new Error();
  });
  signal?.throwIfAborted();
  if (leaf === null) return null;
  if (
    !leaf.isFile() ||
    leaf.isSymbolicLink() ||
    leaf.size > MAX_PNPM_WORKSPACE_BYTES
  )
    throw new Error();
  let handle;
  try {
    handle = await fs.open(
      workspacePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    signal?.throwIfAborted();
  } catch {
    signal?.throwIfAborted();
    throw new Error();
  }
  try {
    const before = await handle.stat();
    signal?.throwIfAborted();
    if (!sameIdentity(leaf, before)) throw new Error();
    const buffer = Buffer.allocUnsafe(MAX_PNPM_WORKSPACE_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const result = await handle.read(
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        bytesRead,
      );
      signal?.throwIfAborted();
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    if (bytesRead > MAX_PNPM_WORKSPACE_BYTES) throw new Error();
    const [after, leafAfter] = await Promise.all([
      handle.stat(),
      fs.lstat(workspacePath).catch(() => null),
    ]);
    signal?.throwIfAborted();
    if (
      leafAfter === null ||
      !sameIdentity(before, after) ||
      !sameIdentity(after, leafAfter) ||
      after.size !== bytesRead
    )
      throw new Error();
    return parsePnpmWorkspacePackages(
      buffer.subarray(0, bytesRead).toString("utf8"),
    );
  } finally {
    await handle.close();
  }
}

function parsePnpmWorkspacePackages(source: string): readonly string[] {
  const document = Bun.YAML.parse(source) as unknown;
  if (
    !isRecord(document) ||
    !Object.hasOwn(document, "packages") ||
    !Array.isArray(document.packages) ||
    document.packages.length === 0 ||
    document.packages.some((value) => typeof value !== "string")
  )
    throw new Error();
  validatePnpmPackagesBlockSyntax(source);
  return document.packages;
}

function validatePnpmPackagesBlockSyntax(source: string): void {
  if (source.includes("\t")) throw new Error();
  validateNoExplicitTopLevelPackagesKey(source);
  let inPackages = false;
  let sawPackages = false;
  let itemIndent: number | null = null;
  let itemCount = 0;
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (isUnsupportedTopLevelKeyReference(line)) throw new Error();
    const packagesKey = topLevelPackagesKey(line);
    if (packagesKey !== null) {
      if (
        !packagesKey.supported ||
        sawPackages ||
        !/^\s*(?:#.*)?$/u.test(packagesKey.remainder)
      )
        throw new Error();
      sawPackages = true;
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (!line.startsWith(" ")) {
      if (line.startsWith("-")) throw new Error();
      inPackages = false;
      continue;
    }
    const item = /^( +)-[ ]+(.+?)\s*$/u.exec(line);
    if (!item || item[2]!.trimStart().startsWith("!")) throw new Error();
    const indentation = item[1]!.length;
    if (itemIndent === null) itemIndent = indentation;
    else if (indentation !== itemIndent) throw new Error();
    itemCount += 1;
  }
  if (!sawPackages || itemCount === 0) throw new Error();
}

function topLevelPackagesKey(
  line: string,
): { readonly remainder: string; readonly supported: boolean } | null {
  if (line.startsWith(" ")) return null;
  const delimiter = topLevelMappingDelimiter(line);
  if (delimiter < 0) return null;
  const keySource = line.slice(0, delimiter);
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(`${keySource}: null`) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Object.hasOwn(parsed, "packages")) return null;
  return {
    remainder: line.slice(delimiter + 1),
    supported:
      /^(?:packages|'(?:[^']|'')*'|"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*")$/u.test(
        keySource,
      ),
  };
}

function topLevelMappingDelimiter(line: string): number {
  let quote: "'" | '"' | null = null;
  let verbatimTag = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (quote === "'") {
      if (character !== "'") continue;
      if (line[index + 1] === "'") index += 1;
      else quote = null;
      continue;
    }
    if (quote === '"') {
      if (character === "\\") index += 1;
      else if (character === '"') quote = null;
      continue;
    }
    if (verbatimTag) {
      if (character === ">") verbatimTag = false;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "!" && line[index + 1] === "<") {
      verbatimTag = true;
      index += 1;
    } else if (
      character === "#" &&
      (index === 0 || /\s/u.test(line[index - 1]!))
    )
      return -1;
    else if (character === ":") return index;
  }
  return -1;
}

function validateNoExplicitTopLevelPackagesKey(source: string): void {
  for (const line of source.split(/\r?\n/u)) {
    if (!line.startsWith(" ") && /^\?(?:\s|$)/u.test(line)) throw new Error();
  }
}

function isUnsupportedTopLevelKeyReference(line: string): boolean {
  if (line.startsWith(" ")) return false;
  const mapping = /^(.+):(.*)$/u.exec(line);
  return mapping !== null && isYamlNodeReference(mapping[1]!);
}

function isYamlNodeReference(source: string): boolean {
  const first = source.trimStart()[0];
  return first === "*" || first === "&";
}

function parseWorkspacePatterns(
  values: readonly unknown[],
): WorkspacePattern[] {
  if (values.length > MAX_WORKSPACE_PATTERN_COUNT) throw new Error();
  return values.map((value) => {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      Buffer.byteLength(value, "utf8") > MAX_WORKSPACE_PATTERN_BYTES ||
      /[\\\u0000-\u001f\u007f]/u.test(value) ||
      value.includes("${")
    )
      throw new Error();
    const negative = value.startsWith("!");
    let pattern = negative ? value.slice(1) : value;
    if (pattern.startsWith("./")) pattern = pattern.slice(2);
    pattern = pattern.replace(/\/$/u, "");
    if (
      pattern.length === 0 ||
      path.posix.isAbsolute(pattern) ||
      /^[A-Za-z]:/u.test(pattern) ||
      pattern === "~" ||
      pattern.startsWith("~/")
    )
      throw new Error();
    const segments = pattern.split("/");
    if (
      segments.length > MAX_WORKSPACE_PATTERN_SEGMENTS ||
      segments.some(
        (segment) =>
          segment.length === 0 ||
          segment === "." ||
          segment === ".." ||
          /[{}()[\]]/u.test(segment) ||
          (segment.includes("**") && segment !== "**"),
      )
    )
      throw new Error();
    return { negative, segments };
  });
}

async function scanAvailable(
  state: WorkspaceScanState,
  candidates: SourceCandidate[],
  diagnostics: DiscoveryDiagnostic[],
): Promise<void> {
  state.matchComplete = false;
  state.signal?.throwIfAborted();
  state.matchBudget.activeRoot = state.root;
  await scanAvailableInner(state, candidates, diagnostics);
  state.matchComplete =
    state.queue.length === 0 && state.continuations.length === 0;
}

async function scanAvailableInner(
  state: WorkspaceScanState,
  candidates: SourceCandidate[],
  diagnostics: DiscoveryDiagnostic[],
): Promise<void> {
  while (true) {
    while (state.queue.length > 0) {
      state.signal?.throwIfAborted();
      const current = state.queue.shift();
      if (!current) break;
      await inspectPendingDirectory(state, current, candidates, diagnostics);
    }
    if (state.budget.visitedEntries >= state.budget.maxVisitedEntries) return;
    state.signal?.throwIfAborted();
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
    state.signal?.throwIfAborted();
    if (entries)
      consumeEntries(state, continuation.current, entries, diagnostics);
  }
}

async function inspectPendingDirectory(
  state: WorkspaceScanState,
  current: PendingDirectory,
  candidates: SourceCandidate[],
  diagnostics: DiscoveryDiagnostic[],
): Promise<void> {
  state.signal?.throwIfAborted();
  const attestation = await attestDirectoryOrReport(
    state,
    current,
    diagnostics,
  );
  state.signal?.throwIfAborted();
  if (!attestation) return;
  const matched =
    current.relative === "" ||
    matches(state.patterns, current.relative, state.matchBudget);
  let packageBoundary = false;
  if (matched) {
    const candidate = await inspectDirectory(
      state.root,
      current,
      diagnostics,
      state.signal,
    );
    state.signal?.throwIfAborted();
    if (candidate) recordCandidate(state, candidate, candidates);
    packageBoundary =
      current.relative !== "" &&
      (await hasPackageManifest(current.directory, state.signal));
  }
  const stable = await attestDirectoryOrReport(
    state,
    current,
    diagnostics,
    attestation,
  );
  state.signal?.throwIfAborted();
  if (
    !stable ||
    (packageBoundary &&
      !couldContainStrictMatch(
        state.patterns,
        current.relative,
        state.matchBudget,
      )) ||
    state.patterns.length === 0
  )
    return;

  if (state.budget.visitedEntries < state.budget.maxVisitedEntries) {
    const entries = await readDirectoryEntries(
      state,
      current,
      diagnostics,
      stable,
    );
    if (entries) consumeEntries(state, current, entries, diagnostics);
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
}

function consumeEntries(
  state: WorkspaceScanState,
  current: PendingDirectory,
  entries: readonly Dirent[],
  diagnostics: DiscoveryDiagnostic[],
): void {
  for (const [index, entry] of entries.entries()) {
    state.signal?.throwIfAborted();
    if (state.budget.visitedEntries >= state.budget.maxVisitedEntries) {
      const retained = entries.slice(index, index + 2_048);
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
    const relative = path.posix.join(
      current.relative.split(path.sep).join("/"),
      entry.name,
    );
    if (
      shouldIgnoreDirectory(entry.name) &&
      !isExplicitlyIncludedIgnoredDirectory(
        state.patterns,
        relative,
        entry.name,
        state.matchBudget,
      )
    )
      continue;
    if (entry.isSymbolicLink()) {
      if (couldContainMatch(state.patterns, relative, state.matchBudget)) {
        const displayPath = displayPathFor(
          state.root,
          relative.split("/").join(path.sep),
        );
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
    if (!entry.isDirectory()) continue;
    if (!couldContainMatch(state.patterns, relative, state.matchBudget))
      continue;
    state.queue.push({
      directory: path.join(current.directory, entry.name),
      relative: relative.split("/").join(path.sep),
      depth: current.depth + 1,
    });
  }
}

async function readDirectoryEntries(
  state: WorkspaceScanState,
  current: PendingDirectory,
  diagnostics: DiscoveryDiagnostic[],
  expected: ScanDirectoryAttestation,
): Promise<Dirent[] | null> {
  state.signal?.throwIfAborted();
  const stableBefore = await attestDirectoryOrReport(
    state,
    current,
    diagnostics,
    expected,
  );
  state.signal?.throwIfAborted();
  if (!stableBefore) return null;
  let entries: Dirent[];
  try {
    await runDiscoveryTestHook({
      point: "before-directory-read",
      path: current.directory,
    });
    state.signal?.throwIfAborted();
    entries = await fs.readdir(current.directory, { withFileTypes: true });
    state.signal?.throwIfAborted();
  } catch {
    state.signal?.throwIfAborted();
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
  state.signal?.throwIfAborted();
  const stableAfter = await attestDirectoryOrReport(
    state,
    current,
    diagnostics,
    stableBefore,
  );
  state.signal?.throwIfAborted();
  if (!stableAfter) return null;
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

async function inspectDirectory(
  root: TrustedRoot,
  current: PendingDirectory,
  diagnostics: DiscoveryDiagnostic[],
  signal?: AbortSignal,
): Promise<SourceCandidate | null> {
  signal?.throwIfAborted();
  try {
    const candidate = await candidateAtRoot(
      root,
      current.directory,
      current.relative,
    );
    signal?.throwIfAborted();
    return candidate;
  } catch (error) {
    signal?.throwIfAborted();
    const displayPath = displayPathFor(root, current.relative);
    diagnostics.push(
      discoveryDiagnostic(
        error instanceof DiscoveryFailure ? error.code : "manifest-invalid",
        root,
        displayPath,
        `Manifest at ${displayPath} is invalid.`,
      ),
    );
    return null;
  }
}

async function hasPackageManifest(
  directory: string,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  const leaf = await fs
    .lstat(path.join(directory, "package.json"))
    .catch(() => null);
  signal?.throwIfAborted();
  return leaf !== null;
}

async function attestDirectoryOrReport(
  state: WorkspaceScanState,
  current: PendingDirectory,
  diagnostics: DiscoveryDiagnostic[],
  expected?: ScanDirectoryAttestation,
): Promise<ScanDirectoryAttestation | null> {
  state.signal?.throwIfAborted();
  try {
    const attestation = await attestScanDirectory(
      current.directory,
      state.canonicalRoot,
      expected,
    );
    state.signal?.throwIfAborted();
    return attestation;
  } catch (error) {
    state.signal?.throwIfAborted();
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

function matches(
  patterns: readonly WorkspacePattern[],
  relative: string,
  budget: WorkspaceMatchBudget,
): boolean {
  const segments = relative.split(path.sep);
  return (
    patterns.some(
      (pattern) =>
        !pattern.negative &&
        matchesSegments(pattern.segments, segments, budget),
    ) &&
    !patterns.some(
      (pattern) =>
        pattern.negative && matchesSegments(pattern.segments, segments, budget),
    )
  );
}

function couldContainMatch(
  patterns: readonly WorkspacePattern[],
  relative: string,
  budget: WorkspaceMatchBudget,
): boolean {
  const segments = relative.split("/");
  if (
    patterns.some(
      (pattern) =>
        pattern.negative &&
        pattern.segments.at(-1) === "**" &&
        matchesSegments(pattern.segments, segments, budget),
    )
  )
    return false;
  return patterns.some(
    (pattern) =>
      !pattern.negative && prefixCanMatch(pattern.segments, segments, budget),
  );
}

function couldContainStrictMatch(
  patterns: readonly WorkspacePattern[],
  relative: string,
  budget: WorkspaceMatchBudget,
): boolean {
  const segments = relative.split(path.sep);
  if (
    patterns.some(
      (pattern) =>
        pattern.negative &&
        pattern.segments.at(-1) === "**" &&
        matchesSegments(pattern.segments, segments, budget),
    )
  )
    return false;
  return patterns.some(
    (pattern) =>
      !pattern.negative &&
      prefixCanMatch(pattern.segments, segments, budget, {
        strictDescendant: true,
      }),
  );
}

function matchesSegments(
  pattern: readonly string[],
  input: readonly string[],
  budget: WorkspaceMatchBudget,
): boolean {
  const seen = new Set<string>();
  const visit = (patternIndex: number, inputIndex: number): boolean => {
    const key = `${patternIndex}:${inputIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    chargeWorkspaceMatchWork(budget, 1);
    if (patternIndex === pattern.length) return inputIndex === input.length;
    const segment = pattern[patternIndex]!;
    if (segment === "**")
      return (
        visit(patternIndex + 1, inputIndex) ||
        (inputIndex < input.length &&
          !input[inputIndex]!.startsWith(".") &&
          visit(patternIndex, inputIndex + 1))
      );
    return (
      inputIndex < input.length &&
      matchesPatternSegment(segment, input[inputIndex]!, budget) &&
      visit(patternIndex + 1, inputIndex + 1)
    );
  };
  return visit(0, 0);
}

function prefixCanMatch(
  pattern: readonly string[],
  input: readonly string[],
  budget: WorkspaceMatchBudget,
  options: { strictDescendant?: boolean } = {},
): boolean {
  let states = new Set([0]);
  for (const inputSegment of input) {
    const next = new Set<number>();
    for (const state of closeGlobstars(pattern, states, budget)) {
      if (pattern[state] === "**" && !inputSegment.startsWith("."))
        next.add(state);
      else if (
        state < pattern.length &&
        matchesPatternSegment(pattern[state]!, inputSegment, budget)
      )
        next.add(state + 1);
    }
    states = next;
    if (states.size === 0) return false;
  }
  const reachable = closeGlobstars(pattern, states, budget);
  return options.strictDescendant
    ? [...reachable].some((state) => state < pattern.length)
    : reachable.size > 0;
}

function closeGlobstars(
  pattern: readonly string[],
  input: ReadonlySet<number>,
  budget: WorkspaceMatchBudget,
): Set<number> {
  const result = new Set(input);
  for (const state of [...result]) {
    let index = state;
    while (true) {
      chargeWorkspaceMatchWork(budget, 1);
      if (pattern[index] !== "**") break;
      index += 1;
      result.add(index);
    }
  }
  return result;
}

function matchesSegment(
  pattern: string,
  input: string,
  budget: WorkspaceMatchBudget,
): boolean {
  const patternCharacters = [...pattern];
  const inputCharacters = [...input];
  chargeWorkspaceMatchWork(
    budget,
    patternCharacters.length * (inputCharacters.length + 1),
  );
  let reachable = new Uint8Array(inputCharacters.length + 1);
  reachable[0] = 1;
  for (const patternCharacter of patternCharacters) {
    const next = new Uint8Array(inputCharacters.length + 1);
    if (patternCharacter === "*") {
      next[0] = reachable[0]!;
      for (let index = 1; index < next.length; index += 1) {
        next[index] =
          reachable[index] ||
          (next[index - 1] && matchesWildcard(inputCharacters[index - 1]!))
            ? 1
            : 0;
      }
    } else {
      for (let index = 1; index < next.length; index += 1) {
        const inputCharacter = inputCharacters[index - 1]!;
        next[index] =
          reachable[index - 1] &&
          (patternCharacter === "?"
            ? matchesWildcard(inputCharacter)
            : patternCharacter === inputCharacter)
            ? 1
            : 0;
      }
    }
    reachable = next;
  }
  return reachable[inputCharacters.length] === 1;
}

function matchesPatternSegment(
  pattern: string,
  input: string,
  budget: WorkspaceMatchBudget,
): boolean {
  return (
    (!input.startsWith(".") || pattern.startsWith(".")) &&
    matchesSegment(pattern, input, budget)
  );
}

function chargeWorkspaceMatchWork(
  budget: WorkspaceMatchBudget,
  cost: number,
): void {
  if (budget.used + cost > MAX_WORKSPACE_MATCH_WORK) {
    if (!budget.activeRoot) throw new Error("workspace match root unavailable");
    throw new WorkspaceMatchLimitError(budget.activeRoot);
  }
  budget.used += cost;
}

function matchesWildcard(character: string): boolean {
  return (
    character !== "\n" &&
    character !== "\r" &&
    character !== "\u2028" &&
    character !== "\u2029"
  );
}

function shouldIgnoreDirectory(name: string): boolean {
  return (
    name.startsWith(".") ||
    ["node_modules", "dist", "cache", "caches"].includes(name)
  );
}

function isExplicitlyIncludedIgnoredDirectory(
  patterns: readonly WorkspacePattern[],
  relative: string,
  name: string,
  budget: WorkspaceMatchBudget,
): boolean {
  if (name === "node_modules") return false;
  const segments = relative.split("/");
  return patterns.some(
    (pattern) =>
      !pattern.negative &&
      pattern.segments.some(
        (segment, index) =>
          segment !== "**" &&
          matchesPatternSegment(segment, name, budget) &&
          matchesSegments(
            pattern.segments.slice(0, index + 1),
            segments,
            budget,
          ),
      ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameIdentity(
  left: { dev: number; ino: number },
  right: { dev: number; ino: number },
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
