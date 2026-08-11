import { describe, expect, test } from "bun:test";

import {
  projectIdSchema,
  workbenchSnapshotSchema,
  type PluginWorkbenchSnapshotV2,
} from "./workbench-contract.ts";

const idle: PluginWorkbenchSnapshotV2 = {
  schemaVersion: 2,
  runtimeState: "idle",
  reason: null,
  runtimeVersion: null,
  apiVersion: null,
  canStart: true,
  browserLaunch: "unavailable",
  projects: { state: "ready", items: [] },
  targets: {
    state: "unavailable",
    reason: "runtime_not_ready",
    items: [],
  },
};

describe("Plugin Workbench v2 contract", () => {
  test("accepts the exact finite idle projection", () => {
    expect(workbenchSnapshotSchema.parse(idle)).toEqual(idle);
  });

  test("rejects path-shaped ids and private nested facts", () => {
    for (const projectId of ["", "../plugin", "/private/plugin", "a b"])
      expect(projectIdSchema.safeParse(projectId).success).toBe(false);

    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        targets: {
          state: "ready",
          items: [
            {
              id: "t".repeat(32),
              label: "Example",
              pluginId: "example",
              revision: 1,
              sourcePath: "/private/example",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  test("requires coherent runtime identity and unique bounded items", () => {
    for (const identity of [
      { runtimeVersion: "0.1.0", apiVersion: null },
      { runtimeVersion: null, apiVersion: 2 },
    ] as const) {
      expect(
        workbenchSnapshotSchema.safeParse({ ...idle, ...identity }).success,
      ).toBe(false);
    }
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        runtimeState: "ready",
        canStart: false,
      }).success,
    ).toBe(false);
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        projects: {
          state: "ready",
          items: [
            { id: "same", label: "One", admission: "available" },
            { id: "same", label: "Two", admission: "no_source" },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        targets: { state: "ready", items: [] },
      }).success,
    ).toBe(false);
  });
});
