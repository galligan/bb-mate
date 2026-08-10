import { describe, expect, test } from "bun:test";
import {
  automaticTargetId,
  commitWorkbenchState,
  readWorkbenchState,
  writeWorkbenchState,
} from "./workbench-state";

describe("workbench URL state", () => {
  test("defaults only one unambiguous server-selected target", () => {
    const targetId = "t".repeat(32);
    expect(automaticTargetId(null, null, 1, targetId)).toBe(targetId);
    expect(automaticTargetId(null, null, 2, null)).toBeNull();
    expect(automaticTargetId(null, "Selection unavailable.", 1, targetId)).toBe(
      null,
    );
    expect(automaticTargetId("c".repeat(32), null, 1, targetId)).toBeNull();
  });

  test("round-trips a server-issued opaque target selection", () => {
    const targetId = "a".repeat(32);
    const state = readWorkbenchState(
      `?target=${targetId}&surface=thread-list&scenario=quiet&mode=live&theme=dark&viewport=compact`,
    );

    expect(state).toEqual({
      targetId,
      selectionError: null,
      surfaceId: "thread-list",
      fixtureId: "quiet",
      mode: "live",
      theme: "dark",
      viewport: "compact",
    });
    expect(readWorkbenchState(writeWorkbenchState(state))).toEqual(state);
  });

  test("falls back deterministically for stale catalog and enum values", () => {
    expect(
      readWorkbenchState(
        "?surface=removed&scenario=removed&mode=magic&theme=system&viewport=wide",
      ),
    ).toMatchObject({
      targetId: null,
      selectionError: null,
      surfaceId: "homepage-section",
      fixtureId: "project-selected",
      mode: "fixture",
      theme: "light",
      viewport: "desktop",
    });
  });

  test("removes legacy and path-like selections without echoing them", () => {
    const state = readWorkbenchState(
      "?plugin=legacy-key&target=..%2Fplugins%2Fsecret",
    );

    expect(state.targetId).toBeNull();
    expect(state.selectionError).not.toBeNull();
    expect(state.selectionError).not.toContain("../plugins/secret");
    const normalized = writeWorkbenchState(state);
    expect(normalized).not.toContain("plugin=");
    expect(normalized).not.toContain("target=");
    expect(
      writeWorkbenchState({ ...state, targetId: "../plugins/secret" }),
    ).not.toContain("target=");
  });

  test("uses the selected surface default when its scenario is stale", () => {
    expect(
      readWorkbenchState("?surface=thread-list&scenario=homepage"),
    ).toMatchObject({ surfaceId: "thread-list", fixtureId: "agents" });
  });

  test("preserves unrelated query parameters while owning launcher keys", () => {
    const state = readWorkbenchState("?surface=thread-list&scenario=quiet");
    const search = writeWorkbenchState(state, "?debug=1&surface=removed");

    expect(search).toContain("debug=1");
    expect(new URLSearchParams(search).get("surface")).toBe("thread-list");
  });

  test("commits one history entry for one launcher interaction", () => {
    const calls: Array<{ method: string; url: string }> = [];
    const history = {
      pushState: (_data: unknown, _unused: string, url?: string | URL | null) =>
        calls.push({ method: "push", url: String(url) }),
      replaceState: (
        _data: unknown,
        _unused: string,
        url?: string | URL | null,
      ) => calls.push({ method: "replace", url: String(url) }),
    };
    const initial = readWorkbenchState(
      "?surface=homepage-section&scenario=project-selected",
    );
    const next = commitWorkbenchState(
      initial,
      { theme: "dark" },
      { pathname: "/", search: "?debug=1", hash: "#preview" },
      history,
    );

    expect(next.theme).toBe("dark");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "push" });
    expect(calls[0]?.url).toContain("theme=dark");
    expect(calls[0]?.url).toContain("debug=1");
  });

  test("uses replaceState for automatic corrections without adding history", () => {
    const calls: string[] = [];
    const current = readWorkbenchState("?mode=live");
    commitWorkbenchState(
      current,
      { mode: "fixture" },
      { pathname: "/", search: "?mode=live", hash: "" },
      {
        pushState: () => calls.push("push"),
        replaceState: () => calls.push("replace"),
      },
      { replace: true },
    );

    expect(calls).toEqual(["replace"]);
  });

  test("commits a surface and its default scenario as one history entry", () => {
    const calls: string[] = [];
    const next = commitWorkbenchState(
      readWorkbenchState(""),
      { surfaceId: "thread-list", fixtureId: "agents" },
      { pathname: "/", search: "", hash: "" },
      {
        pushState: (_data, _unused, url) => calls.push(String(url)),
        replaceState: () => calls.push("unexpected replacement"),
      },
    );

    expect(next).toMatchObject({
      surfaceId: "thread-list",
      fixtureId: "agents",
    });
    expect(calls).toHaveLength(1);
  });
});
