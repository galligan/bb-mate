import { constants, promises as fs } from "node:fs";
import { DiscoveryFailure } from "./discovery-errors.ts";

const MAX_MANIFEST_BYTES = 256 * 1024;

export async function readBoundedManifest(
  packagePath: string,
): Promise<string | null> {
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
    const bytes = await handle.readFile();
    if (bytes.byteLength > MAX_MANIFEST_BYTES) {
      throw new DiscoveryFailure(
        "manifest-too-large",
        `package.json exceeds ${MAX_MANIFEST_BYTES} bytes`,
      );
    }
    const [after, leafAfter] = await Promise.all([
      handle.stat(),
      fs.lstat(packagePath).catch(() => null),
    ]);
    if (
      !sameIdentity(before, after) ||
      leafAfter === null ||
      !sameIdentity(after, leafAfter) ||
      after.size !== bytes.byteLength
    ) {
      throw new DiscoveryFailure(
        "manifest-changed",
        "package.json changed while it was read",
      );
    }
    return bytes.toString("utf8");
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
