import { describe, expect, test } from "bun:test";
import type { StudioSnapshot } from "./plugin-studio-managed-rpc.ts";
import { catalogFailureSummary } from "./plugin-studio-package-managed-clean-room.ts";

describe("managed Studio catalog failure diagnostics", () => {
  test("reports bounded catalog state without project identity or labels", () => {
    const snapshot = {
      schemaVersion: 3,
      runtimeState: "ready",
      reason: null,
      runtimeVersion: "0.1.0-alpha.3",
      apiVersion: 2,
      canStart: false,
      browserLaunch: "unavailable",
      projects: {
        state: "partial",
        truncated: false,
        items: [
          {
            id: "private-project-id",
            label: "private-project-label",
            activity: { active: false, lastThreadUpdatedAt: null },
            scan: {
              state: "unavailable",
              reason: "source_changed",
              items: [],
            },
          },
          {
            id: "another-private-project-id",
            label: "another-private-label",
            activity: { active: false, lastThreadUpdatedAt: null },
            scan: { state: "ready", items: [] },
          },
        ],
      },
    } as StudioSnapshot;

    const summary = JSON.stringify(catalogFailureSummary(snapshot));
    expect(summary).toBe(
      '{"runtimeState":"ready","runtimeReason":null,"runtimeVersion":"0.1.0-alpha.3","apiVersion":2,"projectState":"partial","projectCount":2,"truncated":false,"scans":{"ready":1,"partial":0,"not_scanned":0,"unavailable":{"source_changed":1,"scan_failed":0,"capacity_reached":0}}}',
    );
    expect(summary).not.toContain("private");
  });
});
