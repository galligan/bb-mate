import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MAX_DIRECTORY_ENTRIES,
  MAX_DIRECTORY_NAME_BYTES,
  MAX_DIRECTORY_WORK,
  readBoundedDirectoryEntries,
  type DirectoryHandle,
} from "./bounded-directory-reader.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("bounded directory reader", () => {
  test("returns the same safe result when an overflowing directory arrives in different orders", async () => {
    const ascending = fakeHandle(["a", "b", "c"]);
    const descending = fakeHandle(["c", "b", "a"]);

    const first = await readBoundedDirectoryEntries("unused", undefined, {
      maxEntries: 2,
      open: async () => ascending.handle,
    });
    const second = await readBoundedDirectoryEntries("unused", undefined, {
      maxEntries: 2,
      open: async () => descending.handle,
    });

    expect(first).toMatchObject({ limited: true, entries: [] });
    expect(second).toMatchObject({ limited: true, entries: [] });
    expect(ascending.closed).toBe(1);
    expect(descending.closed).toBe(1);
  });

  test("charges entries, filename bytes, and deterministic work before sorting", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-bounded-directory-"),
    );
    temporaryRoots.push(root);
    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        fs.writeFile(
          path.join(root, `entry-${String(index).padStart(2, "0")}`),
          "",
        ),
      ),
    );

    const byEntries = await readBoundedDirectoryEntries(root, undefined, {
      maxEntries: 3,
    });
    const byBytes = await readBoundedDirectoryEntries(root, undefined, {
      maxNameBytes: 22,
    });
    const byWork = await readBoundedDirectoryEntries(root, undefined, {
      maxWork: 6,
    });
    const complete = await readBoundedDirectoryEntries(root);

    expect(byEntries).toMatchObject({ limited: true, entryCount: 3 });
    expect(byBytes).toMatchObject({ limited: true, nameBytes: 16 });
    expect(byWork).toMatchObject({ limited: true, work: 5 });
    expect(complete.entries.map(({ name }) => name)).toEqual(
      [...complete.entries.map(({ name }) => name)].sort(),
    );
    expect({
      entries: MAX_DIRECTORY_ENTRIES,
      nameBytes: MAX_DIRECTORY_NAME_BYTES,
      work: MAX_DIRECTORY_WORK,
    }).toEqual({ entries: 2_048, nameBytes: 131_072, work: 16_384 });
  });

  test("closes an active stream when the request is aborted mid-enumeration", async () => {
    const controller = new AbortController();
    const reader = fakeHandle(["first", "second"], () => controller.abort());

    await expect(
      readBoundedDirectoryEntries("unused", controller.signal, {
        open: async () => reader.handle,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(reader.reads).toBe(1);
    expect(reader.closed).toBe(1);
  });

  test("closes an active stream when its deadline expires mid-read", async () => {
    let closed = 0;
    const handle: DirectoryHandle = {
      async read() {
        await Bun.sleep(10);
        return fakeDirent("late");
      },
      close() {
        closed += 1;
      },
    };

    await expect(
      readBoundedDirectoryEntries("unused", AbortSignal.timeout(1), {
        open: async () => handle,
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(closed).toBe(1);
  });

  test("closes after an injected read failure and surfaces an injected close failure", async () => {
    const readFailure = new Error("read failed");
    const failedRead = fakeHandle([], undefined, readFailure);
    await expect(
      readBoundedDirectoryEntries("unused", undefined, {
        open: async () => failedRead.handle,
      }),
    ).rejects.toBe(readFailure);
    expect(failedRead.closed).toBe(1);

    const closeFailure = new Error("close failed");
    const failedClose = fakeHandle([], undefined, undefined, closeFailure);
    await expect(
      readBoundedDirectoryEntries("unused", undefined, {
        open: async () => failedClose.handle,
      }),
    ).rejects.toBe(closeFailure);
    expect(failedClose.closed).toBe(1);
  });
});

function fakeHandle(
  names: readonly string[],
  afterRead?: () => void,
  readFailure?: Error,
  closeFailure?: Error,
): {
  readonly handle: DirectoryHandle;
  readonly reads: number;
  readonly closed: number;
} {
  let index = 0;
  let reads = 0;
  let closed = 0;
  const result = {
    handle: {
      async read() {
        reads += 1;
        if (readFailure) throw readFailure;
        const name = names[index++];
        afterRead?.();
        return name === undefined ? null : fakeDirent(name);
      },
      async close() {
        closed += 1;
        if (closeFailure) throw closeFailure;
      },
    },
    get reads() {
      return reads;
    },
    get closed() {
      return closed;
    },
  };
  return result;
}

function fakeDirent(name: string): Dirent {
  return {
    name,
    parentPath: "unused",
    path: "unused",
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isDirectory: () => false,
    isFIFO: () => false,
    isFile: () => true,
    isSocket: () => false,
    isSymbolicLink: () => false,
  } as Dirent;
}
