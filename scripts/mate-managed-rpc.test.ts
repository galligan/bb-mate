import { describe, expect, test } from "bun:test";
import {
  assertCatalogRefresh,
  parseMateSnapshot,
  type MateSnapshot,
} from "./mate-managed-rpc.ts";

const linearId = "a".repeat(32);
const workbenchId = "b".repeat(32);

function snapshot(): MateSnapshot {
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
      items: [
        {
          id: "bb_mate",
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
                pluginId: "plugin-workbench",
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

describe("managed Mate RPC proof codec", () => {
  test("accepts only the exact finite API 2 schema v3 grouped snapshot", () => {
    expect(parseMateSnapshot(snapshot())).toEqual(snapshot());
    expect(() =>
      parseMateSnapshot({ ...snapshot(), baseUrl: "http://127.0.0.1:1" }),
    ).toThrow("snapshot keys");
    expect(() =>
      parseMateSnapshot({
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
      parseMateSnapshot({
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
        items: snapshot().projects.items.map((project) => ({
          ...project,
          scan: { state: "not_scanned", items: [] },
        })),
      },
    };
    expect(parseMateSnapshot(idle)).toEqual(parseMateSnapshot(idle));
    expect(() =>
      parseMateSnapshot({ ...idle, runtimeVersion: "0.1.0-alpha.3" }),
    ).toThrow("snapshot values");
  });

  test("requires stable grouped identities and nondecreasing target revisions", () => {
    const first = parseMateSnapshot(snapshot());
    const refreshed = parseMateSnapshot({
      ...snapshot(),
      projects: {
        state: "ready",
        items: snapshot().projects.items.map((project) =>
          project.id === "bb_mate"
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
        parseMateSnapshot({
          ...snapshot(),
          projects: {
            state: "ready",
            items: snapshot().projects.items.map((project) =>
              project.id === "bb_mate"
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

  test("accepts truncated partial catalogs and requires partial rows to propagate", () => {
    const truncated = {
      ...snapshot(),
      projects: { ...snapshot().projects, state: "partial" },
    };
    expect(parseMateSnapshot(truncated).projects.state).toBe("partial");

    const partial = {
      ...snapshot(),
      projects: {
        state: "partial",
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
    expect(parseMateSnapshot(partial).projects.state).toBe("partial");
    expect(() =>
      parseMateSnapshot({
        ...partial,
        projects: { ...partial.projects, state: "ready" },
      }),
    ).toThrow("project catalog values");
  });

  test("bounds total projected target entries across duplicate project fan-out", () => {
    const fanout = (targetsPerProject: number) => ({
      ...snapshot(),
      projects: {
        state: "ready",
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

    expect(parseMateSnapshot(fanout(64)).projects.state).toBe("ready");
    expect(() => parseMateSnapshot(fanout(65))).toThrow(
      "too many target entries",
    );
  });
});
