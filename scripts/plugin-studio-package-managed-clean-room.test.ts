import { describe, expect, test } from "bun:test";
import { parseStudioSnapshot } from "./plugin-studio-managed-rpc.ts";
import {
  assertExpectedManagedCatalog,
  assertManagedCatalogContinuation,
  assertManagedRefreshConvergence,
} from "./plugin-studio-package-managed-clean-room.ts";

const studioTargetId = "s".repeat(32);

function managedSnapshot(
  revision = 1,
  pluginId = "studio",
  targetId = studioTargetId,
) {
  return parseStudioSnapshot({
    schemaVersion: 4,
    browserLaunch: "unavailable",
    projects: {
      state: "ready",
      truncated: false,
      items: [
        {
          id: "studio-project",
          label: "bb Plugin Studio",
          activity: { active: false, lastThreadUpdatedAt: null },
          scan: {
            state: "ready",
            items: [
              {
                id: targetId,
                label: "Plugin Studio",
                pluginId,
                revision,
              },
            ],
          },
        },
        {
          id: "grid-project",
          label: "grid",
          activity: { active: false, lastThreadUpdatedAt: null },
          scan: { state: "ready", items: [] },
        },
      ],
    },
  });
}

describe("managed package schema proof", () => {
  test("rejects the removed runtime lifecycle fields", () => {
    expect(() =>
      parseStudioSnapshot({
        schemaVersion: 4,
        browserLaunch: "unavailable",
        projects: { state: "unavailable", items: [] },
        runtimeState: "idle",
      }),
    ).toThrow("keys differ");
  });

  test("requires the exact managed Studio and grid catalog", () => {
    expect(() =>
      assertExpectedManagedCatalog(managedSnapshot(), {
        studioProjectId: "studio-project",
        gridProjectId: "grid-project",
        studioTargets: [{ label: "Plugin Studio", pluginId: "studio" }],
      }),
    ).not.toThrow();
    expect(() =>
      assertExpectedManagedCatalog(managedSnapshot(1, "other"), {
        studioProjectId: "studio-project",
        gridProjectId: "grid-project",
        studioTargets: [{ label: "Plugin Studio", pluginId: "studio" }],
      }),
    ).toThrow("expected managed catalog");
  });

  test("requires concurrent convergence and stable lifecycle identities", () => {
    const first = managedSnapshot();
    const second = managedSnapshot();
    expect(() => assertManagedRefreshConvergence(first, second)).not.toThrow();
    expect(() =>
      assertManagedRefreshConvergence(first, managedSnapshot(2)),
    ).toThrow("did not converge");

    expect(() =>
      assertManagedCatalogContinuation(first, managedSnapshot(2)),
    ).not.toThrow();
    expect(() =>
      assertManagedCatalogContinuation(managedSnapshot(2), first),
    ).toThrow("regressed");
    expect(() =>
      assertManagedCatalogContinuation(
        first,
        managedSnapshot(2, "studio", "x".repeat(32)),
      ),
    ).toThrow("identity");
  });
});
