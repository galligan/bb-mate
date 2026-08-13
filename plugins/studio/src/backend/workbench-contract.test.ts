import { describe, expect, test } from "bun:test";

import {
  projectIdSchema,
  workbenchSnapshotSchema,
  type PluginWorkbenchSnapshotV4,
} from "./workbench-contract.ts";

const idle: PluginWorkbenchSnapshotV4 = {
  schemaVersion: 4,
  browserLaunch: "unavailable",
  projects: { state: "ready", truncated: false, items: [] },
};

const project = {
  id: "project-1",
  label: "Example",
  activity: { active: false, lastThreadUpdatedAt: null },
  scan: { state: "not_scanned" as const, items: [] as [] },
};

describe("Plugin Studio v4 contract", () => {
  test("accepts the exact finite path-free idle projection", () => {
    expect(workbenchSnapshotSchema.parse(idle)).toEqual(idle);
    expect(
      workbenchSnapshotSchema.parse({
        ...idle,
        projects: { state: "ready", truncated: false, items: [project] },
      }),
    ).toEqual({
      ...idle,
      projects: { state: "ready", truncated: false, items: [project] },
    });
  });

  test("requires explicit inventory truncation independently of scan completeness", () => {
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        projects: { state: "ready", items: [] },
      }).success,
    ).toBe(false);
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        projects: {
          state: "partial",
          truncated: false,
          items: [{ ...project, scan: { state: "partial", items: [] } }],
        },
      }).success,
    ).toBe(true);
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        projects: { state: "partial", truncated: true, items: [project] },
      }).success,
    ).toBe(true);
  });

  test("rejects path-shaped ids, labels, and nested private facts", () => {
    for (const projectId of ["", "../plugin", "/private/plugin", "a b"])
      expect(projectIdSchema.safeParse(projectId).success).toBe(false);

    for (const label of [
      "/Users/test/plugin",
      "folder/plugin",
      String.raw`C:\Users\test\plugin`,
      String.raw`folder\plugin`,
      "C:plugin",
      ".",
      "..",
      "~",
    ]) {
      expect(
        workbenchSnapshotSchema.safeParse({
          ...idle,
          projects: {
            state: "ready",
            items: [{ ...project, label }],
          },
        }).success,
      ).toBe(false);
    }

    for (const privateFact of [
      { sourcePath: "/private/example" },
      { sourceId: "source-1" },
      { hostId: "host-1" },
      { detail: "private scanner output" },
    ]) {
      expect(
        workbenchSnapshotSchema.safeParse({
          ...idle,
          projects: {
            state: "ready",
            items: [{ ...project, ...privateFact }],
          },
        }).success,
      ).toBe(false);
    }
  });

  test("accepts grouped scans and only finite generic unavailable reasons", () => {
    const target = {
      id: "t".repeat(32),
      label: "Example plugin",
      pluginId: "example",
      revision: 1,
    };
    for (const state of ["ready", "partial"] as const) {
      expect(
        workbenchSnapshotSchema.safeParse({
          ...idle,
          projects: {
            state,
            truncated: false,
            items: [{ ...project, scan: { state, items: [target] } }],
          },
        }).success,
      ).toBe(true);
    }
    for (const reason of [
      "source_changed",
      "scan_failed",
      "capacity_reached",
    ] as const) {
      expect(
        workbenchSnapshotSchema.safeParse({
          ...idle,
          projects: {
            state: "partial",
            truncated: false,
            items: [
              {
                ...project,
                scan: { state: "unavailable", reason, items: [] },
              },
            ],
          },
        }).success,
      ).toBe(true);
    }
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        projects: {
          state: "partial",
          items: [
            {
              ...project,
              scan: {
                state: "unavailable",
                reason: "/private/failure",
                items: [],
              },
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        projects: { state: "partial", truncated: false, items: [project] },
      }).success,
    ).toBe(false);
  });

  test("rejects runtime handshake fields and requires coherent activity, state, and unique bounded items", () => {
    for (const identity of [
      { runtimeState: "ready" },
      { runtimeVersion: "0.1.0" },
      { apiVersion: 2 },
      { canStart: true },
      { reason: "startup_failed" },
    ] as const) {
      expect(
        workbenchSnapshotSchema.safeParse({ ...idle, ...identity }).success,
      ).toBe(false);
    }
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        projects: {
          state: "ready",
          items: [project, { ...project, label: "Duplicate" }],
        },
      }).success,
    ).toBe(false);
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        projects: {
          state: "ready",
          items: [
            {
              ...project,
              activity: { active: false, lastThreadUpdatedAt: -1 },
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        projects: {
          state: "ready",
          items: [{ ...project, scan: { state: "partial", items: [] } }],
        },
      }).success,
    ).toBe(false);
  });

  test("bounds duplicate-root fan-out by total serialized target entries", () => {
    const targets = Array.from({ length: 65 }, (_, index) => ({
      id: String(index).padStart(32, "0"),
      label: `Plugin ${index}`,
      pluginId: `plugin-${index}`,
      revision: 1,
    }));
    expect(
      workbenchSnapshotSchema.safeParse({
        ...idle,
        projects: {
          state: "ready",
          items: [
            { ...project, scan: { state: "ready", items: targets } },
            {
              ...project,
              id: "project-2",
              scan: { state: "ready", items: targets },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
