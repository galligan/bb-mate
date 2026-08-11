import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

GlobalRegistrator.register();
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const idleSnapshot = {
  schemaVersion: 1,
  runtimeState: "idle",
  reason: null,
  runtimeVersion: null,
  apiVersion: null,
  canStart: true,
  browserLaunch: "unavailable",
  targets: "unavailable_pending_runtime_admission",
} as const;
const readySnapshot = {
  ...idleSnapshot,
  runtimeState: "ready",
  runtimeVersion: "0.1.0-alpha.1",
  apiVersion: 1,
  canStart: false,
} as const;
const rpcCall = mock((method: string, _input: unknown) =>
  Promise.resolve(method === "status" ? idleSnapshot : readySnapshot),
);
const rpcClient = { call: rpcCall };

mock.module("@bb/plugin-sdk/app", () => ({
  definePluginApp: (setup: unknown) => ({ __bbPluginApp: true, setup }),
  useRpc: () => rpcClient,
}));

let root: Root | undefined;

beforeEach(() => {
  rpcCall.mockClear();
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(async () => {
  if (root) await act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("Plugin Workbench app registration", () => {
  test("registers one native nav panel with the released contract", async () => {
    const definition = (await import("./plugin-app")).default;
    const registrations: unknown[] = [];

    definition.setup({
      slots: {
        navPanel: (registration: unknown) => registrations.push(registration),
      },
    } as never);

    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toMatchObject({
      id: "plugin-workbench",
      title: "Plugin Workbench",
      icon: "Wrench",
      path: "workbench",
      component: expect.any(Function),
    });
  });

  test("keeps Start reachable under released nav-panel semantics", async () => {
    const { PluginWorkbenchPanel } = await import("./plugin-app");
    const container = document.querySelector("#root");
    if (!(container instanceof HTMLElement)) throw new Error("Missing root.");
    root = createRoot(container);

    await act(async () => {
      root?.render(<PluginWorkbenchPanel subPath="" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Start runtime",
    );
    expect(button).toBeDefined();
    expect(rpcCall).toHaveBeenNthCalledWith(1, "status", {});

    await act(async () => button?.click());
    await act(async () => {
      await Promise.resolve();
    });

    expect(rpcCall).toHaveBeenNthCalledWith(2, "ensure", {});
    expect(document.body.textContent).toContain("Runtime ready");
  });
});
