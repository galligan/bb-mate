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
        { id: "project_02", label: "Remote", admission: "available" },
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
const navigateToPluginPanel = mock(() => {});
const openThread = mock(() => {});
const openNewThread = mock(() => {});
let sidebarState: {
  status: "loading" | "ready" | "error";
  threads: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
} = { status: "ready", threads: [], projects: [] };

mock.module("@bb/plugin-sdk/app", () => ({
  definePluginApp: (setup: unknown) => ({ __bbPluginApp: true, setup }),
  useRpc: () => ({ call: rpcCall }),
  useBbNavigate: () => ({
    toPluginPanel: navigateToPluginPanel,
    toThread: () => {},
    toProject: () => {},
    toCompose: () => {},
    openThreadPanel: () => false,
  }),
  experimental_useSidebarThreads: () => sidebarState,
  experimental_useSidebarThreadActions: () => ({
    open: openThread,
    openNewThread,
    setPinned: async () => {},
    setRead: async () => {},
    rename: async () => {},
    archive: () => {},
    requestDelete: () => {},
  }),
}));

let root: Root | undefined;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderPanel(subPath = "") {
  const { PluginWorkbenchPanel } = await import("./plugin-app");
  const container = document.querySelector("#root");
  if (!(container instanceof HTMLElement)) throw new Error("Missing root.");
  root = createRoot(container);
  await act(async () =>
    root?.render(<PluginWorkbenchPanel subPath={subPath} />),
  );
  await flush();
}

function button(label: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );
}

beforeEach(() => {
  rpcCall.mockClear();
  navigateToPluginPanel.mockClear();
  openThread.mockClear();
  openNewThread.mockClear();
  rpcImplementation = () => Promise.resolve(snapshot());
  sidebarState = { status: "ready", threads: [], projects: [] };
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(async () => {
  if (root) await act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("Plugin Workbench app registration", () => {
  test("registers one native nav panel with a supported Toolbox icon", async () => {
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
      icon: "Toolbox",
      path: "workbench",
      component: expect.any(Function),
    });
  });

  test("loads read-only status and opens only the chosen project", async () => {
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

    await act(async () => button("Open")?.click());
    await flush();

    expect(rpcCall).toHaveBeenNthCalledWith(2, "admit", {
      projectId: "project_01",
    });
    expect(rpcCall.mock.calls.some(([method]) => method === "ensure")).toBe(
      false,
    );
    expect(document.body.textContent).toContain("Plugins in BB Mate");
    expect(document.querySelector('[aria-label="Open Mate"]')).toBeInstanceOf(
      HTMLButtonElement,
    );
  });

  test("opens a plugin through panel-internal history", async () => {
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
    await act(async () => button("Open")?.click());
    await flush();
    await act(async () => {
      const target = document.querySelector('[aria-label="Open Mate"]');
      if (!(target instanceof HTMLButtonElement))
        throw new Error("Missing target.");
      target.click();
    });
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench", {
      subPath: `projects/project_01/targets/${targetA}`,
    });
  });

  test("recovers a malformed detail route back to the project list once", async () => {
    await renderPanel("not-a-plugin-detail");
    await flush();

    expect(navigateToPluginPanel).toHaveBeenCalledTimes(1);
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench", {
      replace: true,
    });
  });

  test("recovers a detail route for a project that is no longer available", async () => {
    await renderPanel(`projects/missing_project/targets/${targetA}`);
    await flush();

    expect(rpcCall).toHaveBeenCalledTimes(1);
    expect(navigateToPluginPanel).toHaveBeenCalledTimes(1);
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench", {
      replace: true,
    });
  });

  test("recovers a detail route for a project that is no longer eligible", async () => {
    const ineligibleSnapshot = snapshot();
    ineligibleSnapshot.projects.items[0] = {
      id: "project_01",
      label: "BB Mate",
      admission: "no_source",
    };
    rpcImplementation = () => Promise.resolve(ineligibleSnapshot);

    await renderPanel(`projects/project_01/targets/${targetA}`);
    await flush();

    expect(rpcCall).toHaveBeenCalledTimes(1);
    expect(navigateToPluginPanel).toHaveBeenCalledTimes(1);
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench", {
      replace: true,
    });
  });

  test("retries a detail route after the project catalog recovers", async () => {
    let statusCalls = 0;
    rpcImplementation = (method) => {
      if (method === "admit") {
        return Promise.resolve(
          snapshot({
            state: "ready",
            items: [
              { id: targetA, label: "Mate", pluginId: "mate", revision: 1 },
            ],
          }),
        );
      }
      statusCalls += 1;
      return Promise.resolve(
        statusCalls === 1
          ? snapshot({ state: "project_not_selected", items: [] })
          : snapshot(),
      ).then((value) => {
        if (statusCalls === 1)
          value.projects = { state: "unavailable", items: [] };
        return value;
      });
    };

    await renderPanel(`projects/project_01/targets/${targetA}`);
    expect(rpcCall).toHaveBeenCalledTimes(1);

    await act(async () =>
      document
        .querySelector('[aria-label="Reload Workbench data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await flush();

    expect(rpcCall).toHaveBeenNthCalledWith(2, "status", {});
    expect(rpcCall).toHaveBeenNthCalledWith(3, "admit", {
      projectId: "project_01",
    });
    expect(document.body.textContent).toContain("Mate");
  });

  test("recovers when a requested plugin is absent after project discovery", async () => {
    rpcImplementation = () =>
      Promise.resolve(snapshot({ state: "ready", items: [] }));

    await renderPanel(`projects/project_01/targets/${targetA}`);
    await flush();

    expect(rpcCall).toHaveBeenCalledTimes(2);
    expect(navigateToPluginPanel).toHaveBeenCalledTimes(1);
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench", {
      replace: true,
    });
  });

  test("preserves a detail route while the target catalog is nonterminal", async () => {
    const catalogs: PluginWorkbenchSnapshot["targets"][] = [
      { state: "partial", items: [] },
      {
        state: "unavailable",
        reason: "catalog_unavailable",
        items: [],
      },
    ];
    for (const targets of catalogs) {
      rpcCall.mockClear();
      navigateToPluginPanel.mockClear();
      rpcImplementation = (method) =>
        Promise.resolve(method === "status" ? snapshot() : snapshot(targets));

      await renderPanel(`projects/project_01/targets/${targetA}`);
      await flush();

      expect(rpcCall).toHaveBeenCalledTimes(2);
      expect(navigateToPluginPanel).not.toHaveBeenCalled();

      await act(() => root?.unmount());
      root = undefined;
      document.body.innerHTML = '<div id="root"></div>';
    }
  });

  test("returns to the root before opening another project from an uncertain detail", async () => {
    rpcImplementation = (method, input) => {
      if (method === "status") return Promise.resolve(snapshot());
      const projectId = (input as { projectId: string }).projectId;
      return Promise.resolve(
        snapshot(
          projectId === "project_01"
            ? { state: "partial", items: [] }
            : {
                state: "ready",
                items: [
                  {
                    id: targetB,
                    label: "Remote plugin",
                    pluginId: "remote",
                    revision: 1,
                  },
                ],
              },
        ),
      );
    };

    await renderPanel(`projects/project_01/targets/${targetA}`);
    await flush();
    await act(async () =>
      Array.from(document.querySelectorAll("button"))
        .filter((candidate) => candidate.textContent === "Open")
        .at(-1)
        ?.click(),
    );
    await flush();

    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench", {
      replace: true,
    });
    expect(document.body.textContent).toContain("Remote plugin");
  });

  test("attempts a routed project once and recovers when opening fails", async () => {
    rpcImplementation = (method) =>
      method === "status"
        ? Promise.resolve(snapshot())
        : Promise.reject(new Error("open failed"));

    await renderPanel(`projects/project_01/targets/${targetA}`);
    await flush();

    expect(rpcCall).toHaveBeenCalledTimes(2);
    expect(navigateToPluginPanel).toHaveBeenCalledTimes(1);
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench", {
      replace: true,
    });
  });

  test("keeps a detail open and reports a failed refresh in place", async () => {
    const targetSnapshot = snapshot({
      state: "ready",
      items: [{ id: targetA, label: "Mate", pluginId: "mate", revision: 1 }],
    });
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      if (calls < 3 || calls === 5) return Promise.resolve(targetSnapshot);
      if (calls === 4) return Promise.resolve(snapshot());
      return Promise.reject(new Error("reload failed"));
    };

    await renderPanel(`projects/project_01/targets/${targetA}`);
    await flush();
    await act(async () =>
      document
        .querySelector('[aria-label="Reload Workbench data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await flush();

    expect(rpcCall).toHaveBeenCalledTimes(3);
    expect(document.body.textContent).toContain("Mate");
    expect(document.body.textContent).toContain(
      "Project open failed safely. Try again.",
    );
    expect(navigateToPluginPanel).not.toHaveBeenCalled();

    await act(async () =>
      document
        .querySelector('[aria-label="Reload Workbench data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await flush();

    expect(rpcCall).toHaveBeenNthCalledWith(4, "status", {});
    expect(rpcCall).toHaveBeenNthCalledWith(5, "admit", {
      projectId: "project_01",
    });
    expect(document.body.textContent).toContain("Mate");
  });

  test("reloads status when an opened project's catalog becomes unavailable", async () => {
    let calls = 0;
    rpcImplementation = (method) => {
      calls += 1;
      const value = snapshot(
        method === "admit" ? { state: "ready", items: [] } : undefined,
      );
      if (calls === 2) value.projects = { state: "unavailable", items: [] };
      return Promise.resolve(value);
    };

    await renderPanel();
    await act(async () =>
      button("Open")?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await flush();
    await act(async () =>
      document
        .querySelector('[aria-label="Reload Workbench data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await flush();

    expect(rpcCall).toHaveBeenNthCalledWith(3, "status", {});
  });

  test("shows active project threads on a target detail and uses host actions", async () => {
    const targetSnapshot = snapshot({
      state: "ready",
      items: [{ id: targetA, label: "Mate", pluginId: "mate", revision: 1 }],
    });
    rpcImplementation = () => Promise.resolve(targetSnapshot);
    sidebarState = {
      status: "ready",
      projects: [],
      threads: [
        {
          id: "thread_active",
          projectId: "project_01",
          title: "Native design pass",
          titleFallback: null,
          isArchived: false,
          updatedAt: 3,
        },
        {
          id: "thread_archived",
          projectId: "project_01",
          title: "Archived work",
          titleFallback: null,
          isArchived: true,
          updatedAt: 4,
        },
        {
          id: "thread_other",
          projectId: "project_02",
          title: "Other project",
          titleFallback: null,
          isArchived: false,
          updatedAt: 5,
        },
      ],
    };
    await renderPanel(`projects/project_01/targets/${targetA}`);
    await flush();

    expect(document.body.textContent).toContain("Native design pass");
    expect(document.body.textContent).not.toContain("Archived work");
    expect(document.body.textContent).not.toContain("Other project");
    await act(async () => button("Native design pass")?.click());
    expect(openThread).toHaveBeenCalledWith("thread_active");
    await act(async () => button("New thread")?.click());
    expect(openNewThread).toHaveBeenCalledWith({
      projectId: "project_01",
      focusPrompt: true,
    });
    await act(async () => button("Back to projects")?.click());
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench");
  });

  test("reports a changed plugin list after a project refresh", async () => {
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
    await act(async () => button("Open")?.click());
    await flush();
    await act(async () => button("Refresh")?.click());
    await flush();
    expect(document.body.textContent).toContain("The plugin list changed.");
    expect(document.body.textContent).toContain("Linear");
    expect(document.body.textContent).not.toContain("mate · revision 1");
  });

  test("reports plugins added after a recorded empty catalog", async () => {
    let admission = 0;
    rpcImplementation = (method) =>
      Promise.resolve(
        method === "status"
          ? snapshot()
          : snapshot({
              state: "ready",
              items:
                admission++ === 0
                  ? []
                  : [
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
    await act(async () => button("Open")?.click());
    await flush();
    await act(async () => button("Refresh")?.click());
    await flush();

    expect(document.body.textContent).toContain("The plugin list changed.");
    expect(document.body.textContent).toContain("Mate");
  });

  test("preserves the prior plugin list across an unavailable refresh", async () => {
    let admission = 0;
    rpcImplementation = (method) => {
      if (method === "status") return Promise.resolve(snapshot());
      admission += 1;
      if (admission === 2) {
        return Promise.resolve(
          snapshot({
            state: "unavailable",
            reason: "catalog_unavailable",
            items: [],
          }),
        );
      }
      return Promise.resolve(
        snapshot({
          state: "ready",
          items: [
            admission === 1
              ? {
                  id: targetA,
                  label: "Mate",
                  pluginId: "mate",
                  revision: 1,
                }
              : {
                  id: targetB,
                  label: "Linear",
                  pluginId: "linear",
                  revision: 2,
                },
          ],
        }),
      );
    };

    await renderPanel();
    await act(async () => button("Open")?.click());
    await flush();
    await act(async () => button("Refresh")?.click());
    await flush();
    expect(document.body.textContent).not.toContain("The plugin list changed.");

    await act(async () => button("Refresh")?.click());
    await flush();
    expect(document.body.textContent).toContain("The plugin list changed.");
    expect(document.body.textContent).toContain("Linear");
  });

  test("compares plugin-list changes within a project instead of across projects", async () => {
    rpcImplementation = (method, input) => {
      if (method === "status") return Promise.resolve(snapshot());
      const projectId = (input as { projectId: string }).projectId;
      return Promise.resolve(
        snapshot({
          state: "ready",
          items: [
            projectId === "project_01"
              ? {
                  id: targetA,
                  label: "Mate",
                  pluginId: "mate",
                  revision: 1,
                }
              : {
                  id: targetB,
                  label: "Remote plugin",
                  pluginId: "remote",
                  revision: 1,
                },
          ],
        }),
      );
    };

    await renderPanel();
    await act(async () => button("Open")?.click());
    await flush();
    await act(async () => button("Open")?.click());
    await flush();

    expect(document.body.textContent).toContain("Remote plugin");
    expect(document.body.textContent).not.toContain("The plugin list changed.");
  });

  test("ignores superseded reload responses and never polls", async () => {
    const older = deferred<unknown>();
    const newer = deferred<unknown>();
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      if (calls === 1) return Promise.resolve(snapshot());
      return calls === 2 ? older.promise : newer.promise;
    };
    await renderPanel();
    const reload = document.querySelector(
      '[aria-label="Reload Workbench data"]',
    );
    expect(reload).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      reload?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      reload?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    newer.resolve(snapshot());
    await flush();
    older.resolve({
      ...snapshot(),
      projects: { state: "ready", items: [] },
    } satisfies PluginWorkbenchSnapshot);
    await flush();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(document.body.textContent).not.toContain("No local projects found");
    expect(rpcCall).toHaveBeenCalledTimes(3);
  });
});
