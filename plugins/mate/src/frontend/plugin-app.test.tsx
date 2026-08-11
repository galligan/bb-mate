import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { PluginWorkbenchSnapshot } from "./workbench-snapshot";

GlobalRegistrator.register();
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const targetA = "abcdefghijklmnopqrstuvwxzy012345";
const targetB = "0123456789abcdefghijklmnopqrstuv";

function snapshot(
  targets: PluginWorkbenchSnapshot["targets"] = {
    state: "project_not_selected",
    items: [],
  },
): PluginWorkbenchSnapshot {
  return {
    schemaVersion: 2,
    runtimeState: "ready",
    reason: null,
    runtimeVersion: "0.7.0",
    apiVersion: 2,
    canStart: false,
    browserLaunch: "unavailable",
    projects: {
      state: "ready",
      items: [
        { id: "project_01", label: "BB Mate", admission: "available" },
        { id: "project_02", label: "Remote", admission: "no_source" },
      ],
    },
    targets,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let rpcImplementation: (
  method: string,
  input: unknown,
) => Promise<unknown> = () => Promise.resolve(snapshot());
const rpcCall = mock((method: string, input: unknown) =>
  rpcImplementation(method, input),
);
const rpcClient = { call: rpcCall };

mock.module("@bb/plugin-sdk/app", () => ({
  definePluginApp: (setup: unknown) => ({ __bbPluginApp: true, setup }),
  useRpc: () => rpcClient,
}));

let root: Root | undefined;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderPanel() {
  const { PluginWorkbenchPanel } = await import("./plugin-app");
  const container = document.querySelector("#root");
  if (!(container instanceof HTMLElement)) throw new Error("Missing root.");
  root = createRoot(container);
  await act(async () => root?.render(<PluginWorkbenchPanel subPath="" />));
  await flush();
}

function button(label: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );
}

async function chooseProject(projectId = "project_01") {
  const select = document.querySelector("select");
  if (!(select instanceof HTMLSelectElement))
    throw new Error("Missing project chooser.");
  await act(async () => {
    select.value = projectId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  rpcCall.mockClear();
  rpcImplementation = () => Promise.resolve(snapshot());
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

  test("loads read-only status and admits only the explicitly chosen project", async () => {
    rpcImplementation = (method) =>
      Promise.resolve(
        method === "status"
          ? snapshot()
          : snapshot({
              state: "ready",
              items: [
                { id: targetA, label: "Mate", pluginId: "mate", revision: 1 },
              ],
            }),
      );
    await renderPanel();
    expect(rpcCall).toHaveBeenNthCalledWith(1, "status", {});
    expect(rpcCall).toHaveBeenCalledTimes(1);

    await chooseProject();
    expect(rpcCall).toHaveBeenCalledTimes(1);
    await act(async () => button("Admit project")?.click());
    await flush();

    expect(rpcCall).toHaveBeenNthCalledWith(2, "admit", {
      projectId: "project_01",
    });
    expect(rpcCall.mock.calls.some(([method]) => method === "ensure")).toBe(
      false,
    );
    const radio = document.querySelector('input[type="radio"]');
    expect(radio).toBeInstanceOf(HTMLInputElement);
    expect((radio as HTMLInputElement).checked).toBe(true);
  });

  test("keeps multiple target selection client-only", async () => {
    rpcImplementation = (method) =>
      Promise.resolve(
        method === "status"
          ? snapshot()
          : snapshot({
              state: "ready",
              items: [
                { id: targetA, label: "Mate", pluginId: "mate", revision: 1 },
                {
                  id: targetB,
                  label: "Linear",
                  pluginId: "linear",
                  revision: 2,
                },
              ],
            }),
      );
    await renderPanel();
    await chooseProject();
    await act(async () => button("Admit project")?.click());
    await flush();
    const radios = Array.from(
      document.querySelectorAll('input[type="radio"]'),
    ) as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios.every(({ checked }) => !checked)).toBe(true);
    await act(async () => radios[1]?.click());
    expect(radios[1]?.checked).toBe(true);
    expect(rpcCall).toHaveBeenCalledTimes(2);
  });

  test("hides a prior catalog when the user changes projects", async () => {
    rpcImplementation = (method) =>
      Promise.resolve(
        method === "status"
          ? snapshot()
          : snapshot({
              state: "ready",
              items: [
                {
                  id: targetA,
                  label: "Mate",
                  pluginId: "mate",
                  revision: 1,
                },
              ],
            }),
      );
    await renderPanel();
    await chooseProject();
    await act(async () => button("Admit project")?.click());
    await flush();
    expect(document.body.textContent).toContain("Mate");

    await chooseProject("project_02");
    expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    expect(document.body.textContent).toContain("Choose a development project");
    expect(rpcCall).toHaveBeenCalledTimes(2);
  });

  test("clears a vanished target selection with a generic live message", async () => {
    let admission = 0;
    rpcImplementation = (method) =>
      Promise.resolve(
        method === "status"
          ? snapshot()
          : snapshot({
              state: "ready",
              items:
                admission++ === 0
                  ? [
                      {
                        id: targetA,
                        label: "Mate",
                        pluginId: "mate",
                        revision: 1,
                      },
                    ]
                  : [
                      {
                        id: targetB,
                        label: "Linear",
                        pluginId: "linear",
                        revision: 2,
                      },
                    ],
            }),
      );
    await renderPanel();
    await chooseProject();
    await act(async () => button("Admit project")?.click());
    await flush();
    expect(
      (document.querySelector('input[type="radio"]') as HTMLInputElement)
        .checked,
    ).toBe(true);

    await act(async () => button("Refresh project")?.click());
    await flush();
    const next = document.querySelector(
      'input[type="radio"]',
    ) as HTMLInputElement;
    expect(next.checked).toBe(false);
    expect(document.body.textContent).toContain(
      "The target list changed. Choose a target.",
    );
    expect(document.body.textContent).not.toContain(targetA);
    await act(async () => next.click());
    expect(next.checked).toBe(true);
  });

  test("ignores superseded status responses and never polls", async () => {
    const older = deferred<unknown>();
    const newer = deferred<unknown>();
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      if (calls === 1) return Promise.resolve(snapshot());
      return calls === 2 ? older.promise : newer.promise;
    };
    await renderPanel();
    expect(document.body.textContent).toContain("Runtime ready");
    await act(async () => {
      button("Refresh status")?.click();
      button("Refresh status")?.click();
    });

    newer.resolve(
      snapshot({ state: "project_not_selected", items: [] }) satisfies unknown,
    );
    await flush();
    older.resolve({
      ...snapshot(),
      projects: { state: "ready", items: [] },
    } satisfies PluginWorkbenchSnapshot);
    await flush();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(document.body.textContent).not.toContain("No bb projects available");
    expect(rpcCall).toHaveBeenCalledTimes(3);
  });
});
