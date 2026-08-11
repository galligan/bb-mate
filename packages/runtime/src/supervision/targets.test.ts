import { describe, expect, test } from "bun:test";

import {
  CurrentProjectTargetAdmissionRequestSchema,
  DevelopmentTargetListResponseSchema,
} from "./targets.ts";
import { TargetIdSchema } from "../contracts/ids.ts";

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
  test("parses only the strict bounded private current-project admission DTO", () => {
    expect(
      CurrentProjectTargetAdmissionRequestSchema.parse({
        schemaVersion: 1,
        sourcePath: "/Users/example/plugin",
      }),
    ).toEqual({ schemaVersion: 1, sourcePath: "/Users/example/plugin" });

    for (const input of [
      { schemaVersion: 1, sourcePath: "relative/plugin" },
      { schemaVersion: 1, sourcePath: "/private/../plugin" },
      { schemaVersion: 1, sourcePath: "/private//plugin" },
      { schemaVersion: 1, sourcePath: "/private/plugin\u0000secret" },
      { schemaVersion: 1, sourcePath: `/${"x".repeat(1_025)}` },
      { schemaVersion: 1, sourcePath: "/private/plugin", targetId: "t" },
      { schemaVersion: 2, sourcePath: "/private/plugin" },
    ]) {
      expect(
        CurrentProjectTargetAdmissionRequestSchema.safeParse(input).success,
      ).toBe(false);
    }
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
