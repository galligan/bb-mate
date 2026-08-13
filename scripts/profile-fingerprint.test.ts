import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fingerprintProfileRoots } from "./profile-fingerprint.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true })),
  );
});

describe("normal profile fingerprint", () => {
  test("is stable and detects byte, link, and tree mutation", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-profile-proof-"),
    );
    roots.push(root);
    await fs.mkdir(path.join(root, "nested"));
    await fs.writeFile(path.join(root, "nested", "state.db"), "before");
    await fs.symlink("nested/state.db", path.join(root, "current"));
    const before = await fingerprintProfileRoots([root, `${root}-absent`]);
    expect(await fingerprintProfileRoots([root, `${root}-absent`])).toBe(
      before,
    );
    await fs.writeFile(path.join(root, "nested", "state.db"), "after");
    expect(await fingerprintProfileRoots([root, `${root}-absent`])).not.toBe(
      before,
    );
  });

  test("rejects an unbounded profile tree", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-profile-proof-"),
    );
    roots.push(root);
    await fs.writeFile(path.join(root, "one"), "1");
    await fs.writeFile(path.join(root, "two"), "2");
    await expect(
      fingerprintProfileRoots([root], { maxEntries: 1 }),
    ).rejects.toThrow("entry bound");
  });
});
