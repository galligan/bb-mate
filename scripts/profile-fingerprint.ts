import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_MAX_ENTRIES = 100_000;
const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;

export async function fingerprintProfileRoots(
  roots: readonly string[],
  bounds: { readonly maxEntries?: number; readonly maxBytes?: number } = {},
): Promise<string> {
  const hash = createHash("sha256");
  const maximumEntries = bounds.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maximumBytes = bounds.maxBytes ?? DEFAULT_MAX_BYTES;
  let entries = 0;
  let bytes = 0;

  const visit = async (absolute: string, relative: string): Promise<void> => {
    const stat = await fs.lstat(absolute).catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return null;
      throw error;
    });
    hash.update(`${relative}\0${stat ? stat.mode & 0o170777 : "absent"}\0`);
    if (!stat) return;
    entries += 1;
    if (entries > maximumEntries)
      throw new Error("Normal profile exceeds the fingerprint entry bound.");
    if (stat.isSymbolicLink()) {
      hash.update(await fs.readlink(absolute));
      return;
    }
    if (stat.isDirectory()) {
      const names = (await fs.readdir(absolute)).sort();
      for (const name of names)
        await visit(path.join(absolute, name), `${relative}/${name}`);
      return;
    }
    if (!stat.isFile())
      throw new Error(
        "Normal profile contains an unsupported filesystem entry.",
      );
    bytes += stat.size;
    if (bytes > maximumBytes)
      throw new Error("Normal profile exceeds the fingerprint byte bound.");
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(absolute);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.once("error", reject);
      stream.once("end", resolve);
    });
  };

  for (const [index, root] of [
    ...new Set(roots.map((root) => path.resolve(root))),
  ]
    .sort()
    .entries()) {
    await visit(root, `profile-${index}`);
  }
  return hash.digest("hex");
}
