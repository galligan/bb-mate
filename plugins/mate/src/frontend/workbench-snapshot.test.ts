import { describe, expect, test } from "bun:test";

import {
  parsePluginWorkbenchEnsureInput,
  parsePluginWorkbenchSnapshot,
  parsePluginWorkbenchStatusInput,
  type PluginWorkbenchSnapshot,
} from "./workbench-snapshot";

const readySnapshot: PluginWorkbenchSnapshot = {
  schemaVersion: 1,
  runtimeState: "ready",
  reason: null,
  runtimeVersion: "0.6.0",
  apiVersion: 1,
  canStart: false,
  browserLaunch: "unavailable",
  targets: "unavailable_pending_runtime_admission",
};

describe("Plugin Workbench frontend snapshot", () => {
  test("accepts the finite public ready projection", () => {
    expect(parsePluginWorkbenchSnapshot(readySnapshot)).toEqual(readySnapshot);
  });

  test("rejects secret, path, process, URL, command, and future fields", () => {
    for (const value of [
      { ...readySnapshot, token: "secret" },
      { ...readySnapshot, pid: 42 },
      { ...readySnapshot, baseUrl: "http://127.0.0.1:1234" },
      { ...readySnapshot, path: "/private/plugin" },
      { ...readySnapshot, command: "open URL" },
      { ...readySnapshot, targets: [] },
    ]) {
      expect(() => parsePluginWorkbenchSnapshot(value)).toThrow(
        "Plugin Workbench returned an invalid snapshot.",
      );
    }
  });

  test("requires coherent finite runtime states", () => {
    for (const value of [
      { ...readySnapshot, runtimeState: "connecting" },
      { ...readySnapshot, reason: "unknown" },
      { ...readySnapshot, apiVersion: "1" },
      { ...readySnapshot, browserLaunch: "available" },
      { ...readySnapshot, runtimeVersion: "x".repeat(65) },
      { ...readySnapshot, runtimeVersion: "/private/runtime" },
      { ...readySnapshot, runtimeVersion: "http://127.0.0.1" },
      { ...readySnapshot, runtimeVersion: "C:\\runtime\\bb-mate" },
      { ...readySnapshot, runtimeState: "idle", canStart: false },
      { ...readySnapshot, runtimeState: "ready", canStart: true },
      { ...readySnapshot, runtimeState: "unavailable", reason: null },
    ]) {
      expect(() => parsePluginWorkbenchSnapshot(value)).toThrow(
        "Plugin Workbench returned an invalid snapshot.",
      );
    }
  });

  test("requires runtime identity exactly for ready and stopping states", () => {
    expect(
      parsePluginWorkbenchSnapshot({
        ...readySnapshot,
        runtimeState: "stopping",
      }),
    ).toEqual({ ...readySnapshot, runtimeState: "stopping" });

    for (const value of [
      { ...readySnapshot, runtimeVersion: null, apiVersion: null },
      { ...readySnapshot, runtimeVersion: null },
      { ...readySnapshot, apiVersion: null },
      {
        ...readySnapshot,
        runtimeState: "stopping",
        runtimeVersion: null,
        apiVersion: null,
      },
      {
        ...readySnapshot,
        runtimeState: "idle",
        runtimeVersion: "0.6.0",
        apiVersion: 1,
        canStart: true,
      },
      {
        ...readySnapshot,
        runtimeState: "starting",
        runtimeVersion: "0.6.0",
        apiVersion: 1,
      },
      {
        ...readySnapshot,
        runtimeState: "unavailable",
        reason: "artifact_missing",
        runtimeVersion: "0.6.0",
        apiVersion: 1,
      },
      {
        ...readySnapshot,
        runtimeState: "failed",
        reason: "startup_failed",
        runtimeVersion: "0.6.0",
        apiVersion: 1,
        canStart: true,
      },
    ]) {
      expect(() => parsePluginWorkbenchSnapshot(value)).toThrow(
        "Plugin Workbench returned an invalid snapshot.",
      );
    }
  });

  test("accepts only a bounded project context as RPC input", () => {
    expect(parsePluginWorkbenchStatusInput({ projectId: null })).toEqual({
      projectId: null,
    });
    expect(
      parsePluginWorkbenchStatusInput({ projectId: "project-123" }),
    ).toEqual({ projectId: "project-123" });
    expect(() =>
      parsePluginWorkbenchStatusInput({
        projectId: "project-123",
        sourcePath: "/private/plugin",
      }),
    ).toThrow("Plugin Workbench returned an invalid request.");
    for (const projectId of [
      "/private/plugin",
      "http://127.0.0.1",
      "C:\\plugin",
      "project id",
    ]) {
      expect(() => parsePluginWorkbenchStatusInput({ projectId })).toThrow(
        "Plugin Workbench returned an invalid request.",
      );
    }
  });

  test("requires an explicit project for runtime demand", () => {
    expect(
      parsePluginWorkbenchEnsureInput({ projectId: "project-123" }),
    ).toEqual({ projectId: "project-123" });
    for (const value of [
      { projectId: null },
      { projectId: "" },
      { projectId: "project-123", sourcePath: "/private/plugin" },
    ]) {
      expect(() => parsePluginWorkbenchEnsureInput(value)).toThrow(
        "Plugin Workbench returned an invalid request.",
      );
    }
  });
});
