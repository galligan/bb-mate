import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { admitTrustedRoots } from "./trusted-roots.ts";
import type { TrustedRootInput } from "./discovery-types.ts";

const temporaryRoots: string[] = [];
const opaqueKey = (character: string): string => character.repeat(32);

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("trusted source roots", () => {
  test("stops before filesystem admission when the request is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      admitTrustedRoots([], { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("admits a configured directory without exposing its canonical path", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const configured = path.join(parent, "example-plugin");
    await fs.mkdir(configured);

    const result = await admitTrustedRoots([
      { rootKey: opaqueKey("t"), kind: "current-project", path: configured },
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.roots).toEqual([
      {
        rootKey: opaqueKey("t"),
        kind: "current-project",
        displayName: "example-plugin",
      },
    ]);
    expect(Object.keys(result.roots[0] ?? {})).not.toContain("canonicalRoot");
  });

  test("rejects a configured root whose leaf is a symlink", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const realRoot = path.join(parent, "real-plugin");
    const linkedRoot = path.join(parent, "linked-plugin");
    await fs.mkdir(realRoot);
    await fs.symlink(realRoot, linkedRoot, "dir");

    const result = await admitTrustedRoots([
      { rootKey: opaqueKey("l"), kind: "explicit", path: linkedRoot },
    ]);

    expect(result.roots).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "root-symlink",
        rootKey: opaqueKey("l"),
        displayPath: "linked-plugin",
      }),
    ]);
    expect(result.diagnostics[0]?.detail).not.toContain(parent);
  });

  test("reports invalid roots without hiding a safe sibling", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const safeRoot = path.join(parent, "safe");
    const fileRoot = path.join(parent, "file.txt");
    await fs.mkdir(safeRoot);
    await fs.writeFile(fileRoot, "not a directory");

    const result = await admitTrustedRoots([
      {
        rootKey: opaqueKey("m"),
        kind: "pinned",
        path: path.join(parent, "missing"),
      },
      { rootKey: opaqueKey("f"), kind: "explicit", path: fileRoot },
      { rootKey: opaqueKey("s"), kind: "current-project", path: safeRoot },
    ]);

    expect(result.roots.map((root) => root.rootKey)).toEqual([opaqueKey("s")]);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      "root-missing",
      "root-not-directory",
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(parent);
  });

  test("aliases duplicate canonical directories to one admitted root", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const rootPath = path.join(parent, "plugin");
    await fs.mkdir(rootPath);

    const result = await admitTrustedRoots([
      { rootKey: opaqueKey("a"), kind: "current-project", path: rootPath },
      {
        rootKey: opaqueKey("b"),
        kind: "pinned",
        path: path.join(rootPath, "."),
      },
    ]);

    expect(result.roots.map((root) => root.rootKey)).toEqual([opaqueKey("a")]);
    expect(result.aliases).toEqual([
      { rootKey: opaqueKey("b"), admittedRootKey: opaqueKey("a") },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("bounds configured roots at 128", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const inputs = await Promise.all(
      Array.from({ length: 129 }, async (_, index) => {
        const rootPath = path.join(
          parent,
          `plugin-${index.toString().padStart(2, "0")}`,
        );
        await fs.mkdir(rootPath);
        return {
          rootKey: index.toString(36).padStart(32, "0"),
          kind: "explicit" as const,
          path: rootPath,
        };
      }),
    );

    const result = await admitTrustedRoots(inputs);

    expect(result.roots).toHaveLength(128);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "root-limit",
        rootKey: (128).toString(36).padStart(32, "0"),
      }),
    ]);
  });

  test("counts only admitted roots toward the configured-root limit", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const safeRoot = path.join(parent, "safe");
    await fs.mkdir(safeRoot);
    const missing: TrustedRootInput[] = Array.from(
      { length: 16 },
      (_, index) => ({
        rootKey: index.toString(36).padStart(32, "m"),
        kind: "explicit",
        path: path.join(parent, `missing-${index}`),
      }),
    );

    const result = await admitTrustedRoots([
      ...missing,
      { rootKey: opaqueKey("s"), kind: "current-project", path: safeRoot },
    ]);

    expect(result.roots.map((root) => root.displayName)).toEqual(["safe"]);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(
      Array.from({ length: 16 }, () => "root-missing"),
    );
  });

  test("rejects a non-opaque root key without echoing it", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const rootPath = path.join(parent, "plugin");
    await fs.mkdir(rootPath);

    const result = await admitTrustedRoots([
      { rootKey: "not/an/opaque/key", kind: "explicit", path: rootPath },
    ]);

    expect(result.roots).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "root-key-invalid", rootKey: null }),
    ]);
    expect(JSON.stringify(result)).not.toContain("not/an/opaque/key");
  });

  test("issues a server-private capability that cannot be serialized", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const rootPath = path.join(parent, "plugin");
    await fs.mkdir(rootPath);

    const result = await admitTrustedRoots([
      { rootKey: opaqueKey("c"), kind: "explicit", path: rootPath },
    ]);

    expect(() => JSON.stringify(result.roots[0])).toThrow(
      "trusted roots are server-private",
    );
  });

  test("rejects reusing one opaque root key for two directories", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const first = path.join(parent, "first");
    const second = path.join(parent, "second");
    await fs.mkdir(first);
    await fs.mkdir(second);
    const rootKey = opaqueKey("d");

    const result = await admitTrustedRoots([
      { rootKey, kind: "current-project", path: first },
      { rootKey, kind: "pinned", path: second },
    ]);

    expect(result.roots.map((root) => root.displayName)).toEqual(["first"]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "root-key-duplicate", rootKey }),
    );
  });

  test("rejects a path-shaped display label without disclosing it", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const rootPath = path.join(parent, "plugin");
    await fs.mkdir(rootPath);

    const result = await admitTrustedRoots([
      {
        rootKey: opaqueKey("x"),
        kind: "explicit",
        path: rootPath,
        displayName: "/Users/private/plugin",
      },
    ]);

    expect(result.roots).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "root-display-invalid",
        displayPath: "plugin",
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain("/Users/private");
  });

  test("rejects a root kind outside the admitted server sources", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const rootPath = path.join(parent, "plugin");
    await fs.mkdir(rootPath);

    const result = await admitTrustedRoots([
      {
        rootKey: opaqueKey("k"),
        kind: "browser-input",
        path: rootPath,
      } as unknown as TrustedRootInput,
    ]);

    expect(result.roots).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "root-kind-invalid" }),
    ]);
  });
});
