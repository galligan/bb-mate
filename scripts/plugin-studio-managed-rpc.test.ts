import { describe, expect, test } from "bun:test";
import {
  assertCatalogRefresh,
  parseStudioSnapshot,
  type StudioSnapshot,
} from "./plugin-studio-managed-rpc.ts";

const linearId = "a".repeat(32);
const workbenchId = "b".repeat(32);

function snapshot(): StudioSnapshot {
  return {
    schemaVersion: 3,
    runtimeState: "ready",
    reason: null,
    runtimeVersion: "0.1.0-alpha.3",
    apiVersion: 2,
    canStart: false,
    browserLaunch: "unavailable",
    projects: {
      state: "ready",
      truncated: false,
      items: [
        {
          id: "bb_plugin_studio",
          label: "bb Plugin Studio",
          activity: { active: false, lastThreadUpdatedAt: null },
          scan: {
            state: "ready",
            items: [
              {
                id: linearId,
                label: "Linear",
                pluginId: "linear",
                revision: 1,
              },
              {
                id: workbenchId,
                label: "Plugin Studio",
                pluginId: "plugin-studio",
                revision: 1,
              },
            ],
          },
        },
        {
          id: "grid",
          label: "grid",
          activity: { active: true, lastThreadUpdatedAt: 42 },
          scan: { state: "ready", items: [] },
        },
      ],
    },
  };
}

describe("managed Studio RPC proof codec", () => {
  test("accepts only the exact finite API 2 schema v3 grouped snapshot", () => {
    expect(parseStudioSnapshot(snapshot())).toEqual(snapshot());
    expect(() =>
      parseStudioSnapshot({ ...snapshot(), baseUrl: "http://127.0.0.1:1" }),
    ).toThrow("snapshot keys");
    expect(() =>
      parseStudioSnapshot({
        ...snapshot(),
        projects: {
          state: "ready",
          items: [
            { ...snapshot().projects.items[0], path: "/private" },
            snapshot().projects.items[1],
          ],
        },
      }),
    ).toThrow("project option keys");
    expect(() =>
      parseStudioSnapshot({
        ...snapshot(),
        projects: {
          state: "ready",
          items: [
            {
              ...snapshot().projects.items[0],
              scan: {
                state: "ready",
                items: [
                  {
                    ...snapshot().projects.items[0]!.scan.items[0],
                    token: "secret",
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toThrow("target summary keys");
  });

  test("accepts read-only idle project options and rejects incoherent identity", () => {
    const idle = {
      ...snapshot(),
      runtimeState: "idle",
      runtimeVersion: null,
      apiVersion: null,
      canStart: true,
      projects: {
        state: "ready",
        truncated: false,
        items: snapshot().projects.items.map((project) => ({
          ...project,
          scan: { state: "not_scanned", items: [] },
        })),
      },
    };
    expect(parseStudioSnapshot(idle)).toEqual(parseStudioSnapshot(idle));
    expect(() =>
      parseStudioSnapshot({ ...idle, runtimeVersion: "0.1.0-alpha.3" }),
    ).toThrow("snapshot values");
  });

  test("requires stable grouped identities and nondecreasing target revisions", () => {
    const first = parseStudioSnapshot(snapshot());
    const refreshed = parseStudioSnapshot({
      ...snapshot(),
      projects: {
        state: "ready",
        truncated: false,
        items: snapshot().projects.items.map((project) =>
          project.id === "bb_plugin_studio"
            ? {
                ...project,
                scan: {
                  state: "ready",
                  items: project.scan.items.map((target) => ({
                    ...target,
                    revision: target.revision + 1,
                  })),
                },
              }
            : project,
        ),
      },
    });
    expect(() => assertCatalogRefresh(first, refreshed)).not.toThrow();
    expect(() => assertCatalogRefresh(first, first)).not.toThrow();
    expect(() => assertCatalogRefresh(refreshed, first)).toThrow("regress");
    expect(() =>
      assertCatalogRefresh(
        first,
        parseStudioSnapshot({
          ...snapshot(),
          projects: {
            state: "ready",
            truncated: false,
            items: snapshot().projects.items.map((project) =>
              project.id === "bb_plugin_studio"
                ? {
                    ...project,
                    scan: {
                      state: "ready",
                      items: project.scan.items.map((target, index) =>
                        index === 0
                          ? { ...target, id: "c".repeat(32), revision: 2 }
                          : { ...target, revision: 2 },
                      ),
                    },
                  }
                : project,
            ),
          },
        }),
      ),
    ).toThrow("identity");
  });

  test("distinguishes inventory truncation from project scan failure", () => {
    const truncated = {
      ...snapshot(),
      projects: {
        ...snapshot().projects,
        state: "partial" as const,
        truncated: true,
      },
    };
    expect(parseStudioSnapshot(truncated).projects).toEqual(truncated.projects);
    expect(() =>
      parseStudioSnapshot({
        ...snapshot(),
        projects: {
          state: "ready",
          items: snapshot().projects.items,
        },
      }),
    ).toThrow("project catalog keys");
    expect(() =>
      parseStudioSnapshot({
        ...snapshot(),
        projects: { ...snapshot().projects, truncated: true },
      }),
    ).toThrow("project catalog values");
    expect(() =>
      parseStudioSnapshot({
        ...snapshot(),
        projects: {
          ...snapshot().projects,
          state: "partial",
          truncated: false,
        },
      }),
    ).toThrow("project catalog values");

    const partial = {
      ...snapshot(),
      projects: {
        state: "partial",
        truncated: false,
        items: snapshot().projects.items.map((project) =>
          project.id === "grid"
            ? {
                ...project,
                scan: {
                  state: "unavailable",
                  reason: "scan_failed",
                  items: [],
                },
              }
            : project,
        ),
      },
    };
    expect(parseStudioSnapshot(partial).projects.state).toBe("partial");
    expect(() =>
      parseStudioSnapshot({
        ...partial,
        projects: { ...partial.projects, state: "ready" },
      }),
    ).toThrow("project catalog values");

    expect(
      parseStudioSnapshot({
        ...snapshot(),
        projects: { state: "unavailable", items: [] },
      }).projects,
    ).toEqual({ state: "unavailable", items: [] });
    expect(() =>
      parseStudioSnapshot({
        ...snapshot(),
        projects: { state: "unavailable", truncated: false, items: [] },
      }),
    ).toThrow("project catalog keys");
  });

  test("bounds total projected target entries across duplicate project fan-out", () => {
    const fanout = (targetsPerProject: number) => ({
      ...snapshot(),
      projects: {
        state: "ready",
        truncated: false,
        items: ["project_1", "project_2"].map((id) => ({
          id,
          label: id,
          activity: { active: false, lastThreadUpdatedAt: null },
          scan: {
            state: "ready",
            items: Array.from({ length: targetsPerProject }, (_, index) => ({
              id: String(index).padStart(32, "0"),
              label: `Plugin ${index}`,
              pluginId: `plugin-${index}`,
              revision: 1,
            })),
          },
        })),
      },
    });

    expect(parseStudioSnapshot(fanout(64)).projects.state).toBe("ready");
    expect(() => parseStudioSnapshot(fanout(65))).toThrow(
      "too many target entries",
    );
  });
});
