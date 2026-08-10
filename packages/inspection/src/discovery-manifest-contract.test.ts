import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { discoverSourceCandidates } from "./discover-source-candidates.ts";
import {
  createDiscoveryTestHarness,
  WORKSPACE_ROOT_KEY,
} from "./discovery-test-helpers.ts";
import { admitTrustedRoots } from "./trusted-roots.ts";

const harness = createDiscoveryTestHarness();

afterEach(() => harness.cleanup());

const baseBb = {
  name: "broken",
  description: "broken plugin",
  branding: { icon: "Puzzle" },
  server: "./server.ts",
};

describe("released bb manifest contract", () => {
  test.each([
    ["missing description", { ...baseBb, description: undefined }],
    ["missing branding", { ...baseBb, branding: undefined }],
    ["empty branding", { ...baseBb, branding: {} }],
    ["unknown bb key", { ...baseBb, surprise: true }],
    ["logo without light", { ...baseBb, branding: { logo: { dark: "x" } } }],
    [
      "invalid theme structure",
      { ...baseBb, themes: [{ id: "invalid id", name: "Theme", css: "x" }] },
    ],
    [
      "duplicate theme ids",
      {
        ...baseBb,
        themes: [
          { id: "duplicate", name: "First", css: "./theme.css" },
          { id: "duplicate", name: "Second", css: "./theme.css" },
        ],
      },
    ],
    [
      "non-css theme asset",
      {
        ...baseBb,
        themes: [{ id: "theme", name: "Theme", css: "./theme.txt" }],
      },
    ],
    [
      "unsupported light logo asset",
      { ...baseBb, branding: { logo: { light: "./logo.txt" } } },
    ],
    [
      "unsupported dark logo asset",
      {
        ...baseBb,
        branding: {
          logo: { light: "./logo.svg", dark: "./logo.txt" },
        },
      },
    ],
  ])("rejects %s without hiding a valid sibling", async (_label, bb) => {
    const rootPath = await harness.createRoot();
    const brokenRoot = path.join(rootPath, "broken");
    const safeRoot = path.join(rootPath, "safe");
    await fs.mkdir(brokenRoot);
    await fs.mkdir(safeRoot);
    await fs.writeFile(
      path.join(brokenRoot, "package.json"),
      JSON.stringify({ name: "bb-plugin-broken", version: "1.0.0", bb }),
    );
    await fs.writeFile(path.join(brokenRoot, "server.ts"), "export {};\n");
    for (const asset of [
      "theme.css",
      "theme.txt",
      "logo.svg",
      "logo.txt",
      "icon.png",
    ]) {
      await fs.writeFile(path.join(brokenRoot, asset), "fixture\n");
    }
    await harness.writePlugin(safeRoot, "safe");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates.map((candidate) => candidate.pluginId)).toEqual([
      "safe",
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "manifest-invalid",
        displayPath: "workspace/broken",
      }),
    );
  });

  test.each([
    ["POSIX icon", { icon: "./icon.svg" }],
    ["Windows-style host icon name", { icon: ".\\missing.svg" }],
    [
      "light and dark logos",
      { logo: { light: "./logo.png", dark: "./logo.webp" } },
    ],
  ])("accepts supported %s asset declarations", async (_label, branding) => {
    const rootPath = await harness.createRoot();
    await fs.writeFile(path.join(rootPath, "server.ts"), "export {};\n");
    await fs.writeFile(path.join(rootPath, "icon.svg"), "<svg />\n");
    for (const asset of ["logo.png", "logo.webp"]) {
      await fs.writeFile(path.join(rootPath, asset), "fixture\n");
    }
    await fs.writeFile(
      path.join(rootPath, "package.json"),
      JSON.stringify({
        name: "bb-plugin-valid-assets",
        version: "1.0.0",
        bb: { ...baseBb, branding },
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.diagnostics).toEqual([]);
    expect(result.candidates.map((candidate) => candidate.pluginId)).toEqual([
      "valid-assets",
    ]);
  });

  test("rejects an invalid engines shape without hiding a safe sibling", async () => {
    const rootPath = await harness.createRoot();
    const brokenRoot = path.join(rootPath, "broken");
    const safeRoot = path.join(rootPath, "safe");
    await fs.mkdir(brokenRoot);
    await fs.mkdir(safeRoot);
    await fs.writeFile(path.join(brokenRoot, "server.ts"), "export {};\n");
    await fs.writeFile(
      path.join(brokenRoot, "package.json"),
      JSON.stringify({
        name: "bb-plugin-broken",
        version: "1.0.0",
        engines: "invalid",
        bb: baseBb,
      }),
    );
    await harness.writePlugin(safeRoot, "safe");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates.map((candidate) => candidate.pluginId)).toEqual([
      "safe",
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "manifest-invalid",
        displayPath: "workspace/broken",
      }),
    );
  });

  test("rejects invalid bytes in a plugin-owned compact SVG", async () => {
    const rootPath = await harness.createRoot();
    await fs.writeFile(path.join(rootPath, "server.ts"), "export {};\n");
    await fs.writeFile(path.join(rootPath, "icon.svg"), "not an svg\n");
    await fs.writeFile(
      path.join(rootPath, "package.json"),
      JSON.stringify({
        name: "bb-plugin-invalid-icon",
        version: "1.0.0",
        bb: { ...baseBb, branding: { icon: "./icon.svg" } },
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "manifest-invalid",
        displayPath: "workspace",
      }),
    );
  });
});
