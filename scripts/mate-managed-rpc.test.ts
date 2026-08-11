import { describe, expect, test } from "bun:test";
import {
  assertTargetRefresh,
  parseMateSnapshot,
  type MateSnapshot,
} from "./mate-managed-rpc.ts";

const targetId = "a".repeat(32);

function snapshot(): MateSnapshot {
  return {
    schemaVersion: 2,
    runtimeState: "ready",
    reason: null,
    runtimeVersion: "0.1.0-alpha.3",
    apiVersion: 2,
    canStart: false,
    browserLaunch: "unavailable",
    projects: {
      state: "ready",
      items: [
        { id: "project_1", label: "Single", admission: "available" },
        { id: "project_2", label: "Multiple", admission: "no_source" },
      ],
    },
    targets: {
      state: "ready",
      items: [
        {
          id: targetId,
          label: "Alpha",
          pluginId: "alpha",
          revision: 1,
        },
      ],
    },
  };
}

describe("managed Mate RPC proof codec", () => {
  test("accepts only the exact finite API 2 public snapshot", () => {
    expect(parseMateSnapshot(snapshot())).toEqual(snapshot());
    expect(() =>
      parseMateSnapshot({ ...snapshot(), baseUrl: "http://127.0.0.1:1" }),
    ).toThrow("snapshot keys");
    expect(() =>
      parseMateSnapshot({
        ...snapshot(),
        projects: {
          state: "ready",
          items: [{ ...snapshot().projects.items[0], path: "/private" }],
        },
      }),
    ).toThrow("project option keys");
    expect(() =>
      parseMateSnapshot({
        ...snapshot(),
        targets: {
          state: "ready",
          items: [{ ...snapshot().targets.items[0], token: "secret" }],
        },
      }),
    ).toThrow("target summary keys");
  });

  test("accepts idle before admission and rejects incoherent identity", () => {
    const idle = {
      ...snapshot(),
      runtimeState: "idle",
      runtimeVersion: null,
      apiVersion: null,
      canStart: true,
      targets: {
        state: "unavailable",
        reason: "runtime_not_ready",
        items: [],
      },
    };
    expect(parseMateSnapshot(idle)).toEqual(parseMateSnapshot(idle));
    expect(() =>
      parseMateSnapshot({ ...idle, runtimeVersion: "0.1.0-alpha.3" }),
    ).toThrow("snapshot values");
  });

  test("requires stable target identity and increasing revisions", () => {
    const first = parseMateSnapshot(snapshot());
    const refreshed = parseMateSnapshot({
      ...snapshot(),
      targets: {
        state: "ready",
        items: [{ ...snapshot().targets.items[0], revision: 2 }],
      },
    });
    expect(() => assertTargetRefresh(first, refreshed)).not.toThrow();
    expect(() => assertTargetRefresh(first, first)).toThrow("advance");
    expect(() =>
      assertTargetRefresh(
        first,
        parseMateSnapshot({
          ...snapshot(),
          targets: {
            state: "ready",
            items: [{ ...snapshot().targets.items[0], id: "b".repeat(32) }],
          },
        }),
      ),
    ).toThrow("identity");
  });
});
