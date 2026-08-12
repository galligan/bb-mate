import { describe, expect, test } from "bun:test";

import {
  parsePluginWorkbenchRefreshInput,
  parsePluginWorkbenchSnapshot,
  parsePluginWorkbenchStatusInput,
  type PluginWorkbenchSnapshot,
} from "./workbench-snapshot";

const target = {
  id: "abcdefghijklmnopqrstuvwxzy012345",
  label: "Plugin Studio",
  pluginId: "mate",
  revision: 3,
} as const;

const readySnapshot: PluginWorkbenchSnapshot = {
  schemaVersion: 3,
  runtimeState: "ready",
  reason: null,
  runtimeVersion: "0.7.0",
  apiVersion: 2,
  canStart: false,
  browserLaunch: "unavailable",
  projects: {
    state: "partial",
    truncated: false,
    items: [
      {
        id: "project_01",
        label: "bb Plugin Studio",
        activity: { active: true, lastThreadUpdatedAt: 42 },
        scan: { state: "ready", items: [target] },
      },
      {
        id: "project_02",
        label: "Empty",
        activity: { active: false, lastThreadUpdatedAt: null },
        scan: { state: "partial", items: [] },
      },
    ],
  },
};

describe("Plugin Studio frontend snapshot", () => {
  test("accepts the strict path-free grouped v3 projection", () => {
    expect(parsePluginWorkbenchSnapshot(readySnapshot)).toEqual(readySnapshot);
  });

  test("accepts read-only status with unscanned projects and finite failures", () => {
    const status = parsePluginWorkbenchSnapshot({
      ...readySnapshot,
      runtimeState: "idle",
      runtimeVersion: null,
      apiVersion: null,
      canStart: true,
      projects: {
        state: "ready",
        truncated: false,
        items: [
          {
            ...readySnapshot.projects.items[0],
            activity: { active: false, lastThreadUpdatedAt: null },
            scan: { state: "not_scanned", items: [] },
          },
        ],
      },
    });
    expect(status.projects.items[0]?.scan).toEqual({
      state: "not_scanned",
      items: [],
    });

    for (const reason of [
      "source_changed",
      "scan_failed",
      "capacity_reached",
    ] as const) {
      expect(
        parsePluginWorkbenchSnapshot({
          ...readySnapshot,
          projects: {
            state: "partial",
            truncated: false,
            items: [
              {
                ...readySnapshot.projects.items[0],
                scan: { state: "unavailable", reason, items: [] },
              },
            ],
          },
        }).projects.items[0]?.scan,
      ).toEqual({ state: "unavailable", reason, items: [] });
    }
  });

  test("requires aggregate partial state when a row is incomplete", () => {
    expect(() =>
      parsePluginWorkbenchSnapshot({
        ...readySnapshot,
        projects: { ...readySnapshot.projects, state: "ready" },
      }),
    ).toThrow("Plugin Studio returned an invalid snapshot.");
    expect(
      parsePluginWorkbenchSnapshot({
        ...readySnapshot,
        projects: {
          state: "partial",
          truncated: true,
          items: [
            {
              ...readySnapshot.projects.items[0],
              scan: { state: "ready", items: [target] },
            },
          ],
        },
      }).projects.state,
    ).toBe("partial");
    expect(() =>
      parsePluginWorkbenchSnapshot({
        ...readySnapshot,
        projects: {
          state: "partial",
          truncated: false,
          items: [
            {
              ...readySnapshot.projects.items[0],
              scan: { state: "ready", items: [target] },
            },
          ],
        },
      }),
    ).toThrow("Plugin Studio returned an invalid snapshot.");
    expect(() =>
      parsePluginWorkbenchSnapshot({
        ...readySnapshot,
        projects: {
          state: "ready",
          truncated: true,
          items: [
            {
              ...readySnapshot.projects.items[0],
              scan: { state: "ready", items: [target] },
            },
          ],
        },
      }),
    ).toThrow("Plugin Studio returned an invalid snapshot.");
    expect(() =>
      parsePluginWorkbenchSnapshot({
        ...readySnapshot,
        projects: {
          state: "partial",
          items: readySnapshot.projects.items,
        },
      }),
    ).toThrow("Plugin Studio returned an invalid snapshot.");
  });

  test("bounds duplicate-root fan-out by total serialized target entries", () => {
    const sharedTargets = Array.from({ length: 100 }, (_, index) => ({
      ...target,
      id: index.toString().padStart(32, "0"),
    }));
    const first = readySnapshot.projects.items[0]!;
    expect(() =>
      parsePluginWorkbenchSnapshot({
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [
            {
              ...first,
              id: "project_a",
              scan: { state: "ready", items: sharedTargets },
            },
            {
              ...first,
              id: "project_b",
              scan: { state: "ready", items: sharedTargets },
            },
          ],
        },
      }),
    ).toThrow("Plugin Studio returned an invalid snapshot.");
  });

  test("rejects private, future, malformed, duplicate, and oversized nested fields", () => {
    const project = readySnapshot.projects.items[0]!;
    const tooManyTargets = Array.from({ length: 129 }, (_, index) => ({
      ...target,
      id: index.toString().padStart(32, "0"),
    }));
    for (const value of [
      { ...readySnapshot, token: "secret" },
      { ...readySnapshot, path: "/private/plugin" },
      {
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [{ ...project, path: "/private/plugin" }],
        },
      },
      {
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [
            { ...project, activity: { ...project.activity, hostId: "host" } },
          ],
        },
      },
      {
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [
            {
              ...project,
              scan: {
                state: "ready",
                items: [{ ...target, baseUrl: "http://127.0.0.1" }],
              },
            },
          ],
        },
      },
      {
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [project, project],
        },
      },
      {
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [
            { ...project, scan: { state: "ready", items: [target, target] } },
          ],
        },
      },
      {
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [
            { ...project, scan: { state: "ready", items: tooManyTargets } },
          ],
        },
      },
      {
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [
            {
              ...project,
              activity: { active: false, lastThreadUpdatedAt: -1 },
            },
          ],
        },
      },
    ]) {
      expect(() => parsePluginWorkbenchSnapshot(value)).toThrow(
        "Plugin Studio returned an invalid snapshot.",
      );
    }
  });

  test("rejects path-shaped labels and malformed target fields", () => {
    const project = readySnapshot.projects.items[0]!;
    for (const label of [
      "/Users/test/plugin",
      "folder/plugin",
      String.raw`C:\Users\test\plugin`,
      ".",
      "..",
      "~",
    ]) {
      expect(() =>
        parsePluginWorkbenchSnapshot({
          ...readySnapshot,
          projects: {
            state: "ready",
            items: [{ ...project, label, scan: { state: "ready", items: [] } }],
          },
        }),
      ).toThrow("Plugin Studio returned an invalid snapshot.");
      expect(() =>
        parsePluginWorkbenchSnapshot({
          ...readySnapshot,
          projects: {
            state: "ready",
            items: [
              {
                ...project,
                scan: { state: "ready", items: [{ ...target, label }] },
              },
            ],
          },
        }),
      ).toThrow("Plugin Studio returned an invalid snapshot.");
    }
    for (const malformed of [
      { ...target, id: "not-opaque" },
      { ...target, pluginId: "Upper_Case" },
      { ...target, revision: 0 },
    ]) {
      expect(() =>
        parsePluginWorkbenchSnapshot({
          ...readySnapshot,
          projects: {
            state: "ready",
            items: [
              {
                ...project,
                scan: { state: "ready", items: [malformed] },
              },
            ],
          },
        }),
      ).toThrow("Plugin Studio returned an invalid snapshot.");
    }
  });

  test("requires coherent finite runtime identity", () => {
    for (const value of [
      { ...readySnapshot, runtimeVersion: null, apiVersion: null },
      {
        ...readySnapshot,
        runtimeState: "idle",
        canStart: true,
      },
      {
        ...readySnapshot,
        runtimeState: "unavailable",
        reason: null,
        runtimeVersion: null,
        apiVersion: null,
      },
    ]) {
      expect(() => parsePluginWorkbenchSnapshot(value)).toThrow(
        "Plugin Studio returned an invalid snapshot.",
      );
    }
  });

  test("accepts only strict empty status and refresh inputs", () => {
    expect(parsePluginWorkbenchStatusInput({})).toEqual({});
    expect(parsePluginWorkbenchRefreshInput({})).toEqual({});
    for (const value of [{ projectId: "project_01" }, { token: "secret" }]) {
      expect(() => parsePluginWorkbenchStatusInput(value)).toThrow(
        "Plugin Studio returned an invalid request.",
      );
      expect(() => parsePluginWorkbenchRefreshInput(value)).toThrow(
        "Plugin Studio returned an invalid request.",
      );
    }
  });
});
