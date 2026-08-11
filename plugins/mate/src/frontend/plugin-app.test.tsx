import { describe, expect, mock, test } from "bun:test";

mock.module("@bb/plugin-sdk/app", () => ({
  definePluginApp: (setup: unknown) => ({ __bbPluginApp: true, setup }),
  useBbContext: () => ({ projectId: null, threadId: null }),
  useRpc: () => ({ call: () => Promise.reject(new Error("not rendered")) }),
}));

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
});
