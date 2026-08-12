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

interface WorkspacePattern {
  readonly negative: boolean;
  readonly segments: readonly string[];
}

interface WorkspaceScanState extends RootScanState {
  readonly patterns: readonly WorkspacePattern[];
  readonly signal?: AbortSignal;
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

  for (const state of baseStates) {
    options.signal?.throwIfAborted();
    states.push({
      ...state,
      patterns: await readWorkspacePatterns(state, diagnostics, options.signal),
      signal: options.signal,
    });
  }
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
  if (source.includes("\t")) throw new Error();
  const values: string[] = [];
  let inPackages = false;
  let sawPackages = false;
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!inPackages) {
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      if (/^packages:\s*(?:#.*)?$/u.test(line)) {
        if (sawPackages) throw new Error();
        sawPackages = true;
        inPackages = true;
      }
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (!line.startsWith(" ")) {
      if (line.startsWith("-")) throw new Error();
      inPackages = false;
      continue;
    }
    const item = /^ +-[ ]+(.+?)\s*$/u.exec(line);
    if (!item) throw new Error();
    values.push(parseYamlPatternScalar(item[1]!));
  }
  if (!sawPackages) throw new Error();
  return values;
}

function parseYamlPatternScalar(input: string): string {
  const value = input.trim();
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) throw new Error();
    return value.slice(1, -1).replace(/''/gu, "'");
  }
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed !== "string") throw new Error();
      return parsed;
    } catch {
      throw new Error();
    }
  }
  const withoutComment = value.replace(/\s+#.*$/u, "").trimEnd();
  if (
    withoutComment === "" ||
    isYamlCoreNonStringScalar(withoutComment) ||
    /:(?:$|\s)/u.test(withoutComment) ||
    /^(?:-|\?)(?:$|\s)/u.test(withoutComment) ||
    /^[\[\]{|>&*]/u.test(withoutComment) ||
    /^!/u.test(withoutComment)
  )
    throw new Error();
  return withoutComment;
}

function isYamlCoreNonStringScalar(value: string): boolean {
  return (
    /^(?:~|null|true|false)$/iu.test(value) ||
    /^[-+]?(?:0o[0-7]+|0x[\da-f]+|\d+)$/iu.test(value) ||
    /^[-+]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?|\.inf|\.nan)$/iu.test(value)
  );
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
  state.signal?.throwIfAborted();
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
    current.relative === "" || matches(state.patterns, current.relative);
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
      !couldContainStrictMatch(state.patterns, current.relative)) ||
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
      )
    )
      continue;
    if (entry.isSymbolicLink()) {
      if (couldContainMatch(state.patterns, relative)) {
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
    if (!couldContainMatch(state.patterns, relative)) continue;
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
): boolean {
  const segments = relative.split(path.sep);
  return (
    patterns.some(
      (pattern) =>
        !pattern.negative && matchesSegments(pattern.segments, segments),
    ) &&
    !patterns.some(
      (pattern) =>
        pattern.negative && matchesSegments(pattern.segments, segments),
    )
  );
}

function couldContainMatch(
  patterns: readonly WorkspacePattern[],
  relative: string,
): boolean {
  const segments = relative.split("/");
  if (
    patterns.some(
      (pattern) =>
        pattern.negative &&
        pattern.segments.at(-1) === "**" &&
        matchesSegments(pattern.segments, segments),
    )
  )
    return false;
  return patterns.some(
    (pattern) =>
      !pattern.negative && prefixCanMatch(pattern.segments, segments),
  );
}

function couldContainStrictMatch(
  patterns: readonly WorkspacePattern[],
  relative: string,
): boolean {
  const segments = relative.split(path.sep);
  if (
    patterns.some(
      (pattern) =>
        pattern.negative &&
        pattern.segments.at(-1) === "**" &&
        matchesSegments(pattern.segments, segments),
    )
  )
    return false;
  return patterns.some(
    (pattern) =>
      !pattern.negative &&
      prefixCanMatch(pattern.segments, segments, { strictDescendant: true }),
  );
}

function matchesSegments(
  pattern: readonly string[],
  input: readonly string[],
): boolean {
  const seen = new Set<string>();
  const visit = (patternIndex: number, inputIndex: number): boolean => {
    const key = `${patternIndex}:${inputIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (patternIndex === pattern.length) return inputIndex === input.length;
    const segment = pattern[patternIndex]!;
    if (segment === "**")
      return (
        visit(patternIndex + 1, inputIndex) ||
        (inputIndex < input.length && visit(patternIndex, inputIndex + 1))
      );
    return (
      inputIndex < input.length &&
      matchesSegment(segment, input[inputIndex]!) &&
      visit(patternIndex + 1, inputIndex + 1)
    );
  };
  return visit(0, 0);
}

function prefixCanMatch(
  pattern: readonly string[],
  input: readonly string[],
  options: { strictDescendant?: boolean } = {},
): boolean {
  let states = new Set([0]);
  for (const inputSegment of input) {
    const next = new Set<number>();
    for (const state of closeGlobstars(pattern, states)) {
      if (pattern[state] === "**") next.add(state);
      else if (
        state < pattern.length &&
        matchesSegment(pattern[state]!, inputSegment)
      )
        next.add(state + 1);
    }
    states = next;
    if (states.size === 0) return false;
  }
  const reachable = closeGlobstars(pattern, states);
  return options.strictDescendant
    ? [...reachable].some((state) => state < pattern.length)
    : reachable.size > 0;
}

function closeGlobstars(
  pattern: readonly string[],
  input: ReadonlySet<number>,
): Set<number> {
  const result = new Set(input);
  for (const state of [...result]) {
    let index = state;
    while (pattern[index] === "**") {
      index += 1;
      result.add(index);
    }
  }
  return result;
}

function matchesSegment(pattern: string, input: string): boolean {
  let expression = "^";
  for (const character of pattern) {
    if (character === "*") expression += ".*";
    else if (character === "?") expression += ".";
    else expression += character.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
  }
  return new RegExp(`${expression}$`, "u").test(input);
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
): boolean {
  if (name === "node_modules") return false;
  const segments = relative.split("/");
  return patterns.some(
    (pattern) =>
      !pattern.negative &&
      pattern.segments.some(
        (segment, index) =>
          segment !== "**" &&
          matchesSegment(segment, name) &&
          matchesSegments(pattern.segments.slice(0, index + 1), segments),
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
