import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareStandaloneOutputRoot,
  promoteStandaloneOutputRoot,
  standaloneOutputRootFromArgs,
} from "./build-standalone.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "bb-mate-standalone-output-"),
  );
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0).reverse()) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe("standalone output ownership", () => {
  test("accepts only one bounded absolute CLI output root", () => {
    expect(standaloneOutputRootFromArgs([])).toBeUndefined();
    expect(standaloneOutputRootFromArgs(["/tmp/standalone"])).toBe(
      "/tmp/standalone",
    );
    expect(() => standaloneOutputRootFromArgs(["relative"])).toThrow(
      "bounded absolute path",
    );
    expect(() => standaloneOutputRootFromArgs(["/one", "/two"])).toThrow(
      "at most one",
    );
  });

  test("preserves the previous artifact until complete staged output is promoted", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "output");
    const stage = path.join(parent, "stage");
    await Promise.all([fs.mkdir(root), fs.mkdir(stage)]);
    await Promise.all([
      fs.writeFile(path.join(root, "bb-mate"), "old binary"),
      fs.writeFile(path.join(root, "manifest.json"), "old manifest"),
      fs.writeFile(path.join(stage, "bb-mate"), "new binary"),
      fs.writeFile(path.join(stage, "manifest.json"), "new manifest"),
    ]);

    expect(await prepareStandaloneOutputRoot(root)).toBe(root);
    expect(await fs.readFile(path.join(root, "bb-mate"), "utf8")).toBe(
      "old binary",
    );
    await promoteStandaloneOutputRoot(root, stage);
    expect(await fs.readFile(path.join(root, "bb-mate"), "utf8")).toBe(
      "new binary",
    );
    expect(await fs.readFile(path.join(root, "manifest.json"), "utf8")).toBe(
      "new manifest",
    );
    await expect(fs.access(stage)).rejects.toThrow();
  });

  test("rejects unexpected entries without deleting owned files", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "output");
    await fs.mkdir(root);
    await Promise.all([
      fs.writeFile(path.join(root, "bb-mate"), "old binary"),
      fs.writeFile(path.join(root, "keep.txt"), "user data"),
    ]);

    await expect(prepareStandaloneOutputRoot(root)).rejects.toThrow(
      "unexpected entry: keep.txt",
    );
    expect(await fs.readFile(path.join(root, "bb-mate"), "utf8")).toBe(
      "old binary",
    );
    expect(await fs.readFile(path.join(root, "keep.txt"), "utf8")).toBe(
      "user data",
    );
  });

  test("rejects broad repository paths and a symlink root", async () => {
    await expect(prepareStandaloneOutputRoot(repositoryRoot)).rejects.toThrow(
      "Refusing unsafe",
    );
    await expect(
      prepareStandaloneOutputRoot(path.dirname(repositoryRoot)),
    ).rejects.toThrow("Refusing unsafe");
    await expect(
      prepareStandaloneOutputRoot(path.join(repositoryRoot, "apps")),
    ).rejects.toThrow("Refusing unsafe");
    await expect(prepareStandaloneOutputRoot(os.tmpdir())).rejects.toThrow(
      "Refusing unsafe",
    );

    const root = await temporaryRoot();
    const destination = await temporaryRoot();
    const link = path.join(root, "linked-output");
    await fs.symlink(destination, link);
    await expect(prepareStandaloneOutputRoot(link)).rejects.toThrow(
      "symlink component",
    );
  });

  test("rejects a symlinked ancestor without writing through it", async () => {
    const holder = await temporaryRoot();
    const outside = await temporaryRoot();
    const linkedParent = path.join(holder, "parent-link");
    const escapedOutput = path.join(linkedParent, "output");
    await fs.symlink(outside, linkedParent);

    try {
      await expect(prepareStandaloneOutputRoot(escapedOutput)).rejects.toThrow(
        "symlink component",
      );
      await expect(fs.access(path.join(outside, "output"))).rejects.toThrow();
      expect(await fs.readdir(outside)).toEqual([]);
    } finally {
      // Remove the link before afterEach removes its target. Bun's recursive
      // removal can stall on the resulting broken symlink under aggregate load.
      await fs.unlink(linkedParent);
    }
    await expect(fs.lstat(linkedParent)).rejects.toThrow();
  });

  test("rejects incomplete staged output without touching the previous artifact", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "output");
    const stage = path.join(parent, "stage");
    await Promise.all([fs.mkdir(root), fs.mkdir(stage)]);
    await Promise.all([
      fs.writeFile(path.join(root, "bb-mate"), "old binary"),
      fs.writeFile(path.join(root, "manifest.json"), "old manifest"),
      fs.writeFile(path.join(stage, "bb-mate"), "incomplete binary"),
    ]);

    await expect(promoteStandaloneOutputRoot(root, stage)).rejects.toThrow(
      "must contain exactly",
    );
    expect(await fs.readFile(path.join(root, "bb-mate"), "utf8")).toBe(
      "old binary",
    );
    expect(await fs.readFile(path.join(root, "manifest.json"), "utf8")).toBe(
      "old manifest",
    );
  });

  test("restores the previous pair when staged promotion fails partway", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "output");
    const stage = path.join(parent, "stage");
    await Promise.all([fs.mkdir(root), fs.mkdir(stage)]);
    await Promise.all([
      fs.writeFile(path.join(root, "bb-mate"), "old binary"),
      fs.writeFile(path.join(root, "manifest.json"), "old manifest"),
      fs.writeFile(path.join(stage, "bb-mate"), "new binary"),
      fs.writeFile(path.join(stage, "manifest.json"), "new manifest"),
    ]);
    let renameCount = 0;

    await expect(
      promoteStandaloneOutputRoot(root, stage, {
        async rename(source, destination) {
          renameCount += 1;
          if (renameCount === 2) throw new Error("injected promotion failure");
          await fs.rename(source, destination);
        },
      }),
    ).rejects.toThrow("injected promotion failure");
    expect(renameCount).toBe(3);
    expect(await fs.readFile(path.join(root, "bb-mate"), "utf8")).toBe(
      "old binary",
    );
    expect(await fs.readFile(path.join(root, "manifest.json"), "utf8")).toBe(
      "old manifest",
    );
    expect(await fs.readFile(path.join(stage, "bb-mate"), "utf8")).toBe(
      "new binary",
    );
  });
});
