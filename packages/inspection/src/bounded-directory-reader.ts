import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";

/** Maximum entries retained from one directory before scanning moves on. */
export const MAX_DIRECTORY_ENTRIES = 2_048;
/** Maximum UTF-8 filename bytes retained from one directory. */
export const MAX_DIRECTORY_NAME_BYTES = 128 * 1_024;
/** Maximum deterministic read/sort work units charged to one directory. */
export const MAX_DIRECTORY_WORK = 16_384;

export interface BoundedDirectoryRead {
  readonly entries: readonly Dirent[];
  readonly limited: boolean;
  readonly entryCount: number;
  readonly nameBytes: number;
  readonly work: number;
}

export interface DirectoryEntryBudget {
  readonly maxEntries?: number;
  readonly maxNameBytes?: number;
  readonly maxWork?: number;
  readonly open?: (directory: string) => Promise<DirectoryHandle>;
}

export interface DirectoryHandle {
  read(): Promise<Dirent | null>;
  close(): void | Promise<void>;
}

/**
 * Streams directory entries through a bounded libuv buffer. The retained
 * prefix is charged before it is sorted, so neither materialization nor sort
 * can grow with the size of a hostile directory.
 */
export async function readBoundedDirectoryEntries(
  directory: string,
  signal?: AbortSignal,
  budget: DirectoryEntryBudget = {},
): Promise<BoundedDirectoryRead> {
  signal?.throwIfAborted();
  const handle = budget.open
    ? await budget.open(directory)
    : await fs.opendir(directory, { bufferSize: 32 });
  const entries: Dirent[] = [];
  let nameBytes = 0;
  let work = 0;
  let limited = false;

  try {
    while (true) {
      signal?.throwIfAborted();
      const entry = await handle.read();
      signal?.throwIfAborted();
      if (entry === null) break;
      const nextBytes = Buffer.byteLength(entry.name, "utf8");
      const nextWork = 1 + Math.ceil(Math.log2(entries.length + 2));
      if (
        entries.length >= (budget.maxEntries ?? MAX_DIRECTORY_ENTRIES) ||
        nameBytes + nextBytes >
          (budget.maxNameBytes ?? MAX_DIRECTORY_NAME_BYTES) ||
        work + nextWork > (budget.maxWork ?? MAX_DIRECTORY_WORK)
      ) {
        limited = true;
        break;
      }
      entries.push(entry);
      nameBytes += nextBytes;
      work += nextWork;
    }
  } finally {
    await Promise.resolve(handle.close()).catch((error: unknown) => {
      if (!hasErrorCode(error, "ERR_DIR_CLOSED")) throw error;
    });
  }

  signal?.throwIfAborted();
  const entryCount = entries.length;
  if (limited) return { entries: [], limited, entryCount, nameBytes, work };
  entries.sort((left, right) => left.name.localeCompare(right.name));
  return { entries, limited, entryCount, nameBytes, work };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
