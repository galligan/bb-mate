import { promises as fs } from "node:fs";
import type { Stats } from "node:fs";
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
  const stat = await fs.lstat(directory).catch(() => null);
  if (!stat) {
    throw new DiscoveryFailure(
      "scan-directory-changed",
      "source directory is no longer available",
    );
  }
  if (stat.isSymbolicLink()) {
    throw new DiscoveryFailure(
      "scan-directory-symlink",
      "source directory became a symlink",
    );
  }
  if (!stat.isDirectory()) {
    throw new DiscoveryFailure(
      "scan-directory-changed",
      "source directory changed filesystem type",
    );
  }

  const canonicalPath = await fs.realpath(directory).catch(() => null);
  if (canonicalPath === null) {
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
    (expected.dev !== stat.dev ||
      expected.ino !== stat.ino ||
      expected.canonicalPath !== canonicalPath)
  ) {
    throw new DiscoveryFailure(
      "scan-directory-changed",
      "source directory identity changed during discovery",
    );
  }
  return { dev: stat.dev, ino: stat.ino, canonicalPath };
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
  let finalStat: Stats | null = null;
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
    finalStat = stat;
  }

  if (
    finalStat === null ||
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
