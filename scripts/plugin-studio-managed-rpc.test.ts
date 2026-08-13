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
    schemaVersion: 4,
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
  test("accepts only the exact finite schema-v4 grouped snapshot", () => {
    expect(parseStudioSnapshot(snapshot())).toEqual(snapshot());
    expect(() =>
      parseStudioSnapshot({ ...snapshot(), runtimeState: "ready" }),
    ).toThrow("snapshot keys");
    expect(() =>
      parseStudioSnapshot({ ...snapshot(), schemaVersion: 3 }),
    ).toThrow("snapshot values");
    expect(() =>
      parseStudioSnapshot({
        ...snapshot(),
        projects: {
          state: "ready",
          truncated: false,
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
          truncated: false,
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

  test("rejects unsafe labels, overlong IDs, and duplicate identities", () => {
    for (const label of ["/private", ".", "..", "~", "C:secret", " bad "]) {
      expect(() =>
        parseStudioSnapshot({
          ...snapshot(),
          projects: {
            ...snapshot().projects,
            items: [{ ...snapshot().projects.items[0], label }],
          },
        }),
      ).toThrow("project option values");
    }
    expect(() =>
      parseStudioSnapshot({
        ...snapshot(),
        projects: {
          ...snapshot().projects,
          items: [{ ...snapshot().projects.items[0], id: "p".repeat(129) }],
        },
      }),
    ).toThrow("project option values");
    expect(() =>
      parseStudioSnapshot({
        ...snapshot(),
        projects: {
          ...snapshot().projects,
          items: [snapshot().projects.items[0], snapshot().projects.items[0]],
        },
      }),
    ).toThrow("project IDs are duplicated");
    expect(() =>
      parseStudioSnapshot({
        ...snapshot(),
        projects: {
          ...snapshot().projects,
          items: [
            {
              ...snapshot().projects.items[0],
              scan: {
                state: "ready",
                items: [
                  snapshot().projects.items[0]!.scan.items[0],
                  snapshot().projects.items[0]!.scan.items[0],
                ],
              },
            },
          ],
        },
      }),
    ).toThrow("target IDs are duplicated");
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
        state: "partial" as const,
        truncated: false,
        items: snapshot().projects.items.map((project) =>
          project.id === "grid"
            ? {
                ...project,
                scan: {
                  state: "unavailable" as const,
                  reason: "scan_failed" as const,
                  items: [] as const,
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
  });

  test("bounds project, scan, and total projected target entries", () => {
    const fanout = (projects: number, targetsPerProject: number) => ({
      ...snapshot(),
      projects: {
        state: "ready",
        truncated: false,
        items: Array.from({ length: projects }, (_, projectIndex) => ({
          id: `project_${projectIndex}`,
          label: `Project ${projectIndex}`,
          activity: { active: false, lastThreadUpdatedAt: null },
          scan: {
            state: "ready",
            items: Array.from({ length: targetsPerProject }, (_, index) => ({
              id: `${projectIndex}_${index}`.padStart(32, "0"),
              label: `Plugin ${index}`,
              pluginId: `plugin-${index}`,
              revision: 1,
            })),
          },
        })),
      },
    });
    expect(parseStudioSnapshot(fanout(2, 64)).projects.state).toBe("ready");
    expect(() => parseStudioSnapshot(fanout(2, 65))).toThrow(
      "too many target entries",
    );
    expect(() => parseStudioSnapshot(fanout(1, 129))).toThrow(
      "too many targets",
    );
    expect(() => parseStudioSnapshot(fanout(129, 0))).toThrow(
      "too many projects",
    );
  });
});
