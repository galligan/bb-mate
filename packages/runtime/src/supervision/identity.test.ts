import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { canonicalJson } from "../contracts/objects.ts";
import { loadOrCreateRuntimeIdentity } from "./identity.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

async function fixture() {
  const parent = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "runtime-identity-"),
  );
  roots.push(parent);
  return { parent, dataRoot: path.join(parent, "data") };
}

describe("runtime-owned supervision identity", () => {
  test("atomically creates and reopens one strict private stable identity", async () => {
    const { dataRoot } = await fixture();
    let byte = 1;
    const first = await loadOrCreateRuntimeIdentity({
      dataRoot,
      randomSource: (size) => Buffer.alloc(size, byte++),
    });
    const reopened = await loadOrCreateRuntimeIdentity({
      dataRoot,
      randomSource: () => {
        throw new Error("stable identity must not be regenerated");
      },
    });

    expect(reopened).toEqual(first);
    const identityPath = path.join(dataRoot, "runtime-identity.json");
    const stat = await fs.lstat(identityPath);
    expect(stat.isFile()).toBe(true);
    expect(stat.mode & 0o777).toBe(0o600);
    expect(stat.nlink).toBe(1);
    expect(await fs.readFile(identityPath, "utf8")).toBe(
      `${canonicalJson({ schemaVersion: 1, ...first })}\n`,
    );
    expect((await fs.stat(dataRoot)).mode & 0o777).toBe(0o700);
  });

  test("fails closed on symlink, mode, link-count, owner-shape, and schema corruption", async () => {
    const { parent, dataRoot } = await fixture();
    await loadOrCreateRuntimeIdentity({ dataRoot });
    const identityPath = path.join(dataRoot, "runtime-identity.json");
    const cases: Array<() => Promise<void>> = [
      async () => fs.chmod(identityPath, 0o644),
      async () =>
        fs.writeFile(identityPath, JSON.stringify({ schemaVersion: 1 })),
      async () =>
        fs.writeFile(
          identityPath,
          `${JSON.stringify({
            schemaVersion: 1,
            principalId: "p".repeat(32),
            bbContextId: "b".repeat(32),
            extra: true,
          })}\n`,
        ),
      async () => fs.link(identityPath, path.join(parent, "identity-link")),
    ];

    for (const corrupt of cases) {
      await fs.rm(dataRoot, { recursive: true, force: true });
      await loadOrCreateRuntimeIdentity({ dataRoot });
      await corrupt();
      await expect(
        loadOrCreateRuntimeIdentity({ dataRoot }),
      ).rejects.toMatchObject({
        code: "corrupt_data",
      });
    }

    await fs.rm(dataRoot, { recursive: true, force: true });
    await fs.mkdir(dataRoot, { mode: 0o700 });
    const outside = path.join(parent, "outside.json");
    await fs.writeFile(outside, "{}", { mode: 0o600 });
    await fs.symlink(outside, identityPath);
    await expect(
      loadOrCreateRuntimeIdentity({ dataRoot }),
    ).rejects.toMatchObject({
      code: "corrupt_data",
    });
  });

  test("opens with no-follow and rejects a pathname swapped after the existence check", async () => {
    const { parent, dataRoot } = await fixture();
    await loadOrCreateRuntimeIdentity({ dataRoot });
    const identityPath = path.join(dataRoot, "runtime-identity.json");
    const originalPath = path.join(parent, "original-identity.json");
    const hostilePath = path.join(parent, "hostile-identity.json");
    await fs.writeFile(hostilePath, "{}", { mode: 0o600 });
    const lstat = fs.lstat.bind(fs);
    let swapped = false;
    const replacement = (async (input: Parameters<typeof fs.lstat>[0]) => {
      const stat = await lstat(input);
      if (String(input) === identityPath && !swapped) {
        swapped = true;
        await fs.rename(identityPath, originalPath);
        await fs.symlink(hostilePath, identityPath);
      }
      return stat;
    }) as typeof fs.lstat;
    const observed = spyOn(fs, "lstat").mockImplementation(replacement);
    try {
      await expect(
        loadOrCreateRuntimeIdentity({ dataRoot }),
      ).rejects.toMatchObject({
        code: "corrupt_data",
      });
      expect(swapped).toBe(true);
    } finally {
      observed.mockRestore();
    }
  });
});
