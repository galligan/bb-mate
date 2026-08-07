import type { ProductFixture } from "./surface-fixture-types";

export const homepageFixtures = [
  {
    id: "project-selected",
    name: "Project selected",
    description: "Homepage content with an active project.",
    state: { projectId: "project-bb-mate", content: "project-overview" },
    interactions: [{ id: "render", outcome: "plugin-section-visible" }],
  },
] as const satisfies readonly ProductFixture<
  { projectId: string | null; content: "project-overview" },
  { id: "render"; outcome: "plugin-section-visible" }
>[];

export const settingsFixtures = [
  {
    id: "configured",
    name: "Configured",
    description: "Plugin settings with a deterministic enabled value.",
    state: { values: { enabled: true }, isSaving: false },
    interactions: [
      {
        id: "toggle-enabled",
        enabled: false,
        outcome: "plugin-updates-setting",
      },
    ],
  },
] as const satisfies readonly ProductFixture<
  { values: { enabled: boolean }; isSaving: boolean },
  { id: "toggle-enabled"; enabled: boolean; outcome: "plugin-updates-setting" }
>[];

export const navigationPanelFixtures = [
  {
    id: "nested-route",
    name: "Nested route",
    description: "Plugin route content at a deterministic subpath.",
    state: { subPath: "work/ideas.md", title: "Ideas" },
    interactions: [
      {
        id: "navigate",
        subPath: "work/today.md",
        outcome: "host-updates-route",
      },
    ],
  },
] as const satisfies readonly ProductFixture<
  { subPath: string; title: string },
  { id: "navigate"; subPath: string; outcome: "host-updates-route" }
>[];

export const threadPanelFixtures = [
  {
    id: "launcher-ready",
    name: "Launcher ready",
    description: "Host launcher is ready to open plugin panel content.",
    state: {
      threadId: "thread-release",
      params: { view: "summary" },
      launcher: "available",
      panel: "closed",
    },
    interactions: [
      {
        id: "activate-launcher",
        params: { view: "summary" },
        outcome: "host-opens-plugin-panel",
      },
    ],
  },
] as const satisfies readonly ProductFixture<
  {
    threadId: string;
    params: { view: string } | null;
    launcher: "available";
    panel: "closed" | "open";
  },
  {
    id: "activate-launcher";
    params: { view: string };
    outcome: "host-opens-plugin-panel";
  }
>[];

export const pendingInteractionFixtures = [
  {
    id: "awaiting-choice",
    name: "Awaiting choice",
    description: "A deterministic plugin input request awaiting a response.",
    state: {
      interaction: {
        id: "interaction-release",
        threadId: "thread-release",
        title: "Choose a release channel",
        payload: { channels: ["alpha", "beta"] },
        createdAt: 1786111200000,
        expiresAt: null,
      },
      status: "pending",
    },
    interactions: [
      { id: "submit", value: "alpha", outcome: "host-submits-value" },
      { id: "cancel", outcome: "host-cancels-request" },
    ],
  },
] as const satisfies readonly ProductFixture<
  {
    interaction: {
      id: string;
      threadId: string;
      title: string;
      payload: { channels: readonly string[] };
      createdAt: number;
      expiresAt: number | null;
    };
    status: "pending";
  },
  | { id: "submit"; value: string; outcome: "host-submits-value" }
  | { id: "cancel"; outcome: "host-cancels-request" }
>[];

export const sidebarFooterFixtures = [
  {
    id: "enabled",
    name: "Enabled",
    description: "Host footer action registered and available.",
    state: { availability: "enabled", settings: "closed" },
    interactions: [
      { id: "activate", outcome: "host-invokes-plugin-callback" },
      { id: "open-settings", outcome: "host-opens-plugin-settings" },
    ],
  },
] as const satisfies readonly ProductFixture<
  { availability: "enabled"; settings: "closed" },
  {
    id: "activate" | "open-settings";
    outcome: "host-invokes-plugin-callback" | "host-opens-plugin-settings";
  }
>[];

export const threadHeaderFixtures = [
  {
    id: "desktop-thread",
    name: "Desktop thread",
    description: "One compact plugin control for a visible thread header.",
    state: {
      threadId: "thread-release",
      projectId: "project-bb-mate",
      isCompactViewport: false,
      controlState: "idle",
    },
    interactions: [{ id: "activate", outcome: "plugin-control-activates" }],
  },
] as const satisfies readonly ProductFixture<
  {
    threadId: string;
    projectId: string;
    isCompactViewport: boolean;
    controlState: "idle";
  },
  { id: "activate"; outcome: "plugin-control-activates" }
>[];

export const fileOpenerFixtures = [
  {
    id: "workspace-markdown",
    name: "Workspace Markdown",
    description: "A worktree-relative Markdown file selected for the plugin.",
    state: {
      path: "docs/architecture.md",
      source: {
        kind: "workspace",
        threadId: "thread-release",
        environmentId: "environment-local",
        projectId: "project-bb-mate",
      },
      mode: "preview",
    },
    interactions: [{ id: "save", outcome: "plugin-requests-save" }],
  },
] as const satisfies readonly ProductFixture<
  {
    path: string;
    source: {
      kind: "workspace" | "host" | "thread-storage";
      threadId: string | null;
      environmentId: string | null;
      projectId: string | null;
    };
    mode: "preview" | "edit";
  },
  { id: "save"; outcome: "plugin-requests-save" }
>[];

export const messageDirectiveFixtures = [
  {
    id: "artifact-link",
    name: "Artifact link",
    description: "Directive attributes parsed from one assistant message.",
    state: {
      attributes: { file: "artifacts/report.html" },
      source: '::artifact{file="artifacts/report.html"}',
      message: {
        id: "message-report",
        threadId: "thread-release",
        turnId: "turn-report",
        projectId: "project-bb-mate",
      },
      workspaceFileAvailable: true,
    },
    interactions: [
      {
        id: "open-workspace-file",
        path: "artifacts/report.html",
        outcome: "host-accepts-workspace-path",
      },
    ],
  },
] as const satisfies readonly ProductFixture<
  {
    attributes: Readonly<Record<string, string>>;
    source: string;
    message: {
      id: string;
      threadId: string;
      turnId: string | null;
      projectId: string | null;
    };
    workspaceFileAvailable: boolean;
  },
  {
    id: "open-workspace-file";
    path: string;
    outcome: "host-accepts-workspace-path";
  }
>[];

export const messageActionFixtures = [
  {
    id: "selection-ready",
    name: "Selection ready",
    description: "Host action invoked for selected assistant-message text.",
    state: {
      threadId: "thread-release",
      message: {
        id: "message-report",
        threadId: "thread-release",
        role: "assistant",
        text: "The release summary is ready.",
        sourceSeqEnd: 42,
      },
      selectedText: "release summary",
      panel: "closed",
    },
    interactions: [
      { id: "activate", outcome: "host-invokes-plugin-callback" },
      { id: "open-panel", outcome: "host-opens-plugin-panel" },
    ],
  },
] as const satisfies readonly ProductFixture<
  {
    threadId: string;
    message: {
      id: string;
      threadId: string;
      role: "assistant" | "user";
      text: string;
      sourceSeqEnd: number;
    };
    selectedText?: string;
    panel: "closed" | "open";
  },
  {
    id: "activate" | "open-panel";
    outcome: "host-invokes-plugin-callback" | "host-opens-plugin-panel";
  }
>[];

export const composerFixtures = [
  {
    id: "expanded-draft",
    name: "Expanded draft",
    description: "Composer view with menu and rich-text registrations.",
    state: {
      view: {
        scope: { kind: "new-thread", projectId: "project-bb-mate" },
        layout: "expanded",
        draft: {
          text: "Summarize @release",
          isEmpty: false,
          attachmentCount: 0,
        },
        run: { isRunning: false, isSubmitting: false },
      },
      registrations: {
        actions: ["summarize"],
        banners: ["release-context"],
        plusMenu: ["attach-context"],
        richTextEffects: ["mention-release"],
      },
    },
    interactions: [
      { id: "run-plus-menu", outcome: "host-invokes-plugin-menu-callback" },
      { id: "match-rich-text", outcome: "plugin-returns-paint-ranges" },
    ],
  },
] as const satisfies readonly ProductFixture<
  {
    view: {
      scope: { kind: "new-thread"; projectId: string | null };
      layout: "expanded" | "compact" | "zen";
      draft: { text: string; isEmpty: boolean; attachmentCount: number };
      run: { isRunning: boolean; isSubmitting: boolean };
    };
    registrations: {
      actions: readonly string[];
      banners: readonly string[];
      plusMenu: readonly string[];
      richTextEffects: readonly string[];
    };
  },
  {
    id: "run-plus-menu" | "match-rich-text";
    outcome:
      "host-invokes-plugin-menu-callback" | "plugin-returns-paint-ranges";
  }
>[];

export const contentScriptFixtures = [
  {
    id: "unmounted",
    name: "Unmounted",
    description: "Discovery records the lifecycle without mounting code.",
    state: {
      phase: "unmounted",
      pluginId: "example",
      generation: 0,
      aborted: false,
    },
    interactions: [
      { id: "describe-lifecycle", outcome: "no-code-mounted" },
      { id: "replace-generation", outcome: "host-aborts-then-disposes" },
    ],
  },
] as const satisfies readonly ProductFixture<
  {
    phase: "unmounted" | "mounted" | "disposing";
    pluginId: string;
    generation: number;
    aborted: boolean;
  },
  {
    id: "describe-lifecycle" | "replace-generation";
    outcome: "no-code-mounted" | "host-aborts-then-disposes";
  }
>[];
