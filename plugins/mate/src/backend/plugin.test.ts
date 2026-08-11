import { describe, expect, mock, test } from "bun:test";
import type { BbPluginApi } from "@bb/plugin-sdk";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RuntimeSupervisorSnapshot } from "./runtime-supervisor.ts";

mock.module("@bb/plugin-sdk", () => ({
  defineRpcContract: <T>(contract: T) => contract,
}));
const { createMatePlugin, rpcContract } = await import("./plugin.ts");

const idle: RuntimeSupervisorSnapshot = {
  schemaVersion: 2,
  runtimeState: "idle",
  reason: null,
  runtimeVersion: null,
  apiVersion: null,
  canStart: true,
  browserLaunch: "unavailable",
};
const ready: RuntimeSupervisorSnapshot = {
  ...idle,
  runtimeState: "ready",
  runtimeVersion: "0.1.0-alpha.2",
  apiVersion: 2,
  canStart: false,
};

const project = {
  id: "project-1",
  name: "Example",
  sources: [
    {
      id: "source-1",
      projectId: "project-1",
      updatedAt: 1,
      type: "local_path" as const,
      hostId: "host-1",
      path: "/Users/test/project",
    },
  ],
};
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "mate-plugin-test-"));

function hostFixture(
  supervisor: Parameters<typeof createMatePlugin>[0],
  options: {
    getProject?: () => Promise<typeof project>;
    allocateStorage?: () => unknown;
  } = {},
) {
  let handlers: Record<string, (input: never) => unknown> | undefined;
  let service: { start(signal: AbortSignal): void | Promise<void> } | undefined;
  let dispose: (() => void | Promise<void>) | undefined;
  const bb = {
    storage: {
      database: options.allocateStorage ?? (() => ({})),
    },
    sdk: {
      system: {
        config: async () => ({
          primaryHostId: "host-1",
          dataDir,
        }),
      },
      projects: {
        list: async () => [project],
        get: options.getProject ?? (async () => project),
      },
    },
    rpc: {
      register: (_contract: unknown, value: typeof handlers) =>
        (handlers = value),
    },
    background: {
      service: (_name: string, value: typeof service) => (service = value),
    },
    onDispose: (value: typeof dispose) => (dispose = value),
  } as unknown as BbPluginApi;
  createMatePlugin(supervisor)(bb);
  return {
    handlers: () => handlers!,
    service: () => service!,
    dispose: () => dispose!,
  };
}

describe("Plugin Workbench backend v2", () => {
  test("exports exact status and admit contracts without ensure", () => {
    expect(rpcContract.status.input.safeParse({}).success).toBe(true);
    expect(
      rpcContract.admit.input.safeParse({ projectId: "project-1" }).success,
    ).toBe(true);
    expect(
      rpcContract.admit.input.safeParse({ projectId: "../private" }).success,
    ).toBe(false);
    expect("ensure" in rpcContract).toBe(false);
  });

  test("keeps status read-only and admits only after a stable source re-fetch", async () => {
    let ensures = 0;
    let admissions = 0;
    let allocations = 0;
    const host = hostFixture(
      {
        status: () => idle,
        async ensure(dataRoot) {
          ensures += 1;
          expect(allocations).toBe(1);
          expect(dataRoot).toBe(
            `${await fs.realpath(dataDir)}/plugins/mate/runtime`,
          );
          return ready;
        },
        async admitCurrentProject(sourcePath) {
          admissions += 1;
          expect(sourcePath).toBe("/Users/test/project");
          return {
            state: "ready",
            targets: [
              {
                id: "t".repeat(32),
                revision: 1,
                displayName: "Example plugin",
                manifest: { pluginId: "example" },
              },
            ],
          };
        },
        async runService(signal) {
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
        },
        async stop() {},
      },
      {
        allocateStorage() {
          allocations += 1;
          return {};
        },
      },
    );

    expect(await host.handlers().status({} as never)).toMatchObject({
      schemaVersion: 2,
      projects: { state: "ready" },
      targets: { state: "unavailable", reason: "runtime_not_ready" },
    });
    expect(ensures).toBe(0);
    expect(allocations).toBe(0);
    expect(
      await host.handlers().admit({ projectId: "project-1" } as never),
    ).toMatchObject({
      runtimeState: "ready",
      targets: {
        state: "ready",
        items: [{ pluginId: "example", revision: 1 }],
      },
    });
    expect(ensures).toBe(1);
    expect(admissions).toBe(1);
    expect(allocations).toBe(1);
  });

  test("shares lifecycle registration and never echoes a private admission failure", async () => {
    let stops = 0;
    let current = idle;
    const host = hostFixture({
      status: () => current,
      async ensure() {
        current = ready;
        return ready;
      },
      async admitCurrentProject() {
        throw new Error("/private/leak");
      },
      async runService(signal) {
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      },
      async stop() {
        stops += 1;
      },
    });
    expect(
      await host.handlers().admit({ projectId: "project-1" } as never),
    ).toMatchObject({
      targets: { state: "unavailable", reason: "catalog_unavailable" },
    });
    const controller = new AbortController();
    const serving = Promise.resolve(host.service().start(controller.signal));
    controller.abort();
    await serving;
    await host.dispose()();
    expect(stops).toBe(1);
  });

  test("rejects generically when the released project source changes during startup", async () => {
    let reads = 0;
    let admissions = 0;
    const host = hostFixture(
      {
        status: () => ready,
        async ensure() {
          return ready;
        },
        async admitCurrentProject() {
          admissions += 1;
          return { state: "ready", targets: [] };
        },
        async runService() {},
        async stop() {},
      },
      {
        async getProject() {
          reads += 1;
          return {
            ...project,
            sources: project.sources.map((source) => ({
              ...source,
              updatedAt: reads,
            })),
          };
        },
      },
    );
    await expect(
      host.handlers().admit({ projectId: "project-1" } as never),
    ).rejects.toThrow("Project source unavailable.");
    expect(reads).toBe(2);
    expect(admissions).toBe(0);
  });

  test("contains host-native storage allocation failure before runtime demand", async () => {
    let ensures = 0;
    const host = hostFixture(
      {
        status: () => idle,
        async ensure() {
          ensures += 1;
          return ready;
        },
        async admitCurrentProject() {
          throw new Error("must not admit");
        },
        async runService() {},
        async stop() {},
      },
      {
        allocateStorage() {
          throw new Error("/private/plugin/data.db");
        },
      },
    );
    await expect(
      host.handlers().admit({ projectId: "project-1" } as never),
    ).rejects.toThrow("Project source unavailable.");
    expect(ensures).toBe(0);
  });
});
