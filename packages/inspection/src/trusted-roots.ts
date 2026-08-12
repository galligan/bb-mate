import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  DiscoveryDiagnostic,
  DiscoveryOperationOptions,
  TrustedRoot,
  TrustedRootAdmission,
  TrustedRootAlias,
  TrustedRootInput,
} from "./discovery-types.ts";
import { TRUSTED_ROOT_KINDS } from "./discovery-types.ts";
import { runDiscoveryTestHook } from "./discovery-test-hook.ts";

interface TrustedRootDetails {
  readonly canonicalRoot: string;
}

const admittedRoots = new WeakMap<object, TrustedRootDetails>();
const MAX_TRUSTED_ROOTS = 128;
const MAX_DISPLAY_NAME_CHARACTERS = 255;

export async function admitTrustedRoots(
  inputs: readonly TrustedRootInput[],
  options: DiscoveryOperationOptions = {},
): Promise<TrustedRootAdmission> {
  options.signal?.throwIfAborted();
  const roots: TrustedRoot[] = [];
  const aliases: TrustedRootAlias[] = [];
  const diagnostics: DiscoveryDiagnostic[] = [];
  const canonicalRoots = new Map<string, string>();
  const rootKeys = new Set<string>();

  for (const input of inputs) {
    options.signal?.throwIfAborted();
    const displayPath = redactedBasename(input.path);
    if (!/^[A-Za-z0-9_-]{32}$/u.test(input.rootKey)) {
      diagnostics.push({
        code: "root-key-invalid",
        rootKey: null,
        displayPath,
        detail: `Configured root ${displayPath} has an invalid opaque key.`,
      });
      continue;
    }
    if (!(TRUSTED_ROOT_KINDS as readonly string[]).includes(input.kind)) {
      diagnostics.push({
        code: "root-kind-invalid",
        rootKey: input.rootKey,
        displayPath,
        detail: `Configured root ${displayPath} has an invalid source kind.`,
      });
      continue;
    }
    const displayName = input.displayName?.trim() ?? displayPath;
    if (!isValidDisplayName(displayName)) {
      diagnostics.push({
        code: "root-display-invalid",
        rootKey: input.rootKey,
        displayPath,
        detail: `Configured root ${displayPath} has an invalid display label.`,
      });
      continue;
    }
    const configuredStat = await fs.lstat(input.path).catch(() => null);
    options.signal?.throwIfAborted();
    if (!configuredStat) {
      diagnostics.push({
        code: "root-missing",
        rootKey: input.rootKey,
        displayPath,
        detail: `Configured root ${displayPath} does not exist.`,
      });
      continue;
    }
    if (configuredStat?.isSymbolicLink()) {
      diagnostics.push({
        code: "root-symlink",
        rootKey: input.rootKey,
        displayPath,
        detail: `Configured root ${displayPath} is a symlink.`,
      });
      continue;
    }
    if (!configuredStat.isDirectory()) {
      diagnostics.push({
        code: "root-not-directory",
        rootKey: input.rootKey,
        displayPath,
        detail: `Configured root ${displayPath} is not a directory.`,
      });
      continue;
    }
    await runDiscoveryTestHook({ point: "after-root-lstat", path: input.path });
    options.signal?.throwIfAborted();
    const canonicalRoot = await fs.realpath(input.path).catch(() => null);
    options.signal?.throwIfAborted();
    const resolvedStat = await fs.lstat(input.path).catch(() => null);
    options.signal?.throwIfAborted();
    const canonicalRootAfter = await fs.realpath(input.path).catch(() => null);
    options.signal?.throwIfAborted();
    if (
      canonicalRoot === null ||
      canonicalRootAfter !== canonicalRoot ||
      !sameIdentity(configuredStat, resolvedStat) ||
      !resolvedStat?.isDirectory() ||
      resolvedStat.isSymbolicLink()
    ) {
      diagnostics.push({
        code: "root-changed",
        rootKey: input.rootKey,
        displayPath,
        detail: `Configured root ${displayPath} changed while it was admitted.`,
      });
      continue;
    }
    const canonicalHome = await fs.realpath(os.homedir()).catch(() => null);
    options.signal?.throwIfAborted();
    if (isForbiddenCanonicalRoot(canonicalRoot, canonicalHome)) {
      diagnostics.push({
        code: "root-forbidden",
        rootKey: input.rootKey,
        displayPath,
        detail: `Configured root ${displayPath} is outside the bounded source policy.`,
      });
      continue;
    }
    if (rootKeys.has(input.rootKey)) {
      diagnostics.push({
        code: "root-key-duplicate",
        rootKey: input.rootKey,
        displayPath,
        detail: `Configured root ${displayPath} reuses an admitted root key.`,
      });
      continue;
    }
    const admittedRootKey = canonicalRoots.get(canonicalRoot);
    if (admittedRootKey) {
      rootKeys.add(input.rootKey);
      aliases.push(Object.freeze({ rootKey: input.rootKey, admittedRootKey }));
      continue;
    }
    if (roots.length >= MAX_TRUSTED_ROOTS) {
      diagnostics.push({
        code: "root-limit",
        rootKey: input.rootKey,
        displayPath,
        detail: `Configured root ${displayPath} exceeds the ${MAX_TRUSTED_ROOTS}-root limit.`,
      });
      continue;
    }
    canonicalRoots.set(canonicalRoot, input.rootKey);
    rootKeys.add(input.rootKey);
    const root = {
      rootKey: input.rootKey,
      kind: input.kind,
      displayName,
    };
    Object.defineProperty(root, "toJSON", {
      enumerable: false,
      value: () => {
        throw new TypeError("trusted roots are server-private");
      },
    });
    Object.freeze(root);
    admittedRoots.set(root, { canonicalRoot });
    roots.push(root);
  }

  return {
    roots: Object.freeze(roots),
    aliases: Object.freeze(aliases),
    diagnostics: Object.freeze(diagnostics),
  };
}

/**
 * This structural deny policy also excludes bb's ordinary managed data roots,
 * which live below hidden directories. An exact non-hidden installed-root deny
 * set needs the native inventory owned by slice 57B; native inventory must not
 * seed roots in this source-only slice.
 */
function isForbiddenCanonicalRoot(
  canonicalRoot: string,
  canonicalHome: string | null,
): boolean {
  const filesystemRoot = path.parse(canonicalRoot).root;
  if (canonicalRoot === filesystemRoot) return true;
  if (
    canonicalHome !== null &&
    (canonicalRoot === canonicalHome ||
      isStrictDescendant(canonicalHome, canonicalRoot))
  ) {
    return true;
  }
  const components = path
    .relative(filesystemRoot, canonicalRoot)
    .split(path.sep)
    .filter(Boolean);
  return components.some((component) => {
    const normalized = component.toLowerCase();
    return (
      component.startsWith(".") ||
      ["node_modules", "dist", "cache", "caches"].includes(normalized)
    );
  });
}

function isStrictDescendant(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".."
  );
}

function sameIdentity(
  left: { dev: number; ino: number },
  right: { dev: number; ino: number } | null,
): boolean {
  return right !== null && left.dev === right.dev && left.ino === right.ino;
}

function redactedBasename(inputPath: string): string {
  const basename = path.basename(inputPath) || "root";
  return basename.replace(/[\u0000-\u001f\u007f]/gu, "?").slice(0, 255);
}

function isValidDisplayName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_DISPLAY_NAME_CHARACTERS &&
    value !== "." &&
    value !== ".." &&
    !/[\\/\u0000-\u001f\u007f]/u.test(value)
  );
}

export function trustedRootDetails(root: TrustedRoot): TrustedRootDetails {
  const details = admittedRoots.get(root);
  if (!details)
    throw new TypeError("trusted root was not admitted by the server");
  return details;
}

export function trustedRootCanonicalRoot(root: TrustedRoot): string {
  return trustedRootDetails(root).canonicalRoot;
}
