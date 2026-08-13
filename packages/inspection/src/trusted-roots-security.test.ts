import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { installDiscoveryTestHookForTest } from "./discovery-test-hook.ts";
import { admitTrustedRoots } from "./trusted-roots.ts";

const temporaryRoots: string[] = [];
const opaqueKey = (character: string): string => character.repeat(32);

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("trusted root security", () => {
  test("rejects a directory swapped to a symlink during admission", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const configured = path.join(parent, "configured");
    const original = path.join(parent, "original");
    const outside = path.join(parent, "outside");
    await fs.mkdir(configured);
    await fs.mkdir(outside);
    let swapped = false;
    const restore = installDiscoveryTestHookForTest(async (event) => {
      if (
        swapped ||
        event.point !== "after-root-lstat" ||
        event.path !== configured
      ) {
        return;
      }
      swapped = true;
      await fs.rename(configured, original);
      await fs.symlink(outside, configured, "dir");
    });

    try {
      const result = await admitTrustedRoots([
        { rootKey: opaqueKey("r"), kind: "explicit", path: configured },
      ]);

      expect(result.roots).toEqual([]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: "root-changed",
          displayPath: "configured",
        }),
      ]);
    } finally {
      restore();
    }
  });

  test("rejects filesystem root and current home by canonical identity", async () => {
    const result = await admitTrustedRoots([
      {
        rootKey: opaqueKey("v"),
        kind: "explicit",
        path: path.parse(process.cwd()).root,
      },
      { rootKey: opaqueKey("h"), kind: "explicit", path: os.homedir() },
    ]);

    expect(result.roots).toEqual([]);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      "root-forbidden",
      "root-forbidden",
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(os.homedir());
  });

  test("rejects aliases that canonicalize to root or current home", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
    );
    temporaryRoots.push(parent);
    const rootAlias = path.join(parent, "root-alias");
    const homeParentAlias = path.join(parent, "home-parent-alias");
    await fs.symlink(path.parse(process.cwd()).root, rootAlias, "dir");
    await fs.symlink(path.dirname(os.homedir()), homeParentAlias, "dir");

    const result = await admitTrustedRoots([
      {
        rootKey: opaqueKey("q"),
        kind: "explicit",
        path: `${rootAlias}${path.sep}tmp${path.sep}..`,
        displayName: "root-via-alias",
      },
      {
        rootKey: opaqueKey("j"),
        kind: "pinned",
        path: path.join(homeParentAlias, path.basename(os.homedir())),
      },
    ]);

    expect(result.roots).toEqual([]);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      "root-forbidden",
      "root-forbidden",
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(os.homedir());
  });

  test("rejects canonical ancestors of the current home without disclosing them", async () => {
    const homeAncestor = path.dirname(await fs.realpath(os.homedir()));

    const result = await admitTrustedRoots([
      {
        rootKey: opaqueKey("a"),
        kind: "explicit",
        path: homeAncestor,
        displayName: "home-ancestor",
      },
    ]);

    expect(result.roots).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "root-forbidden",
        displayPath: path.basename(homeAncestor) || "root",
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(homeAncestor);
  });

  test.each(["node_modules", ".git", "dist", "cache", "caches", ".private"])(
    "rejects a configured root inside the forbidden %s tree",
    async (forbiddenName) => {
      const parent = await fs.mkdtemp(
        path.join(os.tmpdir(), "bb-plugin-studio-roots-"),
      );
      temporaryRoots.push(parent);
      const forbiddenRoot = path.join(parent, forbiddenName);
      const configured = path.join(forbiddenRoot, "nested-source");
      await fs.mkdir(configured, { recursive: true });

      const result = await admitTrustedRoots([
        {
          rootKey: opaqueKey("f"),
          kind: "explicit",
          path: configured,
          displayName: "forbidden-source",
        },
      ]);

      expect(result.roots).toEqual([]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: "root-forbidden",
          displayPath: "nested-source",
        }),
      ]);
      expect(JSON.stringify(result.diagnostics)).not.toContain(parent);
    },
  );
});
