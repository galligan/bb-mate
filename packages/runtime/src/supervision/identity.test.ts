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

  test("recovers the exact post-link publication remnant after a crash", async () => {
    const { dataRoot } = await fixture();
    const identityPath = path.join(dataRoot, "runtime-identity.json");
    const open = fs.open.bind(fs);
    const unlink = fs.unlink.bind(fs);
    let crashSimulated = false;
    let failNextIdentityOpen = false;
    const unlinkReplacement = (async (
      input: Parameters<typeof fs.unlink>[0],
    ) => {
      if (
        !crashSimulated &&
        path.dirname(String(input)) === dataRoot &&
        path.basename(String(input)).startsWith(".runtime-identity-") &&
        path.basename(String(input)).endsWith(".publish")
      ) {
        crashSimulated = true;
        failNextIdentityOpen = true;
        throw Object.assign(new Error("simulated process interruption"), {
          code: "EIO",
        });
      }
      return unlink(input);
    }) as typeof fs.unlink;
    const openReplacement = (async (...args: Parameters<typeof fs.open>) => {
      if (failNextIdentityOpen && String(args[0]) === identityPath) {
        failNextIdentityOpen = false;
        throw Object.assign(new Error("simulated process interruption"), {
          code: "EIO",
        });
      }
      return open(...args);
    }) as typeof fs.open;
    const unlinkSpy = spyOn(fs, "unlink").mockImplementation(unlinkReplacement);
    const openSpy = spyOn(fs, "open").mockImplementation(openReplacement);
    try {
      await expect(
        loadOrCreateRuntimeIdentity({
          dataRoot,
          randomSource: (size) => Buffer.alloc(size, 1),
        }),
      ).rejects.toMatchObject({ code: "corrupt_data" });
    } finally {
      openSpy.mockRestore();
      unlinkSpy.mockRestore();
    }

    expect(crashSimulated).toBe(true);
    expect((await fs.stat(identityPath)).nlink).toBe(2);
    const publicationName = (await fs.readdir(dataRoot)).find(
      (name) =>
        name.startsWith(".runtime-identity-") && name.endsWith(".publish"),
    );
    expect(publicationName).toBeDefined();
    const publicationPath = path.join(dataRoot, publicationName!);

    const recovered = await loadOrCreateRuntimeIdentity({ dataRoot });
    expect(String(recovered.principalId)).toBe(publicationName!.slice(18, -8));
    await expect(fs.lstat(publicationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await fs.stat(identityPath)).nlink).toBe(1);
  });

  test("preserves atomic no-overwrite publication across concurrent creators", async () => {
    const { dataRoot } = await fixture();
    await fs.mkdir(dataRoot, { mode: 0o700 });
    const [first, second] = await Promise.all([
      loadOrCreateRuntimeIdentity({
        dataRoot,
        randomSource: (size) => Buffer.alloc(size, 1),
      }),
      loadOrCreateRuntimeIdentity({
        dataRoot,
        randomSource: (size) => Buffer.alloc(size, 2),
      }),
    ]);

    expect(second).toEqual(first);
    expect(
      (await fs.readdir(dataRoot)).filter((name) => name.endsWith(".publish")),
    ).toEqual([]);
    expect(
      (await fs.stat(path.join(dataRoot, "runtime-identity.json"))).nlink,
    ).toBe(1);
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

  test("does not recover ambiguous or hostile hardlinks", async () => {
    const { parent, dataRoot } = await fixture();
    const identity = await loadOrCreateRuntimeIdentity({ dataRoot });
    const identityPath = path.join(dataRoot, "runtime-identity.json");
    const publicationPath = path.join(
      dataRoot,
      `.runtime-identity-${identity.principalId}.publish`,
    );
    const hostilePath = path.join(parent, "hostile-identity-link");

    await fs.link(identityPath, publicationPath);
    await fs.link(identityPath, hostilePath);
    await expect(
      loadOrCreateRuntimeIdentity({ dataRoot }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    expect((await fs.stat(identityPath)).nlink).toBe(3);
    expect((await fs.stat(publicationPath)).ino).toBe(
      (await fs.stat(identityPath)).ino,
    );

    await fs.unlink(publicationPath);
    await fs.unlink(hostilePath);
    const unrelatedPublicationPath = path.join(
      dataRoot,
      `.runtime-identity-${"x".repeat(32)}.publish`,
    );
    await fs.link(identityPath, unrelatedPublicationPath);
    await fs.writeFile(publicationPath, "hostile", { mode: 0o600 });
    await expect(
      loadOrCreateRuntimeIdentity({ dataRoot }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    expect((await fs.stat(identityPath)).nlink).toBe(2);
    expect(await fs.readFile(publicationPath, "utf8")).toBe("hostile");
  });
});
