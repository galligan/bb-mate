import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareStandaloneOutputRoot } from "./build-standalone.ts";

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
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("standalone output ownership", () => {
  test("replaces only the two owned artifact files", async () => {
    const root = await temporaryRoot();
    await Promise.all([
      fs.writeFile(path.join(root, "bb-mate"), "old binary"),
      fs.writeFile(path.join(root, "manifest.json"), "old manifest"),
    ]);

    expect(await prepareStandaloneOutputRoot(root)).toBe(root);
    expect(await fs.readdir(root)).toEqual([]);
  });

  test("rejects unexpected entries without deleting owned files", async () => {
    const root = await temporaryRoot();
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
    ).rejects.toThrow("unexpected entry");

    const root = await temporaryRoot();
    const destination = await temporaryRoot();
    const link = path.join(root, "linked-output");
    await fs.symlink(destination, link);
    await expect(prepareStandaloneOutputRoot(link)).rejects.toThrow(
      "real directory",
    );
  });
});
