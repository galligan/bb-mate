import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PluginInspection } from "@bb-mate/inspection";
import { pluginSessionUrl, usePluginInspection } from "./usePluginInspection";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function session(selectedKey: string) {
  return {
    schemaVersion: 1,
    workspace: {
      label: "bb-mate",
      candidates: [
        { key: selectedKey, label: selectedKey, displayPath: selectedKey },
      ],
      selectedKey,
      selectionError: null,
    },
    inspection: {} as PluginInspection,
    handoffs: {
      launchCommand: null,
      checkCommand: null,
      liveCommand: null,
      detail: "Run from the BB Mate repository root.",
    },
  } as const;
}

describe("usePluginInspection", () => {
  test("encodes an opaque plugin key into the session request", () => {
    expect(pluginSessionUrl("my plugin's")).toBe(
      "/bb-mate-session.json?plugin=my+plugin%27s",
    );
    expect(pluginSessionUrl(null)).toBe("/bb-mate-session.json");
  });

  test("ignores a superseded response after plugin selection changes", async () => {
    const originalFetch = globalThis.fetch;
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    const fetchMock = mock((input: string | URL | Request) =>
      String(input).includes("plugin=old")
        ? oldRequest.promise
        : newRequest.promise,
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const { result, rerender } = renderHook(
        ({ plugin }: { plugin: string }) => usePluginInspection(plugin),
        { initialProps: { plugin: "old" } },
      );
      rerender({ plugin: "new" });

      await act(async () => {
        newRequest.resolve(Response.json(session("new")));
      });
      await waitFor(() => expect(result.current.selectedKey).toBe("new"));

      await act(async () => {
        oldRequest.resolve(Response.json(session("old")));
        await Promise.resolve();
      });
      expect(result.current.selectedKey).toBe("new");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
