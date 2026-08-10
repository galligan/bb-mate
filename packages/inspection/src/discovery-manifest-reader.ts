import { constants, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { DiscoveryFailure } from "./discovery-errors.ts";
import { runDiscoveryTestHook } from "./discovery-test-hook.ts";

const MAX_MANIFEST_BYTES = 256 * 1024;

export interface BoundedManifestSnapshot {
  readonly source: string;
  readonly device: number;
  readonly inode: number;
  readonly sha256: string;
}

export async function readBoundedManifest(
  packagePath: string,
): Promise<string | null> {
  return (await readBoundedManifestSnapshot(packagePath))?.source ?? null;
}

export async function readBoundedManifestSnapshot(
  packagePath: string,
): Promise<BoundedManifestSnapshot | null> {
  const leaf = await fs.lstat(packagePath).catch((error: unknown) => {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw new DiscoveryFailure("manifest-unreadable", "manifest is unreadable");
  });
  if (leaf === null) return null;
  if (leaf.isSymbolicLink()) {
    throw new DiscoveryFailure(
      "manifest-symlink",
      "package.json must not be a symlink",
    );
  }
  if (!leaf.isFile()) {
    throw new DiscoveryFailure(
      "manifest-not-file",
      "package.json must be a regular file",
    );
  }
  if (leaf.size > MAX_MANIFEST_BYTES) {
    throw new DiscoveryFailure(
      "manifest-too-large",
      `package.json exceeds ${MAX_MANIFEST_BYTES} bytes`,
    );
  }

  let handle;
  try {
    handle = await fs.open(
      packagePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch {
    throw new DiscoveryFailure("manifest-unreadable", "manifest is unreadable");
  }
  try {
    const before = await handle.stat();
    if (!sameIdentity(leaf, before)) {
      throw new DiscoveryFailure(
        "manifest-changed",
        "package.json changed before it could be read",
      );
    }
    await runDiscoveryTestHook({
      point: "after-manifest-stat",
      path: packagePath,
    });
    const buffer = Buffer.allocUnsafe(MAX_MANIFEST_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.byteLength) {
      const result = await handle.read(
        buffer,
        bytesRead,
        buffer.byteLength - bytesRead,
        bytesRead,
      );
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    if (bytesRead > MAX_MANIFEST_BYTES) {
      throw new DiscoveryFailure(
        "manifest-too-large",
        `package.json exceeds ${MAX_MANIFEST_BYTES} bytes`,
      );
    }
    const bytes = buffer.subarray(0, bytesRead);
    const [after, leafAfter] = await Promise.all([
      handle.stat(),
      fs.lstat(packagePath).catch(() => null),
    ]);
    if (
      !sameIdentity(before, after) ||
      leafAfter === null ||
      !sameIdentity(after, leafAfter) ||
      after.size !== bytesRead
    ) {
      throw new DiscoveryFailure(
        "manifest-changed",
        "package.json changed while it was read",
      );
    }
    return {
      source: bytes.toString("utf8"),
      device: after.dev,
      inode: after.ino,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally {
    await handle.close();
  }
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
    (error as { code?: unknown }).code === code
  );
}
