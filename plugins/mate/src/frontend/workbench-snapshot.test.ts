import { describe, expect, test } from "bun:test";

import {
  parsePluginWorkbenchAdmitInput,
  parsePluginWorkbenchSnapshot,
  parsePluginWorkbenchStatusInput,
  type PluginWorkbenchSnapshot,
} from "./workbench-snapshot";

const projectId = "project_01";
const targetId = "abcdefghijklmnopqrstuvwxzy012345";
const readySnapshot: PluginWorkbenchSnapshot = {
  schemaVersion: 2,
  runtimeState: "ready",
  reason: null,
  runtimeVersion: "0.7.0",
  apiVersion: 2,
  canStart: false,
  browserLaunch: "unavailable",
  projects: {
    state: "ready",
    items: [
      { id: projectId, label: "BB Mate", admission: "available" },
      { id: "project_02", label: "Remote", admission: "no_source" },
    ],
  },
  targets: {
    state: "ready",
    items: [
      {
        id: targetId,
        label: "Plugin Workbench",
        pluginId: "mate",
        revision: 3,
      },
    ],
  },
};

describe("Plugin Workbench frontend snapshot", () => {
  test("accepts the finite path-free v2 projection", () => {
    expect(parsePluginWorkbenchSnapshot(readySnapshot)).toEqual(readySnapshot);
  });

  test("accepts finite unavailable catalog states", () => {
    expect(
      parsePluginWorkbenchSnapshot({
        ...readySnapshot,
        runtimeState: "idle",
        runtimeVersion: null,
        apiVersion: null,
        canStart: true,
        projects: { state: "unavailable", items: [] },
        targets: {
          state: "unavailable",
          reason: "runtime_not_ready",
          items: [],
        },
      }),
    ).toBeDefined();
  });

  test("accepts explicit selection and generic partial catalog states", () => {
    expect(
      parsePluginWorkbenchSnapshot({
        ...readySnapshot,
        targets: { state: "project_not_selected", items: [] },
      }).targets,
    ).toEqual({ state: "project_not_selected", items: [] });
    expect(
      parsePluginWorkbenchSnapshot({
        ...readySnapshot,
        targets: { state: "partial", items: readySnapshot.targets.items },
      }).targets,
    ).toEqual({ state: "partial", items: readySnapshot.targets.items });
  });

  test("rejects secret, path, process, URL, command, and future fields recursively", () => {
    for (const value of [
      { ...readySnapshot, token: "secret" },
      { ...readySnapshot, pid: 42 },
      { ...readySnapshot, baseUrl: "http://127.0.0.1:1234" },
      { ...readySnapshot, path: "/private/plugin" },
      { ...readySnapshot, command: "open URL" },
      {
        ...readySnapshot,
        projects: {
          ...readySnapshot.projects,
          items: [
            { ...readySnapshot.projects.items[0], path: "/private/plugin" },
          ],
        },
      },
      {
        ...readySnapshot,
        targets: {
          ...readySnapshot.targets,
          items: [
            {
              ...readySnapshot.targets.items[0],
              baseUrl: "http://127.0.0.1:1234",
            },
          ],
        },
      },
    ]) {
      expect(() => parsePluginWorkbenchSnapshot(value)).toThrow(
        "Plugin Workbench returned an invalid snapshot.",
      );
    }
  });

  test("rejects malformed and oversized catalog values", () => {
    for (const value of [
      { ...readySnapshot, schemaVersion: 1 },
      {
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [{ id: "", label: "BB Mate", admission: "available" }],
        },
      },
      {
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [
            { id: projectId, label: "x".repeat(257), admission: "available" },
          ],
        },
      },
      {
        ...readySnapshot,
        projects: {
          state: "ready",
          items: [
            readySnapshot.projects.items[0],
            readySnapshot.projects.items[0],
          ],
        },
      },
      {
        ...readySnapshot,
        targets: {
          state: "ready",
          items: [{ ...readySnapshot.targets.items[0], id: "not-opaque" }],
        },
      },
      {
        ...readySnapshot,
        targets: {
          state: "ready",
          items: [
            { ...readySnapshot.targets.items[0], label: "x".repeat(129) },
          ],
        },
      },
      {
        ...readySnapshot,
        targets: {
          state: "ready",
          items: [
            { ...readySnapshot.targets.items[0], pluginId: "Upper_Case" },
          ],
        },
      },
      {
        ...readySnapshot,
        targets: {
          state: "ready",
          items: [{ ...readySnapshot.targets.items[0], revision: 0 }],
        },
      },
      {
        ...readySnapshot,
        targets: {
          state: "unavailable",
          reason: "catalog_unavailable",
          items: [readySnapshot.targets.items[0]],
        },
      },
      {
        ...readySnapshot,
        targets: { state: "ready", reason: "catalog_unavailable", items: [] },
      },
    ]) {
      expect(() => parsePluginWorkbenchSnapshot(value)).toThrow(
        "Plugin Workbench returned an invalid snapshot.",
      );
    }
  });

  test("requires runtime identity exactly for ready and stopping states", () => {
    for (const value of [
      { ...readySnapshot, runtimeVersion: null, apiVersion: null },
      { ...readySnapshot, runtimeState: "idle", canStart: true },
      {
        ...readySnapshot,
        runtimeState: "unavailable",
        reason: null,
        runtimeVersion: null,
        apiVersion: null,
      },
    ]) {
      expect(() => parsePluginWorkbenchSnapshot(value)).toThrow(
        "Plugin Workbench returned an invalid snapshot.",
      );
    }
  });

  test("rejects every half-present or state-incoherent runtime identity", () => {
    const states = [
      ["idle", null, true],
      ["starting", null, false],
      ["ready", null, false],
      ["stopping", null, false],
      ["unavailable", "artifact_missing", false],
      ["failed", "startup_failed", true],
    ] as const;
    for (const [runtimeState, reason, canStart] of states) {
      const base = { ...readySnapshot, runtimeState, reason, canStart };
      for (const identity of [
        { runtimeVersion: "0.7.0", apiVersion: null },
        { runtimeVersion: null, apiVersion: 2 },
      ] as const) {
        expect(() =>
          parsePluginWorkbenchSnapshot({ ...base, ...identity }),
        ).toThrow("Plugin Workbench returned an invalid snapshot.");
      }
      const requiresIdentity =
        runtimeState === "ready" || runtimeState === "stopping";
      const wrongIdentity = requiresIdentity
        ? { runtimeVersion: null, apiVersion: null }
        : { runtimeVersion: "0.7.0", apiVersion: 2 };
      expect(() =>
        parsePluginWorkbenchSnapshot({ ...base, ...wrongIdentity }),
      ).toThrow("Plugin Workbench returned an invalid snapshot.");
    }
  });

  test("accepts only strict status and admit inputs", () => {
    expect(parsePluginWorkbenchStatusInput({})).toEqual({});
    expect(parsePluginWorkbenchAdmitInput({ projectId })).toEqual({
      projectId,
    });
    for (const value of [
      {},
      { projectId: null },
      { projectId: "" },
      { projectId, sourcePath: "/private/plugin" },
      { projectId, token: "secret" },
    ]) {
      expect(() => parsePluginWorkbenchAdmitInput(value)).toThrow(
        "Plugin Workbench returned an invalid request.",
      );
    }
    expect(() => parsePluginWorkbenchStatusInput({ projectId })).toThrow(
      "Plugin Workbench returned an invalid request.",
    );
  });
});
