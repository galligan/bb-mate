import { constants, promises as fs } from "node:fs";
import { DiscoveryFailure } from "./discovery-errors.ts";

const MAX_PLUGIN_ICON_BYTES = 256 * 1024;

/** Read a plugin-owned icon without following or racing its filesystem leaf. */
export async function readBoundedPluginIcon(
  iconPath: string,
): Promise<Uint8Array> {
  const leaf = await fs.lstat(iconPath).catch(() => null);
  if (!leaf || !leaf.isFile()) {
    throw new DiscoveryFailure(
      "manifest-path-invalid",
      "plugin-owned icon must be a regular file",
    );
  }
  if (leaf.isSymbolicLink()) {
    throw new DiscoveryFailure(
      "manifest-path-symlink",
      "plugin-owned icon must not be a symlink",
    );
  }
  if (leaf.size > MAX_PLUGIN_ICON_BYTES) throw tooLarge();

  let handle;
  try {
    handle = await fs.open(iconPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new DiscoveryFailure(
      "manifest-path-invalid",
      "plugin-owned icon is unreadable",
    );
  }
  try {
    const before = await handle.stat();
    if (!sameIdentity(leaf, before)) throw changed();
    const buffer = Buffer.allocUnsafe(MAX_PLUGIN_ICON_BYTES + 1);
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
    if (bytesRead > MAX_PLUGIN_ICON_BYTES) throw tooLarge();
    const [after, leafAfter] = await Promise.all([
      handle.stat(),
      fs.lstat(iconPath).catch(() => null),
    ]);
    if (
      !sameIdentity(before, after) ||
      leafAfter === null ||
      !sameIdentity(after, leafAfter) ||
      after.size !== bytesRead
    ) {
      throw changed();
    }
    return buffer.subarray(0, bytesRead);
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

function tooLarge(): DiscoveryFailure {
  return new DiscoveryFailure(
    "manifest-invalid",
    `plugin-owned icon exceeds ${MAX_PLUGIN_ICON_BYTES} bytes`,
  );
}

function changed(): DiscoveryFailure {
  return new DiscoveryFailure(
    "manifest-path-changed",
    "plugin-owned icon changed while it was read",
  );
}
