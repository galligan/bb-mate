import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PluginInspection } from "@bb-mate/inspection";
import { parsePluginSession } from "./plugin-session";
import { pluginSessionUrl, usePluginInspection } from "./usePluginInspection";
import { unavailableTargetMessage } from "./workbench-state";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function session(selectedTargetId: string) {
  return {
    schemaVersion: 2,
    workspace: {
      label: "bb-mate",
      candidates: [
        {
          id: selectedTargetId,
          label: selectedTargetId,
          displayPath: "plugins/example",
        },
      ],
      selectedTargetId,
      selectionError: null,
    },
    inspection: {
      schemaVersion: 1,
      state: "ready",
      outcome: "ready",
      message: null,
      candidates: [],
      target: null,
      checks: [],
      modes: {
        fixture: { available: true, detail: "Fixture ready." },
        harness: {
          available: false,
          detail: "Harness unavailable.",
          sdkVersion: null,
          resolution: "package-not-declared",
          publication: "not-applicable",
          publishedVersion: null,
        },
        live: {
          available: false,
          detail: "Live unavailable.",
          pluginId: null,
          status: null,
          sourceKind: null,
          url: null,
        },
      },
      native: { bbVersion: null, connectUrl: null },
      provenance: null,
      trust: {
        model: "full-trust-local-code",
        entrypoints: [],
        skills: [],
        themes: [],
        hasSettings: null,
        capabilities: [],
        services: [],
        undisclosedAccess: [
          "filesystem",
          "network",
          "secrets",
          "external-services",
        ],
        detail: "No target selected.",
      },
    } satisfies PluginInspection,
    handoffs: {
      launchCommand: null,
      checkCommand: null,
      liveCommand: null,
      detail: "Run from the BB Mate repository root.",
    },
  } as const;
}

describe("usePluginInspection", () => {
  test("rejects path and URL shaped display fields and entrypoints", () => {
    const targetId = "t".repeat(32);
    const payload = session(targetId);
    for (const displayPath of [
      "/private/plugin",
      "C:\\private\\plugin",
      "\\\\host\\share",
      "file:///private/plugin",
      "https://example.test/plugin",
      "plugins/../private",
    ]) {
      expect(() =>
        parsePluginSession({
          ...payload,
          workspace: {
            ...payload.workspace,
            candidates: [{ ...payload.workspace.candidates[0], displayPath }],
          },
        }),
      ).toThrow("Plugin inspection returned an invalid session.");
    }
    expect(() =>
      parsePluginSession({
        ...payload,
        inspection: {
          ...payload.inspection,
          target: {
            rootPath: "/private/plugin",
            displayPath: "plugins/example",
            packageName: "bb-plugin-example",
            displayName: "Example",
            version: "1.0.0",
            serverEntry: "[declared]",
            appEntry: null,
            engines: { bb: null, pluginSdk: null },
            build: { server: null, app: null },
          },
        },
      }),
    ).toThrow("Plugin inspection returned an invalid session.");
    expect(() =>
      parsePluginSession({
        ...payload,
        inspection: {
          ...payload.inspection,
          target: {
            rootPath: "plugins/example",
            displayPath: "plugins/example",
            packageName: "bb-plugin-example",
            displayName: "Example",
            version: "1.0.0",
            serverEntry: "./server.ts",
            appEntry: null,
            engines: { bb: null, pluginSdk: null },
            build: { server: null, app: null },
          },
        },
      }),
    ).toThrow("Plugin inspection returned an invalid session.");
  });

  test("encodes only an opaque target ID into the session request", () => {
    const targetId = "A_-".repeat(10) + "Ab";
    expect(pluginSessionUrl(targetId)).toBe(
      `/bb-mate-session.json?target=${targetId}`,
    );
    expect(pluginSessionUrl("../plugins/secret")).toBe("/bb-mate-session.json");
    expect(pluginSessionUrl(null)).toBe("/bb-mate-session.json");
  });

  test("rejects a path-like target without sending or echoing it", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(() => Promise.resolve(Response.json({})));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const { result } = renderHook(() =>
        usePluginInspection("../plugins/secret"),
      );
      await waitFor(() => expect(result.current.selectionError).not.toBeNull());

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.selectionError).not.toContain("../plugins/secret");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not fetch or default when URL parsing rejected a target", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(() => Promise.resolve(Response.json({})));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const { result } = renderHook(() =>
        usePluginInspection(null, unavailableTargetMessage),
      );
      await waitFor(() =>
        expect(result.current.selectionError).toBe(unavailableTargetMessage),
      );

      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects malformed target IDs returned by the session endpoint", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(Response.json(session("../../private/root"))),
    ) as unknown as typeof fetch;

    try {
      const { result } = renderHook(() => usePluginInspection(null));
      await waitFor(() => expect(result.current.error).not.toBeNull());

      expect(result.current.candidates).toEqual([]);
      expect(result.current.error).not.toContain("../../private/root");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects unknown nested inspection fields without echoing them", async () => {
    const originalFetch = globalThis.fetch;
    const targetId = "t".repeat(32);
    const payload = session(targetId);
    const marker = "/private/native/error";
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json({
          ...payload,
          inspection: {
            ...payload.inspection,
            native: { ...payload.inspection.native, nativeError: marker },
          },
        }),
      ),
    ) as unknown as typeof fetch;

    try {
      const { result } = renderHook(() => usePluginInspection(targetId));
      await waitFor(() => expect(result.current.error).not.toBeNull());

      expect(result.current.inspection).toBeNull();
      expect(result.current.error).not.toContain(marker);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects command-bearing handoffs from the browser DTO", async () => {
    const originalFetch = globalThis.fetch;
    const targetId = "t".repeat(32);
    const payload = session(targetId);
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json({
          ...payload,
          handoffs: { ...payload.handoffs, checkCommand: "bb check /private" },
        }),
      ),
    ) as unknown as typeof fetch;

    try {
      const { result } = renderHook(() => usePluginInspection(targetId));
      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.handoffs.checkCommand).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects a session response without a JSON content type", async () => {
    const originalFetch = globalThis.fetch;
    const targetId = "t".repeat(32);
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(session(targetId)), {
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    ) as unknown as typeof fetch;

    try {
      const { result } = renderHook(() => usePluginInspection(targetId));
      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.inspection).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("stops reading a session response above 256 KiB", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(`"${"x".repeat(256 * 1_024)}"`, {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ) as unknown as typeof fetch;

    try {
      const { result } = renderHook(() => usePluginInspection(null));
      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.inspection).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("ignores a superseded response after plugin selection changes", async () => {
    const oldTargetId = "o".repeat(32);
    const newTargetId = "n".repeat(32);
    const originalFetch = globalThis.fetch;
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    const fetchMock = mock((input: string | URL | Request) =>
      String(input).includes(`target=${oldTargetId}`)
        ? oldRequest.promise
        : newRequest.promise,
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const { result, rerender } = renderHook(
        ({ targetId }: { targetId: string }) => usePluginInspection(targetId),
        { initialProps: { targetId: oldTargetId } },
      );
      rerender({ targetId: newTargetId });

      await act(async () => {
        newRequest.resolve(Response.json(session(newTargetId)));
      });
      await waitFor(() =>
        expect(result.current.selectedTargetId).toBe(newTargetId),
      );

      await act(async () => {
        oldRequest.resolve(Response.json(session(oldTargetId)));
        await Promise.resolve();
      });
      expect(result.current.selectedTargetId).toBe(newTargetId);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
