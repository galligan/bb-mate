import { promises as fs } from "node:fs";
import path from "node:path";
import type { TrustedRoot } from "./discovery-types.ts";
import { DiscoveryFailure } from "./discovery-errors.ts";

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

export interface ScanDirectoryAttestation extends FileIdentity {
  readonly canonicalPath: string;
}

export async function attestScanDirectory(
  directory: string,
  trustedCanonicalRoot: string,
  expected?: ScanDirectoryAttestation,
): Promise<ScanDirectoryAttestation> {
  const before = await fs.lstat(directory).catch(() => null);
  if (!before) {
    throw new DiscoveryFailure(
      "scan-directory-changed",
      "source directory is no longer available",
    );
  }
  if (before.isSymbolicLink()) {
    throw new DiscoveryFailure(
      "scan-directory-symlink",
      "source directory became a symlink",
    );
  }
  if (!before.isDirectory()) {
    throw new DiscoveryFailure(
      "scan-directory-changed",
      "source directory changed filesystem type",
    );
  }

  const canonicalPath = await fs.realpath(directory).catch(() => null);
  const after = await fs.lstat(directory).catch(() => null);
  const canonicalPathAfter = await fs.realpath(directory).catch(() => null);
  if (
    canonicalPath === null ||
    canonicalPathAfter !== canonicalPath ||
    !after ||
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    before.dev !== after.dev ||
    before.ino !== after.ino
  ) {
    throw new DiscoveryFailure(
      "scan-directory-changed",
      "source directory changed while it was validated",
    );
  }
  if (!isContained(trustedCanonicalRoot, canonicalPath)) {
    throw new DiscoveryFailure(
      "scan-directory-escape",
      "source directory escapes the admitted root",
    );
  }
  if (
    expected &&
    (expected.dev !== after.dev ||
      expected.ino !== after.ino ||
      expected.canonicalPath !== canonicalPath)
  ) {
    throw new DiscoveryFailure(
      "scan-directory-changed",
      "source directory identity changed during discovery",
    );
  }
  return { dev: after.dev, ino: after.ino, canonicalPath };
}

export async function validateDeclaredPath(
  candidateRoot: string,
  declaredPath: string,
  label: string,
  expected: "file" | "directory",
): Promise<void> {
  if (
    path.posix.isAbsolute(declaredPath) ||
    path.win32.isAbsolute(declaredPath)
  ) {
    throw new DiscoveryFailure(
      "manifest-path-invalid",
      `${label} must be relative`,
    );
  }
  const segments = declaredPath.split(/[\\/]/u);
  if (segments.includes("..")) {
    throw new DiscoveryFailure(
      "manifest-path-invalid",
      `${label} must not contain traversal`,
    );
  }
  const usableSegments = segments.filter(
    (segment) => segment.length > 0 && segment !== ".",
  );
  if (usableSegments.length === 0) {
    throw new DiscoveryFailure(
      "manifest-path-invalid",
      `${label} must name a descendant`,
    );
  }

  let current = candidateRoot;
  const identities: Array<{ path: string; identity: FileIdentity }> = [];
  for (const segment of usableSegments) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch(() => null);
    if (!stat) {
      throw new DiscoveryFailure(
        "manifest-path-invalid",
        `${label} points at a missing descendant`,
      );
    }
    if (stat.isSymbolicLink()) {
      throw new DiscoveryFailure(
        "manifest-path-symlink",
        `${label} contains a symlink`,
      );
    }
    identities.push({ path: current, identity: stat });
  }

  const finalStat = await fs.lstat(current);
  if (
    (expected === "file" && !finalStat.isFile()) ||
    (expected === "directory" && !finalStat.isDirectory())
  ) {
    throw new DiscoveryFailure(
      "manifest-path-invalid",
      `${label} has the wrong filesystem type`,
    );
  }
  const canonicalDescendant = await fs.realpath(current);
  if (!isContained(candidateRoot, canonicalDescendant)) {
    throw new DiscoveryFailure(
      "manifest-path-invalid",
      `${label} escapes the candidate root`,
    );
  }
  for (const entry of identities) {
    const after = await fs.lstat(entry.path).catch(() => null);
    if (
      !after ||
      after.isSymbolicLink() ||
      after.dev !== entry.identity.dev ||
      after.ino !== entry.identity.ino
    ) {
      throw new DiscoveryFailure(
        "manifest-path-changed",
        `${label} changed while it was validated`,
      );
    }
  }
}

export function displayPathFor(
  root: TrustedRoot,
  relativeRoot: string,
): string {
  const relative = relativeRoot
    .split(path.sep)
    .map((segment) => segment.replace(/[\u0000-\u001f\u007f]/gu, "?"))
    .join("/");
  return (
    relative ? `${root.displayName}/${relative}` : root.displayName
  ).slice(0, 256);
}

export function isContained(root: string, descendant: string): boolean {
  return descendant === root || descendant.startsWith(`${root}${path.sep}`);
}
