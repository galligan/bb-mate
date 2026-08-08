import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createSurfaceLabHandler,
  isLoopbackHost,
  runSurfaceLab,
} from "./surface-lab-server.ts";

const roots: string[] = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bb-mate-lab-"));
  roots.push(root);
  await fs.mkdir(path.join(root, "assets"));
  await fs.writeFile(path.join(root, "index.html"), "<h1>Surface lab</h1>");
  await fs.writeFile(path.join(root, "meta.json"), '{"stories":{}}');
  await fs.writeFile(path.join(root, "assets", "app.js"), "export {};");
  return { root, handle: createSurfaceLabHandler(root) };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true })),
  );
});

describe("packaged surface lab server", () => {
  test("allows only explicit loopback bind hosts", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.0.2.1")).toBe(false);
  });

  test("does not announce rejected or failed binds as launched", async () => {
    const { root } = await fixture();
    const stdout: string[] = [];
    const stderr: string[] = [];
    expect(
      await runSurfaceLab({
        root,
        host: "0.0.0.0",
        port: 4317,
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value),
      }),
    ).toEqual({ exitCode: 1, signal: null });
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain("loopback-only");

    const occupied = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("occupied"),
    });
    const occupiedPort = occupied.port;
    if (occupiedPort === undefined) throw new Error("No occupied test port.");
    try {
      stderr.length = 0;
      expect(
        await runSurfaceLab({
          root,
          host: "127.0.0.1",
          port: occupiedPort,
          stdout: (value) => stdout.push(value),
          stderr: (value) => stderr.push(value),
        }),
      ).toEqual({ exitCode: 1, signal: null });
      expect(stdout).toEqual([]);
      expect(stderr.join("")).toContain(
        "Could not start the packaged surface lab",
      );
    } finally {
      occupied.stop(true);
    }
  });

  test("serves the index, metadata, assets, and HEAD requests", async () => {
    const { handle } = await fixture();

    const index = await handle(new Request("http://lab.local/"));
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await index.text()).toContain("Surface lab");

    const metadata = await handle(
      new Request("http://lab.local/meta.json", { method: "HEAD" }),
    );
    expect(metadata.status).toBe(200);
    expect(metadata.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await metadata.text()).toBe("");

    expect(
      (await handle(new Request("http://lab.local/assets/app.js"))).headers.get(
        "content-type",
      ),
    ).toBe("text/javascript; charset=utf-8");
  });

  test("rejects mutations, traversal, missing files, and escaped symlinks", async () => {
    const { root, handle } = await fixture();
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-mate-outside-"),
    );
    roots.push(outside);
    await fs.writeFile(path.join(outside, "secret.txt"), "secret");
    await fs.symlink(
      path.join(outside, "secret.txt"),
      path.join(root, "assets", "escape.txt"),
    );

    expect(
      (await handle(new Request("http://lab.local/", { method: "POST" })))
        .status,
    ).toBe(405);
    expect(
      (
        await handle(
          new Request("http://lab.local/%2e%2e%2foutside%2fsecret.txt"),
        )
      ).status,
    ).toBe(404);
    expect((await handle(new Request("http://lab.local/missing"))).status).toBe(
      404,
    );
    expect(
      (await handle(new Request("http://lab.local/assets/escape.txt"))).status,
    ).toBe(404);
  });
});
