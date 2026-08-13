import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEmbeddedLabAssets,
  createFileSystemLabAssets,
  createInMemoryLabAssets,
} from "./lab-assets.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true })),
  );
});

describe("surface lab asset providers", () => {
  test("resolves stable routes from an in-memory asset map", async () => {
    const assets = createInMemoryLabAssets({
      "/index.html": "<h1>Embedded lab</h1>",
    });

    const index = await assets.get("/index.html");
    expect(index?.contentType).toBe("text/html; charset=utf-8");
    expect(await new Response(index?.body).text()).toBe(
      "<h1>Embedded lab</h1>",
    );
    expect(await assets.get("/missing.html")).toBeNull();
  });

  test("keeps filesystem assets inside their real root", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-assets-"),
    );
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-assets-outside-"),
    );
    roots.push(root, outside);
    await fs.writeFile(path.join(root, "index.html"), "inside");
    await fs.writeFile(path.join(outside, "secret.txt"), "outside");
    await fs.symlink(
      path.join(outside, "secret.txt"),
      path.join(root, "escape.txt"),
    );

    const assets = createFileSystemLabAssets(root);
    expect(
      await new Response((await assets.get("/index.html"))?.body).text(),
    ).toBe("inside");
    expect(await assets.get("/../secret.txt")).toBeNull();
    expect(await assets.get("/escape.txt")).toBeNull();
  });

  test("reports an unavailable filesystem root without throwing", async () => {
    const assets = createFileSystemLabAssets(
      path.join(os.tmpdir(), "bb-plugin-studio-assets-does-not-exist"),
    );

    expect(await assets.get("/index.html")).toBeNull();
  });

  test("reads standalone assets from their embedded file paths", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-embedded-"),
    );
    roots.push(root);
    const embeddedPath = path.join(root, "index.html");
    await fs.writeFile(embeddedPath, "embedded");

    const assets = createEmbeddedLabAssets({ "/index.html": embeddedPath });
    const index = await assets.get("/index.html");
    expect(await new Response(index?.body).text()).toBe("embedded");
    expect(index?.contentType).toBe("text/html; charset=utf-8");
  });
});
