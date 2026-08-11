import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createStandaloneManifest,
  generateStandaloneEntry,
  inspectStandaloneAssets,
  serializeStandaloneManifest,
} from "./standalone-assets.ts";

const temporaryRoots: string[] = [];

async function fixture(storyCount = 13): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bb-mate-assets-"));
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, "assets"));
  await Promise.all([
    fs.writeFile(path.join(root, "index.html"), "<h1>Workbench</h1>\n"),
    fs.writeFile(
      path.join(root, "meta.json"),
      `${JSON.stringify({
        stories: Object.fromEntries(
          Array.from({ length: storyCount }, (_, index) => [
            `story-${index}`,
            {},
          ]),
        ),
      })}\n`,
    ),
    fs.writeFile(path.join(root, "assets", "app.js"), "export {};\n"),
  ]);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true })),
  );
});

describe("standalone asset graph", () => {
  test("enumerates, hashes, and sorts the required asset graph", async () => {
    const root = await fixture();
    const graph = await inspectStandaloneAssets(root);

    expect(graph.storyCount).toBe(13);
    expect(graph.assets.map((asset) => asset.route)).toEqual([
      "assets/app.js",
      "index.html",
      "meta.json",
    ]);
    expect(
      graph.assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256)),
    ).toBe(true);
  });

  test("rejects missing requirements, story drift, and symlinks", async () => {
    const missing = await fixture();
    await fs.rm(path.join(missing, "index.html"));
    await expect(inspectStandaloneAssets(missing)).rejects.toThrow(
      "missing index.html",
    );

    const drift = await fixture(12);
    await expect(inspectStandaloneAssets(drift)).rejects.toThrow(
      "Expected 13 standalone stories, found 12",
    );

    const linked = await fixture();
    await fs.symlink(
      path.join(linked, "index.html"),
      path.join(linked, "assets", "linked.html"),
    );
    await expect(inspectStandaloneAssets(linked)).rejects.toThrow("symlink");
  });

  test("generates stable imports, route mapping, and manifest bytes", async () => {
    const graph = await inspectStandaloneAssets(await fixture());
    const entry = generateStandaloneEntry({
      assets: [...graph.assets].reverse(),
      entrypointPath: "/repo/apps/cli/src/entrypoint.ts",
      runtimeVersion: "0.1.0-alpha.3",
    });
    expect(entry).toContain('mode: "standalone"');
    expect(entry).toContain('runtimeVersion: "0.1.0-alpha.3"');
    expect(entry.indexOf('"/assets/app.js"')).toBeLessThan(
      entry.indexOf('"/index.html"'),
    );

    const manifest = createStandaloneManifest({
      graph,
      executable: new TextEncoder().encode("executable"),
      bunVersion: "1.3.14",
      runtimeVersion: "0.1.0-alpha.3",
    });
    expect(manifest).toMatchObject({
      target: "bun-darwin-arm64",
      architecture: "arm64",
      mode: "0755",
      size: 10,
      storyCount: 13,
    });
    expect(serializeStandaloneManifest(manifest)).toEndWith("\n");
    expect(serializeStandaloneManifest(manifest)).toBe(
      serializeStandaloneManifest(manifest),
    );
  });
});
