import { describe, expect, mock, test } from "bun:test";
import type { BbPluginApi } from "@bb/plugin-sdk";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RuntimeSupervisorSnapshot } from "./runtime-supervisor.ts";

mock.module("@bb/plugin-sdk", () => ({
  defineRpcContract: <T>(contract: T) => contract,
}));
const { createStudioPlugin, rpcContract } = await import("./plugin.ts");

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
const failed: RuntimeSupervisorSnapshot = {
  ...idle,
  runtimeState: "failed",
  reason: "startup_failed",
};
const unavailable: RuntimeSupervisorSnapshot = {
  ...idle,
  runtimeState: "unavailable",
  reason: "artifact_missing",
  canStart: false,
};

const source = (projectId: string, suffix = projectId) => ({
  id: `source-${suffix}`,
  projectId,
  updatedAt: 1,
  type: "local_path" as const,
  hostId: "host-1",
  path: `/Users/test/${suffix}`,
});

const project = (id: string, name: string, overrides = {}) => ({
  id,
  name,
  sources: [source(id)],
  threads: [],
  ...overrides,
});

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-plugin-test-"));

function hostFixture(
  supervisor: Parameters<typeof createStudioPlugin>[0],
  options: {
    projects?: ReturnType<typeof project>[];
    listProjects?: () => Promise<ReturnType<typeof project>[]>;
    getProject?: (projectId: string) => Promise<ReturnType<typeof project>>;
    systemConfig?: () => Promise<{
      primaryHostId: string | null;
      dataDir: string;
    }>;
    allocateStorage?: () => unknown;
  } = {},
) {
  let handlers: Record<string, (input: never) => unknown> | undefined;
  let service: { start(signal: AbortSignal): void | Promise<void> } | undefined;
  let dispose: (() => void | Promise<void>) | undefined;
  const projects = options.projects ?? [project("project-1", "Example")];
  const bb = {
    storage: { database: options.allocateStorage ?? (() => ({})) },
    sdk: {
      system: {
        config:
          options.systemConfig ??
          (async () => ({ primaryHostId: "host-1", dataDir })),
      },
      projects: {
        list: options.listProjects ?? (async () => projects),
        get: async ({ projectId }: { projectId: string }) =>
          options.getProject?.(projectId) ??
          projects.find(({ id }) => id === projectId)!,
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
  createStudioPlugin(supervisor, {
    createProjectKey: (() => {
      let index = 0;
      return () => String(++index).padStart(32, "0");
    })(),
  })(bb);
  return {
    handlers: () => handlers!,
    service: () => service!,
    dispose: () => dispose!,
  };
}

describe("Plugin Studio backend v3", () => {
  test("keeps status read-only and refreshes every stable project in one batch", async () => {
    let ensures = 0;
    let allocations = 0;
    const admissions: unknown[] = [];
    const projects = [
      project("project-1", "One"),
      project("project-2", "Two", {
        sources: [source("project-2", "two")],
      }),
    ];
    const host = hostFixture(
      {
        status: () => idle,
        async ensure(dataRoot) {
          ensures += 1;
          expect(dataRoot).toBe(
            `${await fs.realpath(dataDir)}/plugins/studio/runtime`,
          );
          return ready;
        },
        async admitProjects(input) {
          admissions.push(input);
          return {
            schemaVersion: 2,
            state: "ready",
            projects: input.projects.map(({ projectKey }, index) => ({
              projectKey,
              state: "ready" as const,
              targets: [
                {
                  id: String(index + 1).repeat(32),
                  revision: 1,
                  displayName: `Plugin ${index + 1}`,
                  manifest: { pluginId: `plugin-${index + 1}` },
                },
              ],
            })),
          };
        },
        async runService() {},
        async stop() {},
      },
      {
        projects,
        allocateStorage() {
          allocations += 1;
          return {};
        },
      },
    );

    expect(await host.handlers().status({} as never)).toMatchObject({
      schemaVersion: 3,
      runtimeState: "idle",
      projects: {
        state: "ready",
        truncated: false,
        items: [
          { id: "project-1", scan: { state: "not_scanned" } },
          { id: "project-2", scan: { state: "not_scanned" } },
        ],
      },
    });
    expect(ensures).toBe(0);
    expect(allocations).toBe(0);

    expect(await host.handlers().refresh({} as never)).toMatchObject({
      schemaVersion: 3,
      runtimeState: "ready",
      projects: {
        state: "ready",
        truncated: false,
        items: [
          {
            id: "project-1",
            scan: { state: "ready", items: [{ pluginId: "plugin-1" }] },
          },
          {
            id: "project-2",
            scan: { state: "ready", items: [{ pluginId: "plugin-2" }] },
          },
        ],
      },
    });
    expect(ensures).toBe(1);
    expect(allocations).toBe(1);
    expect(admissions).toEqual([
      {
        inventoryState: "complete",
        projects: [
          {
            projectKey: "00000000000000000000000000000001",
            sourcePath: "/Users/test/project-1",
          },
          {
            projectKey: "00000000000000000000000000000002",
            sourcePath: "/Users/test/two",
          },
        ],
      },
    ]);
  });

  test("marks a truncated eligible project inventory partial before admission", async () => {
    let admission: unknown;
    const projects = Array.from({ length: 129 }, (_, index) => {
      const id = `project-${String(index).padStart(3, "0")}`;
      return project(id, `Project ${String(index).padStart(3, "0")}`, {
        sources: [source(id)],
      });
    });
    const host = hostFixture(
      {
        status: () => idle,
        async ensure() {
          return ready;
        },
        async admitProjects(input) {
          admission = input;
          return {
            schemaVersion: 2,
            state: "ready",
            projects: input.projects.map(({ projectKey }, index) => ({
              projectKey,
              state: index === 0 ? ("partial" as const) : ("ready" as const),
              targets: [],
            })),
          };
        },
        async runService() {},
        async stop() {},
      },
      { projects },
    );

    expect(await host.handlers().status({} as never)).toMatchObject({
      projects: { state: "partial", truncated: true },
    });

    const result = (await host.handlers().refresh({} as never)) as {
      projects: {
        state: string;
        truncated: boolean;
        items: { scan: { state: string; items: unknown[] } }[];
      };
    };

    expect(result.projects.items).toHaveLength(128);
    expect(result.projects.state).toBe("partial");
    expect(result.projects.truncated).toBe(true);
    expect(result.projects.items[0]?.scan).toEqual({
      state: "partial",
      items: [],
    });
    const admitted = admission as {
      inventoryState: string;
      projects: { sourcePath: string }[];
    };
    expect(admitted.inventoryState).toBe("partial");
    expect(admitted.projects).toHaveLength(128);
    expect(admitted.projects[0]?.sourcePath).toBe("/Users/test/project-000");
  });

  test("finishes every project scan when runtime startup is terminal", async () => {
    const projects = Array.from({ length: 129 }, (_, index) => {
      const id = `terminal-${String(index).padStart(3, "0")}`;
      return project(id, `Terminal ${index}`, {
        sources: [source(id)],
      });
    });
    for (const terminal of [failed, unavailable]) {
      let ensures = 0;
      let admissions = 0;
      let runtime = idle;
      const host = hostFixture(
        {
          status: () => runtime,
          async ensure() {
            ensures += 1;
            runtime = terminal;
            return terminal;
          },
          async admitProjects() {
            admissions += 1;
            throw new Error("/private/admission/should-not-run");
          },
          async runService() {},
          async stop() {},
        },
        { projects },
      );

      const statusResult = (await host.handlers().status({} as never)) as {
        runtimeState: string;
        projects: {
          state: string;
          truncated: boolean;
          items: { scan: unknown }[];
        };
      };
      expect(statusResult).toMatchObject({
        runtimeState: "idle",
        projects: {
          state: "partial",
          truncated: true,
        },
      });
      expect(statusResult.projects.items).toHaveLength(128);
      expect(
        statusResult.projects.items.every(
          ({ scan }) =>
            JSON.stringify(scan) ===
            JSON.stringify({ state: "not_scanned", items: [] }),
        ),
      ).toBe(true);
      const [result, concurrent] = await Promise.all([
        host.handlers().refresh({} as never),
        host.handlers().refresh({} as never),
      ]);
      expect(concurrent).toEqual(result);
      const terminalResult = result as {
        projects: { items: { scan: unknown }[] };
      };
      expect(result).toMatchObject({
        runtimeState: terminal.runtimeState,
        reason: terminal.reason,
        runtimeVersion: null,
        apiVersion: null,
        canStart: terminal.canStart,
        projects: {
          state: "partial",
          truncated: true,
        },
      });
      expect(terminalResult.projects.items).toHaveLength(128);
      expect(
        terminalResult.projects.items.every(
          ({ scan }) =>
            JSON.stringify(scan) ===
            JSON.stringify({
              state: "unavailable",
              reason: "scan_failed",
              items: [],
            }),
        ),
      ).toBe(true);
      expect(ensures).toBe(1);
      expect(admissions).toBe(0);
      expect(JSON.stringify(result)).not.toContain("/Users/test");
      expect(JSON.stringify(result)).not.toContain("/private/admission");
    }
  });

  test("attests a complete empty inventory while list failures make no runtime demand", async () => {
    const admissions: unknown[] = [];
    let ensures = 0;
    const supervisor: Parameters<typeof createStudioPlugin>[0] = {
      status: () => idle,
      async ensure() {
        ensures += 1;
        return ready;
      },
      async admitProjects(input) {
        admissions.push(input);
        return { schemaVersion: 2, state: "ready" as const, projects: [] };
      },
      async runService() {},
      async stop() {},
    };
    const empty = hostFixture(supervisor, { projects: [] });
    expect(await empty.handlers().refresh({} as never)).toMatchObject({
      runtimeState: "ready",
      projects: { state: "ready", truncated: false, items: [] },
    });
    expect(ensures).toBe(1);
    expect(admissions).toEqual([{ inventoryState: "complete", projects: [] }]);

    const failed = hostFixture(supervisor, {
      listProjects: async () => {
        throw new Error("/private/list/failure");
      },
    });
    const result = await failed.handlers().refresh({} as never);
    expect(result).toMatchObject({
      runtimeState: "idle",
      projects: { state: "unavailable", items: [] },
    });
    expect(ensures).toBe(1);
    expect(admissions).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("/private/list/failure");
  });

  test("exports only strict empty status and refresh inputs", () => {
    expect(rpcContract.status.input.safeParse({}).success).toBe(true);
    expect(rpcContract.refresh.input.safeParse({}).success).toBe(true);
    expect(
      rpcContract.refresh.input.safeParse({ projectId: "private" }).success,
    ).toBe(false);
    expect("admit" in rpcContract).toBe(false);
  });

  test("does not attest or scan when any source changes during revalidation", async () => {
    const before = [project("project-1", "One"), project("project-2", "Two")];
    const after = [
      project("project-1", "One"),
      project("project-2", "Two", {
        sources: [
          {
            ...source("project-2"),
            updatedAt: 2,
            path: "/private/changed",
          },
        ],
      }),
    ];
    let lists = 0;
    let ensures = 0;
    let admitted: unknown;
    let runtime = idle;
    const failed: RuntimeSupervisorSnapshot = {
      ...idle,
      runtimeState: "failed",
      reason: "startup_failed",
    };
    const host = hostFixture(
      {
        status: () => runtime,
        async ensure() {
          ensures += 1;
          runtime = ready;
          return ready;
        },
        async admitProjects(input) {
          admitted = input;
          return {
            schemaVersion: 2,
            state: "ready",
            projects: input.projects.map(({ projectKey }) => ({
              projectKey,
              state: "ready" as const,
              targets: [],
            })),
          };
        },
        async runService() {},
        async stop() {},
      },
      {
        listProjects: async () => {
          lists += 1;
          if (lists === 1) return before;
          runtime = failed;
          return after;
        },
      },
    );

    const [result, concurrent] = await Promise.all([
      host.handlers().refresh({} as never),
      host.handlers().refresh({} as never),
    ]);
    expect(concurrent).toEqual(result);
    expect(result).toMatchObject({
      runtimeState: "failed",
      reason: "startup_failed",
      runtimeVersion: null,
      apiVersion: null,
      canStart: true,
      projects: {
        state: "partial",
        truncated: false,
        items: [
          {
            id: "project-1",
            scan: {
              state: "unavailable",
              reason: "source_changed",
              items: [],
            },
          },
          {
            id: "project-2",
            scan: {
              state: "unavailable",
              reason: "source_changed",
              items: [],
            },
          },
        ],
      },
    });
    expect(admitted).toBeUndefined();
    expect(ensures).toBe(1);
    expect(lists).toBe(2);
    expect(JSON.stringify(result)).not.toContain("/private/changed");
  });

  test("revalidates each listed source against the authoritative project record", async () => {
    const projects = [project("project-1", "One"), project("project-2", "Two")];
    let admitted: unknown;
    const host = hostFixture(
      {
        status: () => idle,
        async ensure() {
          return ready;
        },
        async admitProjects(input) {
          admitted = input;
          return { schemaVersion: 2, state: "ready" as const, projects: [] };
        },
        async runService() {},
        async stop() {},
      },
      {
        projects,
        getProject: async (projectId) =>
          projectId === "project-2"
            ? project(projectId, "Two", {
                sources: [
                  {
                    ...source(projectId),
                    updatedAt: 2,
                    path: "/private/moved",
                  },
                ],
              })
            : projects[0]!,
      },
    );

    const result = await host.handlers().refresh({} as never);

    expect(admitted).toBeUndefined();
    expect(result).toMatchObject({
      projects: {
        state: "partial",
        truncated: false,
        items: [
          { scan: { state: "unavailable", reason: "source_changed" } },
          { scan: { state: "unavailable", reason: "source_changed" } },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("/private/moved");
  });

  test("shares concurrent refresh demand and redacts a batch failure", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let admissions = 0;
    let allocations = 0;
    let runtime = idle;
    const failed: RuntimeSupervisorSnapshot = {
      ...idle,
      runtimeState: "failed",
      reason: "startup_failed",
    };
    const host = hostFixture(
      {
        status: () => runtime,
        async ensure() {
          runtime = ready;
          return ready;
        },
        async admitProjects() {
          admissions += 1;
          await held;
          runtime = failed;
          throw new Error("/private/runtime/failure");
        },
        async runService() {},
        async stop() {},
      },
      {
        allocateStorage() {
          allocations += 1;
          return {};
        },
      },
    );

    const first = host.handlers().refresh({} as never);
    const second = host.handlers().refresh({} as never);
    while (admissions === 0)
      await new Promise<void>((resolve) => setImmediate(resolve));
    expect(admissions).toBe(1);
    release();
    const [left, right] = await Promise.all([first, second]);
    expect(left).toEqual(right);
    expect(left).toMatchObject({
      runtimeState: "failed",
      reason: "startup_failed",
      runtimeVersion: null,
      apiVersion: null,
      canStart: true,
      projects: {
        state: "partial",
        truncated: false,
        items: [
          {
            scan: {
              state: "unavailable",
              reason: "scan_failed",
              items: [],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(left)).not.toContain("/private/runtime/failure");
    expect(allocations).toBe(1);
  });

  test("keeps a partial project beside a ready sibling", async () => {
    const host = hostFixture(
      {
        status: () => idle,
        async ensure() {
          return ready;
        },
        async admitProjects(input) {
          return {
            schemaVersion: 2,
            state: "partial",
            projects: input.projects.map(({ projectKey }, index) => ({
              projectKey,
              state: index === 0 ? ("partial" as const) : ("ready" as const),
              targets: [],
            })),
          };
        },
        async runService() {},
        async stop() {},
      },
      {
        projects: [project("project-1", "One"), project("project-2", "Two")],
      },
    );

    expect(await host.handlers().refresh({} as never)).toMatchObject({
      projects: {
        state: "partial",
        items: [
          { id: "project-1", scan: { state: "partial", items: [] } },
          { id: "project-2", scan: { state: "ready", items: [] } },
        ],
      },
    });
  });

  test("normalizes browser-unsafe runtime labels without losing sibling project scans", async () => {
    const host = hostFixture(
      {
        status: () => idle,
        async ensure() {
          return ready;
        },
        async admitProjects(input) {
          return {
            schemaVersion: 2,
            state: "ready",
            projects: input.projects.map(({ projectKey }, index) => ({
              projectKey,
              state: "ready" as const,
              targets: [
                {
                  id: String(index + 1).repeat(32),
                  revision: 1,
                  displayName:
                    index === 0 ? "Tools/Experimental" : "A".repeat(129),
                  manifest: { pluginId: `plugin-${index + 1}` },
                },
              ],
            })),
          };
        },
        async runService() {},
        async stop() {},
      },
      {
        projects: [
          project("project-unsafe-name", "Client / API"),
          project("project-long-target", "Long target"),
          project("project-safe", "Safe sibling"),
        ],
      },
    );

    const result = await host.handlers().refresh({} as never);
    expect(result).toMatchObject({
      projects: {
        state: "ready",
        truncated: false,
        items: [
          {
            id: "project-unsafe-name",
            label: "Project project-unsafe-name",
            scan: { state: "ready", items: [{ label: "plugin-1" }] },
          },
          {
            id: "project-long-target",
            scan: { state: "ready", items: [{ label: "plugin-2" }] },
          },
          {
            id: "project-safe",
            scan: { state: "ready", items: [{ label: "plugin-3" }] },
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("Tools/Experimental");
    expect(JSON.stringify(result)).not.toContain("A".repeat(129));
  });
});
