import { describe, expect, test } from "bun:test";

import {
  BatchProjectTargetAdmissionRequestSchema,
  BatchProjectTargetAdmissionResponseSchema,
  DevelopmentTargetListResponseSchema,
} from "./targets.ts";
import { OpaqueIdSchema, TargetIdSchema } from "../contracts/ids.ts";

const projectA = OpaqueIdSchema.parse("a".repeat(32));
const projectB = OpaqueIdSchema.parse("b".repeat(32));

const projection = {
  schemaVersion: 1,
  kind: "development-target",
  id: TargetIdSchema.parse("t".repeat(32)),
  revision: 1,
  createdAt: 10,
  updatedAt: 10,
  displayName: "Example plugin",
  displayPath: "plugins/example",
  sourceKind: "workspace-discovered",
  manifest: {
    pluginId: "example",
    packageName: "bb-plugin-example",
    version: "1.2.3",
    hasServer: true,
    hasApp: true,
  },
  native: { status: "absent", observedAt: 10 },
  capabilities: { fixture: false, harness: false, live: false },
} as const;

describe("supervised target transport", () => {
  test("parses only a strict bounded batch of unique opaque project keys and private source paths", () => {
    expect(
      BatchProjectTargetAdmissionRequestSchema.parse({
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [
          {
            projectKey: projectA,
            sourcePath: "/Users/example/plugin",
          },
          {
            projectKey: projectB,
            sourcePath: "/Users/example/other",
          },
        ],
      }),
    ).toEqual({
      schemaVersion: 2,
      inventoryState: "complete",
      projects: [
        {
          projectKey: projectA,
          sourcePath: "/Users/example/plugin",
        },
        {
          projectKey: projectB,
          sourcePath: "/Users/example/other",
        },
      ],
    });

    expect(
      BatchProjectTargetAdmissionRequestSchema.parse({
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [],
      }),
    ).toEqual({
      schemaVersion: 2,
      inventoryState: "complete",
      projects: [],
    });

    expect(
      BatchProjectTargetAdmissionRequestSchema.parse({
        schemaVersion: 2,
        inventoryState: "partial",
        projects: [],
      }),
    ).toEqual({
      schemaVersion: 2,
      inventoryState: "partial",
      projects: [],
    });

    for (const input of [
      { schemaVersion: 2, projects: [] },
      {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: Array.from({ length: 129 }, (_, index) => ({
          projectKey: index.toString(36).padStart(32, "0"),
          sourcePath: `/private/${index}`,
        })),
      },
      {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [
          { projectKey: "a".repeat(32), sourcePath: "/private/one" },
          { projectKey: "a".repeat(32), sourcePath: "/private/two" },
        ],
      },
      {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [{ projectKey: "short", sourcePath: "/private/plugin" }],
      },
      {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [
          { projectKey: "a".repeat(32), sourcePath: "relative/plugin" },
        ],
      },
      {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [
          { projectKey: "a".repeat(32), sourcePath: "/private/../plugin" },
        ],
      },
      {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [
          { projectKey: "a".repeat(32), sourcePath: "/private//plugin" },
        ],
      },
      {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [
          {
            projectKey: "a".repeat(32),
            sourcePath: "/private/plugin\u0000secret",
          },
        ],
      },
      {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [
          {
            projectKey: "a".repeat(32),
            sourcePath: `/${"x".repeat(1_025)}`,
          },
        ],
      },
      {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [
          {
            projectKey: "a".repeat(32),
            sourcePath: "/private/plugin",
            extra: true,
          },
        ],
      },
      { schemaVersion: 1, projects: [] },
    ]) {
      expect(
        BatchProjectTargetAdmissionRequestSchema.safeParse(input).success,
      ).toBe(false);
    }
  });

  test("parses a strict path-free group for every admitted project", () => {
    const response = {
      schemaVersion: 2 as const,
      state: "partial" as const,
      projects: [
        {
          projectKey: projectA,
          state: "ready" as const,
          targets: [projection],
        },
        {
          projectKey: projectB,
          state: "partial" as const,
          targets: [],
        },
      ],
    };
    expect(BatchProjectTargetAdmissionResponseSchema.parse(response)).toEqual(
      response,
    );
    expect(
      BatchProjectTargetAdmissionResponseSchema.parse({
        schemaVersion: 2,
        state: "ready",
        projects: [],
      }),
    ).toEqual({ schemaVersion: 2, state: "ready", projects: [] });
    expect(
      BatchProjectTargetAdmissionResponseSchema.safeParse({
        schemaVersion: 2,
        state: "partial",
        projects: [
          { projectKey: projectA, state: "ready", targets: [projection] },
        ],
      }).success,
    ).toBe(true);

    for (const input of [
      { ...response, sourcePath: "/secret" },
      {
        ...response,
        projects: [
          response.projects[0],
          { ...response.projects[1], projectKey: "a".repeat(32) },
        ],
      },
      {
        ...response,
        projects: [
          {
            ...response.projects[0],
            targets: [{ ...projection, path: "/secret" }],
          },
        ],
      },
      {
        schemaVersion: 2,
        state: "ready",
        projects: [
          {
            projectKey: projectA,
            state: "ready",
            targets: Array.from({ length: 129 }, (_, index) => ({
              ...projection,
              id: TargetIdSchema.parse(index.toString(36).padStart(32, "0")),
            })),
          },
        ],
      },
      { ...response, state: "ready", projects: [response.projects[1]] },
    ]) {
      expect(
        BatchProjectTargetAdmissionResponseSchema.safeParse(input).success,
      ).toBe(false);
    }
  });

  test("bounds duplicate-root fan-out by total serialized target entries", () => {
    const sharedTargets = Array.from({ length: 65 }, (_, index) => ({
      ...projection,
      id: TargetIdSchema.parse(index.toString(36).padStart(32, "0")),
    }));
    expect(
      BatchProjectTargetAdmissionResponseSchema.safeParse({
        schemaVersion: 2,
        state: "ready",
        projects: [
          { projectKey: projectA, state: "ready", targets: sharedTargets },
          { projectKey: projectB, state: "ready", targets: sharedTargets },
        ],
      }).success,
    ).toBe(false);
  });

  test("parses the strict path-free ready or partial target projection wrapper", () => {
    for (const state of ["ready", "partial"] as const) {
      const response = {
        schemaVersion: 1 as const,
        state,
        targets: [projection],
      };
      expect(DevelopmentTargetListResponseSchema.parse(response)).toEqual(
        response,
      );
    }

    for (const input of [
      { schemaVersion: 1, state: "unknown", targets: [] },
      { schemaVersion: 1, state: "ready", targets: [], sourcePath: "/secret" },
      {
        schemaVersion: 1,
        state: "ready",
        targets: [{ ...projection, canonicalRoot: "/secret" }],
      },
      {
        schemaVersion: 1,
        state: "ready",
        targets: Array.from({ length: 129 }, () => projection),
      },
    ]) {
      expect(DevelopmentTargetListResponseSchema.safeParse(input).success).toBe(
        false,
      );
    }
  });
});
