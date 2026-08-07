import { describe, expect, test } from "bun:test";
import {
  findSurface,
  resolveCatalogSelection,
  surfaceCatalog,
} from "./surface-catalog";

describe("plugin surface catalog", () => {
  test("covers every public PluginAppBuilder registration group exactly once", () => {
    expect(
      surfaceCatalog.map(({ registrationPath }) => registrationPath),
    ).toEqual([
      "slots.homepageSection",
      "slots.settingsSection",
      "slots.navPanel",
      "slots.threadPanelAction",
      "slots.pendingInteraction",
      "slots.sidebarFooterAction",
      "slots.experimental_threadList",
      "slots.experimental_threadHeaderAction",
      "slots.fileOpener",
      "slots.messageDirective",
      "slots.messageAction",
      "composer.customize",
      "contentScripts.register",
    ]);
    expect(new Set(surfaceCatalog.map(({ id }) => id)).size).toBe(13);
  });

  test("makes rendering ownership, trust, fidelity, and lifecycle explicit", () => {
    const threadList = findSurface("thread-list");
    const contentScript = findSurface("content-script");

    expect(threadList.classification).toBe("plugin-component");
    expect(threadList.exclusive).toBe(true);
    expect(threadList.fixtureSchema).toBe("sidebar-thread-list/v1");
    expect(threadList.previewPlacement).toBe("sidebar-list");
    expect(threadList.validation.live.visualAuthority).toBe(true);

    expect(findSurface("sidebar-footer-action").classification).toBe(
      "host-action",
    );
    expect(findSurface("message-action").bbOwnedVisuals).toBe(true);

    expect(contentScript.classification).toBe("content-script-lifecycle");
    expect(contentScript.trust).toBe("full-trust-local-code");
    expect(contentScript.lifecycle).toEqual({
      discovery: "never-mount",
      activation: "host-mounts-once-per-generation",
      replacement: "host-aborts-then-disposes-exactly-once",
    });

    for (const surface of surfaceCatalog) {
      expect(surface.publicContract.inputs.length).toBeGreaterThan(0);
      expect(surface.fixtures.length).toBeGreaterThan(0);
      expect(surface.validation.fixture.claim).toBe(
        "deterministic-approximation",
      );
      expect(surface.validation.harness.claim).toBe("public-contract");
      expect(surface.validation.live.claim).toBe("visual-authority");
    }
  });

  test("owns the existing thread-list stories and resolves selections deterministically", () => {
    const threadList = findSurface("thread-list");

    expect(threadList.fixtures.map(({ id }) => id)).toEqual([
      "agents",
      "gitbutler",
      "quiet",
      "loading-empty",
      "provider-unavailable",
    ]);
    expect(threadList.fixtures[0]?.state).toMatchObject({
      project: "grid",
      threads: [
        {
          id: "patch",
          title: "@Patch [primary]",
          detail: "Coordinating the board",
          state: "running",
          isPinned: true,
        },
        {
          id: "rez",
          title: "@Rez [plugin build]",
          detail: "Waiting for review",
          state: "waiting",
          isUnread: true,
        },
        {
          id: "index",
          title: "@Index [research]",
          detail: "Idle 12m",
          state: "idle",
        },
      ],
    });

    expect(resolveCatalogSelection("thread-list", "quiet").fixture.id).toBe(
      "quiet",
    );
    expect(resolveCatalogSelection("missing", "missing")).toEqual({
      surface: surfaceCatalog[0],
      fixture: surfaceCatalog[0]?.fixtures[0],
    });
  });

  test("uses surface-specific product fixtures and models mixed ownership", () => {
    const pending = findSurface("pending-interaction").fixtures[0];
    expect(pending.state.interaction.title).toBe("Choose a release channel");
    expect(pending.interactions.map(({ id }) => id)).toEqual([
      "submit",
      "cancel",
    ]);

    const threadPanel = findSurface("thread-panel-action");
    expect(threadPanel.classification).toBe("mixed");
    expect(threadPanel.rendering).toEqual([
      { part: "launcher", owner: "bb", kind: "chrome" },
      { part: "panel-content", owner: "plugin", kind: "component" },
      { part: "open-outcome", owner: "bb", kind: "interaction-outcome" },
    ]);
    expect(threadPanel.fixtures[0]?.interactions[0]?.outcome).toBe(
      "host-opens-plugin-panel",
    );

    expect(findSurface("file-opener").fixtures[0]?.state).toMatchObject({
      path: "docs/architecture.md",
      source: { kind: "workspace", projectId: "project-bb-mate" },
    });
    expect(
      findSurface("message-directive").fixtures[0]?.state.attributes,
    ).toEqual({ file: "artifacts/report.html" });
    expect(findSurface("message-action").fixtures[0]?.state.message).toEqual({
      id: "message-report",
      threadId: "thread-release",
      role: "assistant",
      text: "The release summary is ready.",
      sourceSeqEnd: 42,
    });

    const composer = findSurface("composer-customization");
    expect(composer.classification).toBe("mixed");
    expect(composer.fixtures[0]?.state.view).toMatchObject({
      layout: "expanded",
      draft: { text: "Summarize @release", attachmentCount: 0 },
    });
    expect(composer.fixtures[0]?.state.registrations).toMatchObject({
      plusMenu: ["attach-context"],
      richTextEffects: ["mention-release"],
    });

    const unavailable = findSurface("thread-list").fixtures.find(
      ({ id }) => id === "provider-unavailable",
    );
    expect(unavailable?.state.provider).toEqual({
      selected: "plugin",
      availability: "unavailable",
      outcome: "built-in-fallback",
    });
    expect(unavailable?.interactions.map(({ id }) => id)).toContain(
      "restore-built-in-provider",
    );

    const threadList = findSurface("thread-list");
    expect(
      threadList.fixtures.some(({ state }) => state.status === "loading"),
    ).toBe(true);
    const fixtureActions = new Set<string>(
      threadList.fixtures.flatMap(({ interactions }) =>
        interactions.flatMap((interaction) =>
          "action" in interaction && interaction.action
            ? [interaction.action]
            : [],
        ),
      ),
    );
    const claimedActions: string[] = [...threadList.publicContract.actions];
    expect([...fixtureActions].sort()).toEqual(claimedActions.sort());
  });
});
