import { createHash } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import * as path from "node:path";

const MAX_MANIFEST_BYTES = 256 * 1024;

export interface DevelopmentSourceIdentity {
  readonly canonicalRoot: string;
  readonly device: number;
  readonly inode: number;
  readonly manifest: {
    readonly device: number;
    readonly inode: number;
    readonly sha256: string;
  };
}

export async function inspectDevelopmentSourceIdentity(
  canonicalRoot: string,
): Promise<DevelopmentSourceIdentity> {
  const before = await inspectDirectory(canonicalRoot);
  const manifest = await inspectManifest(
    path.join(canonicalRoot, "package.json"),
  );
  const after = await inspectDirectory(canonicalRoot);
  if (!sameIdentity(before, after)) throw new TypeError("source changed");
  return { ...after, manifest };
}

export function sameDevelopmentSourceIdentity(
  left: DevelopmentSourceIdentity,
  right: DevelopmentSourceIdentity,
): boolean {
  return (
    sameIdentity(left, right) &&
    left.manifest.device === right.manifest.device &&
    left.manifest.inode === right.manifest.inode &&
    left.manifest.sha256 === right.manifest.sha256
  );
}

async function inspectDirectory(canonicalRoot: string) {
  const before = await fs.lstat(canonicalRoot);
  const resolved = await fs.realpath(canonicalRoot);
  const after = await fs.lstat(canonicalRoot);
  if (
    before.isSymbolicLink() ||
    !before.isDirectory() ||
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    resolved !== canonicalRoot ||
    !sameIdentity(before, after)
  ) {
    throw new TypeError("invalid source directory");
  }
  return {
    canonicalRoot,
    device: after.dev,
    inode: after.ino,
  };
}

async function inspectManifest(packagePath: string) {
  const leaf = await fs.lstat(packagePath);
  if (
    leaf.isSymbolicLink() ||
    !leaf.isFile() ||
    leaf.size > MAX_MANIFEST_BYTES
  ) {
    throw new TypeError("invalid source manifest");
  }
  const handle = await fs.open(
    packagePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const before = await handle.stat();
    if (!sameIdentity(leaf, before)) throw new TypeError("source changed");
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
      throw new TypeError("source manifest is too large");
    }
    const [after, leafAfter] = await Promise.all([
      handle.stat(),
      fs.lstat(packagePath),
    ]);
    if (
      !sameIdentity(before, after) ||
      !sameIdentity(after, leafAfter) ||
      after.size !== bytesRead
    ) {
      throw new TypeError("source changed");
    }
    return {
      device: after.dev,
      inode: after.ino,
      sha256: createHash("sha256")
        .update(buffer.subarray(0, bytesRead))
        .digest("hex"),
    };
  } finally {
    await handle.close();
  }
}

function sameIdentity(
  left: { dev?: number; ino?: number; device?: number; inode?: number },
  right: { dev?: number; ino?: number; device?: number; inode?: number },
): boolean {
  return (
    (left.dev ?? left.device) === (right.dev ?? right.device) &&
    (left.ino ?? left.inode) === (right.ino ?? right.inode)
  );
}
