import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  inspectPluginSession,
  pluginInspectionPlugin,
  type BrowserPluginSession,
} from "../plugin-inspection-server";

const temporaryRoots: string[] = [];

async function fixture(): Promise<{
  dataRoot: string;
  pluginRoot: string;
  workspaceRoot: string;
}> {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(
    path.join(temporaryRoot, "bb-mate-session-v2-"),
  );
  temporaryRoots.push(root);
  const workspaceRoot = path.join(root, "workspace");
  const pluginRoot = path.join(workspaceRoot, "plugins", "example");
  await writePlugin(pluginRoot, "example", "Example");
  return { dataRoot: path.join(root, "data"), pluginRoot, workspaceRoot };
}

async function writePlugin(
  pluginRoot: string,
  id: string,
  displayName: string,
): Promise<void> {
  await fs.mkdir(pluginRoot, { recursive: true });
  await fs.writeFile(
    path.join(pluginRoot, "package.json"),
    JSON.stringify({
      name: `bb-plugin-${id}`,
      version: "1.2.3",
      bb: {
        name: displayName,
        description: "A passive fixture.",
        branding: { icon: "Puzzle" },
        server: "./server.ts",
      },
    }),
  );
  await fs.writeFile(path.join(pluginRoot, "server.ts"), "export {};\n");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("catalog-backed plugin inspection session", () => {
  test("reopens with one stable opaque target and no private identity or path", async () => {
    const { dataRoot, pluginRoot, workspaceRoot } = await fixture();

    const first = await inspectPluginSession({ dataRoot, workspaceRoot });
    const second = await inspectPluginSession({ dataRoot, workspaceRoot });
    const identity = JSON.parse(
      await fs.readFile(path.join(dataRoot, "workbench-server.json"), "utf8"),
    ) as Record<string, unknown>;
    const json = JSON.stringify(first);

    expect(first.schemaVersion).toBe(2);
    expect(first.workspace.label).toBe("Plugin Workbench");
    expect(first.workspace.candidates[0]?.id).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second.workspace.candidates[0]?.id).toBe(
      first.workspace.candidates[0]?.id,
    );
    expect(first.workspace.selectedTargetId).toBe(
      first.workspace.candidates[0]?.id,
    );
    expect(Object.keys(identity).sort()).toEqual([
      "bbContextId",
      "principalId",
      "rootKeys",
      "schemaVersion",
    ]);
    expect(json).not.toContain(workspaceRoot);
    expect(json).not.toContain(pluginRoot);
    expect(json).not.toContain(dataRoot);
    for (const value of [
      identity.principalId,
      identity.bbContextId,
      ...Object.values(identity.rootKeys as Record<string, string>),
      os.hostname(),
    ]) {
      expect(json).not.toContain(String(value));
    }
    expect(first.handoffs).toEqual({
      launchCommand: null,
      checkCommand: null,
      liveCommand: null,
      detail:
        "Terminal handoffs are unavailable from the read-only catalog session.",
    });
    expect(first.inspection).toMatchObject({
      modes: {
        fixture: { available: true },
        harness: { available: false },
        live: { available: false, url: null },
      },
      native: { bbVersion: null, connectUrl: null },
      provenance: null,
    });
  });

  test("requires an explicit opaque target when discovery is ambiguous", async () => {
    const { dataRoot, workspaceRoot } = await fixture();
    await writePlugin(
      path.join(workspaceRoot, "plugins", "second"),
      "second",
      "Second",
    );

    const discovery = await inspectPluginSession({ dataRoot, workspaceRoot });
    expect(discovery.workspace.candidates).toHaveLength(2);
    expect(discovery.workspace.selectedTargetId).toBeNull();
    expect(discovery.inspection.state).toBe("ambiguous");

    const selected = await inspectPluginSession({
      dataRoot,
      workspaceRoot,
      selectedTargetId: discovery.workspace.candidates[1]!.id,
    });
    expect(selected.workspace.selectedTargetId).toBe(
      discovery.workspace.candidates[1]!.id,
    );
    expect(selected.inspection.target?.displayPath).toBe(
      discovery.workspace.candidates[1]!.displayPath,
    );
  });

  test("does not fall back when a supplied selection is invalid or foreign", async () => {
    const { dataRoot, workspaceRoot } = await fixture();
    for (const requested of [
      "example",
      "../example",
      "/tmp/example",
      "u".repeat(32),
    ]) {
      const session = await inspectPluginSession({
        dataRoot,
        workspaceRoot,
        selectedTargetId: requested,
      });
      expect(session.workspace.selectedTargetId).toBeNull();
      expect(session.workspace.selectionError).toBe(
        "The requested plugin selection is unavailable. Choose a server-discovered target.",
      );
      expect(session.workspace.selectionError).not.toContain(requested);
      expect(session.inspection.target).toBeNull();
    }
  });

  test("uses an explicit target as the sole trusted root", async () => {
    const { dataRoot, workspaceRoot } = await fixture();
    const explicitRoot = path.join(path.dirname(workspaceRoot), "explicit");
    await writePlugin(explicitRoot, "explicit", "Explicit");

    const session = await inspectPluginSession({
      dataRoot,
      workspaceRoot,
      targetPath: explicitRoot,
    });

    expect(session.workspace.candidates).toHaveLength(1);
    expect(session.workspace.candidates[0]).toMatchObject({
      label: "Explicit",
      displayPath: "explicit",
    });
    expect(session.workspace.selectedTargetId).toBe(
      session.workspace.candidates[0]!.id,
    );
    expect(JSON.stringify(session)).not.toContain(workspaceRoot);
    expect(JSON.stringify(session)).not.toContain(explicitRoot);
  });

  test("excludes an external symlink and never executes its target", async () => {
    const { dataRoot, pluginRoot, workspaceRoot } = await fixture();
    await fs.rm(pluginRoot, { recursive: true, force: true });
    const externalRoot = path.join(path.dirname(workspaceRoot), "external");
    const executionSentinel = path.join(
      path.dirname(workspaceRoot),
      "executed",
    );
    await writePlugin(externalRoot, "external", "External");
    await fs.writeFile(
      path.join(externalRoot, "server.ts"),
      `await Bun.write(${JSON.stringify(executionSentinel)}, "executed");\n`,
    );
    const linkedRoot = path.join(workspaceRoot, "plugins", "linked");
    await fs.symlink(externalRoot, linkedRoot);

    const session = await inspectPluginSession({ dataRoot, workspaceRoot });

    expect(session.workspace.candidates).toEqual([]);
    expect(await fs.exists(executionSentinel)).toBe(false);
    expect(JSON.stringify(session)).not.toContain(externalRoot);
    expect(JSON.stringify(session)).not.toContain(linkedRoot);
  });

  test("does not treat an installed-like node_modules package as a source target", async () => {
    const { dataRoot, pluginRoot, workspaceRoot } = await fixture();
    await fs.rm(pluginRoot, { recursive: true, force: true });
    const installedRoot = path.join(
      workspaceRoot,
      "node_modules",
      "bb-plugin-installed",
    );
    await writePlugin(installedRoot, "installed", "Installed");

    const session = await inspectPluginSession({ dataRoot, workspaceRoot });

    expect(session.workspace.candidates).toEqual([]);
    expect(session.workspace.selectedTargetId).toBeNull();
    expect(JSON.stringify(session)).not.toContain(installedRoot);
  });

  test("persists owned private identity state and rejects unsafe roots/files", async () => {
    const { dataRoot, workspaceRoot } = await fixture();
    await inspectPluginSession({ dataRoot, workspaceRoot });
    const identityPath = path.join(dataRoot, "workbench-server.json");
    const identityStat = await fs.stat(identityPath);
    expect((await fs.stat(dataRoot)).mode & 0o777).toBe(0o700);
    expect(identityStat.mode & 0o777).toBe(0o600);
    expect(identityStat.nlink).toBe(1);

    await fs.chmod(identityPath, 0o640);
    await expect(
      inspectPluginSession({ dataRoot, workspaceRoot }),
    ).rejects.toThrow("Unsafe persisted Workbench server identity");

    const linkedDataRoot = `${dataRoot}-link`;
    await fs.symlink(dataRoot, linkedDataRoot);
    await expect(
      inspectPluginSession({ dataRoot: linkedDataRoot, workspaceRoot }),
    ).rejects.toThrow("Invalid request");
  });

  test("rejects identity symlinks, hardlinks, and unknown fields without repair", async () => {
    const { dataRoot, workspaceRoot } = await fixture();
    await inspectPluginSession({ dataRoot, workspaceRoot });
    const identityPath = path.join(dataRoot, "workbench-server.json");
    const outsidePath = path.join(path.dirname(dataRoot), "outside-identity");
    const outsideBytes = "outside identity bytes\n";
    await fs.writeFile(outsidePath, outsideBytes, { mode: 0o600 });

    await fs.rm(identityPath);
    await fs.symlink(outsidePath, identityPath);
    await expect(
      inspectPluginSession({ dataRoot, workspaceRoot }),
    ).rejects.toThrow("Unsafe persisted Workbench server identity");
    expect(await fs.readFile(outsidePath, "utf8")).toBe(outsideBytes);

    await fs.rm(identityPath);
    await fs.link(outsidePath, identityPath);
    await expect(
      inspectPluginSession({ dataRoot, workspaceRoot }),
    ).rejects.toThrow("Unsafe persisted Workbench server identity");
    expect(await fs.readFile(outsidePath, "utf8")).toBe(outsideBytes);

    await fs.rm(identityPath);
    const corrupt = `${JSON.stringify({
      schemaVersion: 1,
      principalId: "p".repeat(32),
      bbContextId: "b".repeat(32),
      rootKeys: {},
      unexpected: true,
    })}\n`;
    await fs.writeFile(identityPath, corrupt, { mode: 0o600 });
    await expect(
      inspectPluginSession({ dataRoot, workspaceRoot }),
    ).rejects.toThrow("Invalid persisted Workbench server identity");
    expect(await fs.readFile(identityPath, "utf8")).toBe(corrupt);
  });

  test("rejects a pre-existing 0755 data root without writing into it", async () => {
    const { dataRoot, workspaceRoot } = await fixture();
    await fs.mkdir(dataRoot, { mode: 0o755 });

    await expect(
      inspectPluginSession({ dataRoot, workspaceRoot }),
    ).rejects.toThrow("Invalid request");
    expect(await fs.readdir(dataRoot)).toEqual([]);
  });

  test("serves read-only loopback same-origin sessions for target query only", async () => {
    const { dataRoot, workspaceRoot } = await fixture();
    await writePlugin(
      path.join(workspaceRoot, "plugins", "second"),
      "second",
      "Second",
    );
    let middleware:
      ((request: never, response: never, next: () => void) => void) | undefined;
    let closeListener: (() => void) | undefined;
    const plugin = pluginInspectionPlugin({ dataRoot, workspaceRoot });
    const configureServer =
      typeof plugin.configureServer === "function"
        ? plugin.configureServer
        : plugin.configureServer?.handler;
    await configureServer?.call(
      {} as never,
      {
        httpServer: {
          once(_event: string, listener: () => void) {
            closeListener = listener;
          },
        },
        middlewares: {
          use(handler: typeof middleware) {
            middleware = handler;
          },
        },
      } as never,
    );
    if (!middleware) throw new Error("middleware was not registered");
    const before = await dataDigest(dataRoot);

    const request = async (
      url: string,
      headers: Record<string, string> = { host: "127.0.0.1:5173" },
      localAddress = "127.0.0.1",
    ): Promise<{
      statusCode: number;
      body: unknown;
      responseHeaders: Record<string, string>;
    }> => {
      let statusCode = 0;
      const responseHeaders: Record<string, string> = {};
      const body = await new Promise<string>((resolve) => {
        middleware!(
          {
            method: "GET",
            url,
            headers,
            socket: { localAddress, localPort: 5173 },
          } as never,
          {
            set statusCode(value: number) {
              statusCode = value;
            },
            get statusCode() {
              return statusCode;
            },
            setHeader(name: string, value: string) {
              responseHeaders[name.toLowerCase()] = value;
            },
            end(value?: string) {
              resolve(value ?? "");
            },
          } as never,
          () => {
            throw new Error("unexpected middleware fallthrough");
          },
        );
      });
      return {
        statusCode,
        body: JSON.parse(body) as unknown,
        responseHeaders,
      };
    };
    const initial = await request("/bb-mate-session.json");
    const targetId = (initial.body as BrowserPluginSession).workspace
      .candidates[0]!.id;
    const selected = await request(`/bb-mate-session.json?target=${targetId}`, {
      host: "127.0.0.1:5173",
      origin: "http://127.0.0.1:5173",
    });
    const legacy = await request(`/bb-mate-session.json?plugin=${targetId}`);
    const duplicate = await request(
      `/bb-mate-session.json?target=${targetId}&target=${targetId}`,
    );
    const extra = await request(
      `/bb-mate-session.json?target=${targetId}&extra=ignored`,
    );
    const pathTarget = await request(
      "/bb-mate-session.json?target=..%2Fplugins%2Fsecret",
    );
    const emptyTarget = await request("/bb-mate-session.json?target=");
    const unknownTarget = await request(
      `/bb-mate-session.json?target=${"u".repeat(32)}`,
    );
    const absoluteTarget = await request(
      "http://evil.example/bb-mate-session.json",
    );
    const malformed = await request("http://[");
    const foreign = await request("/bb-mate-session.json", {
      host: "evil.example",
    });

    expect(selected.statusCode).toBe(200);
    expect(
      (selected.body as BrowserPluginSession).workspace.selectedTargetId,
    ).toBe(targetId);
    expect(
      (initial.body as BrowserPluginSession).workspace.selectedTargetId,
    ).toBeNull();
    for (const rejected of [
      legacy,
      duplicate,
      extra,
      pathTarget,
      emptyTarget,
      absoluteTarget,
      malformed,
    ]) {
      expect(rejected.statusCode).toBe(400);
      expect(rejected.body).toEqual({ error: "Request unavailable." });
    }
    expect(unknownTarget.statusCode).toBe(200);
    expect(
      (unknownTarget.body as BrowserPluginSession).workspace.selectedTargetId,
    ).toBeNull();
    expect(
      (unknownTarget.body as BrowserPluginSession).workspace.selectionError,
    ).not.toContain("u".repeat(32));
    expect(foreign.statusCode).toBe(403);
    for (const response of [
      selected,
      legacy,
      duplicate,
      extra,
      pathTarget,
      emptyTarget,
      unknownTarget,
      absoluteTarget,
      malformed,
      foreign,
    ]) {
      expect(response.responseHeaders).toMatchObject({
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      });
    }
    expect(await dataDigest(dataRoot)).toBe(before);
    expect(closeListener).toBeFunction();
    closeListener?.();
  });

  test("rejects hostile Host, Origin, and local-address combinations", async () => {
    const { dataRoot, workspaceRoot } = await fixture();
    let middleware:
      ((request: never, response: never, next: () => void) => void) | undefined;
    const plugin = pluginInspectionPlugin({ dataRoot, workspaceRoot });
    const configureServer =
      typeof plugin.configureServer === "function"
        ? plugin.configureServer
        : plugin.configureServer?.handler;
    await configureServer?.call(
      {} as never,
      {
        httpServer: { once() {} },
        middlewares: {
          use(handler: typeof middleware) {
            middleware = handler;
          },
        },
      } as never,
    );
    if (!middleware) throw new Error("middleware was not registered");

    const status = (
      host: string,
      origin?: string,
      localAddress = "127.0.0.1",
      localPort = 5173,
    ) =>
      new Promise<number>((resolve) => {
        let statusCode = 0;
        middleware!(
          {
            method: "GET",
            url: "/bb-mate-session.json",
            headers: { host, ...(origin === undefined ? {} : { origin }) },
            socket: { localAddress, localPort },
          } as never,
          {
            set statusCode(value: number) {
              statusCode = value;
            },
            get statusCode() {
              return statusCode;
            },
            setHeader() {},
            end() {
              resolve(statusCode);
            },
          } as never,
          () => resolve(-1),
        );
      });

    for (const host of [
      "localhost:0",
      "localhost:65536",
      "localhost:080",
      " localhost",
      "localhost ",
      "localhost,evil.example",
      "user@localhost",
      "localhost/path",
    ]) {
      expect(await status(host)).toBe(403);
    }
    for (const origin of [
      "null",
      "https://localhost:5173",
      "http://evil.example",
      "http://localhost:5173, http://evil.example",
    ]) {
      expect(await status("localhost:5173", origin)).toBe(403);
    }
    expect(await status("localhost:5173", undefined, "192.168.1.2")).toBe(403);
    expect(
      await status("localhost:4173", "http://localhost:4173", "127.0.0.1"),
    ).toBe(403);
    expect(await status("localhost", "http://localhost", "127.0.0.1", 80)).toBe(
      200,
    );
    expect(await status("[::1]:5173", "http://[::1]:5173", "::1")).toBe(200);
  });

  test("rejects remote Vite host exposure", async () => {
    const { dataRoot, workspaceRoot } = await fixture();
    const plugin = pluginInspectionPlugin({ dataRoot, workspaceRoot });
    const configResolved =
      typeof plugin.configResolved === "function"
        ? plugin.configResolved
        : plugin.configResolved?.handler;
    expect(() =>
      configResolved?.call(
        {} as never,
        {
          server: { host: true },
          preview: { host: undefined },
        } as never,
      ),
    ).toThrow("loopback-only");
  });
});

async function dataDigest(dataRoot: string): Promise<string> {
  const hash = createHash("sha256");
  const entries = (await fs.readdir(dataRoot)).sort();
  for (const entry of entries) {
    const value = await fs
      .readFile(path.join(dataRoot, entry))
      .catch(() => null);
    if (value) hash.update(entry).update(value);
  }
  return hash.digest("hex");
}
