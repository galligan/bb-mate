import { describe, expect, test } from "bun:test";

import {
  applyProjectDemandPolicy,
  createProjectDemandInput,
} from "./workbench-project-policy";
import type { PluginWorkbenchSnapshot } from "./workbench-snapshot";

const idleSnapshot: PluginWorkbenchSnapshot = {
  schemaVersion: 1,
  runtimeState: "idle",
  reason: null,
  runtimeVersion: null,
  apiVersion: null,
  canStart: true,
  browserLaunch: "unavailable",
  targets: "unavailable_pending_runtime_admission",
};

describe("Plugin Workbench project demand policy", () => {
  test("suppresses Start and Retry without an explicit bb project", () => {
    expect(applyProjectDemandPolicy(idleSnapshot, null)).toEqual({
      ...idleSnapshot,
      canStart: false,
    });
    expect(applyProjectDemandPolicy(idleSnapshot, "project-123")).toBe(
      idleSnapshot,
    );
  });

  test("cannot construct an ensure call without an explicit bb project", () => {
    expect(createProjectDemandInput(null)).toBeNull();
    expect(createProjectDemandInput("project-123")).toEqual({
      projectId: "project-123",
    });
  });
});
