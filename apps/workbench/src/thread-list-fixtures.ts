import type { ProductFixture } from "./surface-fixture-types";

export type ThreadState = "idle" | "running" | "waiting";

export interface SidebarThreadModel {
  id: string;
  title: string;
  detail: string;
  environment: string;
  branch: string;
  state: ThreadState;
  isPinned: boolean;
  isUnread: boolean;
  isArchived: boolean;
}

export interface SidebarListModel {
  status: "loading" | "ready" | "error";
  provider: {
    selected: "plugin" | "built-in";
    availability: "available" | "unavailable";
    outcome: "plugin-list" | "built-in-fallback";
  };
  activeThreadId: string | null;
  activeProjectId: string | null;
  isCompactViewport: boolean;
  searchQuery: string;
  project: string;
  projects: readonly { id: string; name: string; isPersonal: boolean }[];
  threads: readonly SidebarThreadModel[];
}

export type ThreadListInteraction =
  | {
      id: "open-thread";
      action: "open";
      threadId: string;
      outcome: "host-navigates";
    }
  | {
      id: "open-new-thread";
      action: "openNewThread";
      projectId: string;
      focusPrompt: boolean;
      outcome: "host-navigates-new-thread";
    }
  | {
      id: "navigation-complete";
      action: "onNavigate";
      outcome: "host-closes-compact-drawer";
    }
  | {
      id: "set-pinned";
      action: "setPinned";
      threadId: string;
      pinned: boolean;
      outcome: "host-updates-thread";
    }
  | {
      id: "set-read";
      action: "setRead";
      threadId: string;
      read: boolean;
      outcome: "host-updates-thread";
    }
  | {
      id: "rename";
      action: "rename";
      threadId: string;
      title: string;
      outcome: "host-updates-thread";
    }
  | {
      id: "archive";
      action: "archive";
      threadId: string;
      outcome: "host-archives-thread-tree";
    }
  | {
      id: "request-delete";
      action: "requestDelete";
      threadId: string;
      outcome: "host-opens-confirmation";
    }
  | {
      id: "restore-built-in-provider";
      action?: never;
      outcome: "host-renders-built-in-list";
    };

export type ThreadListFixture = ProductFixture<
  SidebarListModel,
  ThreadListInteraction
>;

export const threadListFixtures = [
  {
    id: "agents",
    name: "Agent focus",
    description: "A compact view of active, waiting, and quiet agent work.",
    state: {
      status: "ready",
      provider: {
        selected: "plugin",
        availability: "available",
        outcome: "plugin-list",
      },
      activeThreadId: "patch",
      activeProjectId: "project-grid",
      isCompactViewport: false,
      searchQuery: "",
      project: "grid",
      projects: [{ id: "project-grid", name: "grid", isPersonal: false }],
      threads: [
        {
          id: "patch",
          title: "@Patch [primary]",
          detail: "Coordinating the board",
          environment: "local macOS",
          branch: "main",
          state: "running",
          isPinned: true,
          isUnread: false,
          isArchived: false,
        },
        {
          id: "rez",
          title: "@Rez [plugin build]",
          detail: "Waiting for review",
          environment: "local macOS",
          branch: "os-633/ladle",
          state: "waiting",
          isPinned: false,
          isUnread: true,
          isArchived: false,
        },
        {
          id: "index",
          title: "@Index [research]",
          detail: "Idle 12m",
          environment: "research",
          branch: "main",
          state: "idle",
          isPinned: false,
          isUnread: false,
          isArchived: false,
        },
      ],
    },
    interactions: [
      {
        id: "open-thread",
        action: "open",
        threadId: "patch",
        outcome: "host-navigates",
      },
      {
        id: "open-new-thread",
        action: "openNewThread",
        projectId: "project-grid",
        focusPrompt: true,
        outcome: "host-navigates-new-thread",
      },
      {
        id: "navigation-complete",
        action: "onNavigate",
        outcome: "host-closes-compact-drawer",
      },
      {
        id: "set-pinned",
        action: "setPinned",
        threadId: "rez",
        pinned: true,
        outcome: "host-updates-thread",
      },
      {
        id: "set-read",
        action: "setRead",
        threadId: "rez",
        read: true,
        outcome: "host-updates-thread",
      },
      {
        id: "rename",
        action: "rename",
        threadId: "index",
        title: "Research index",
        outcome: "host-updates-thread",
      },
      {
        id: "archive",
        action: "archive",
        threadId: "index",
        outcome: "host-archives-thread-tree",
      },
      {
        id: "request-delete",
        action: "requestDelete",
        threadId: "index",
        outcome: "host-opens-confirmation",
      },
    ],
  },
  {
    id: "gitbutler",
    name: "GitButler repo",
    description: "Repository state without the misleading mega-diff treatment.",
    state: {
      status: "ready",
      provider: {
        selected: "plugin",
        availability: "available",
        outcome: "plugin-list",
      },
      activeThreadId: "worktree",
      activeProjectId: "project-bb",
      isCompactViewport: false,
      searchQuery: "bb",
      project: "bb",
      projects: [{ id: "project-bb", name: "bb", isPersonal: false }],
      threads: [
        {
          id: "worktree",
          title: "bb-plugin-studio",
          detail: "2 branches · 4 changed files",
          environment: "GitButler workspace",
          branch: "os-633/ladle",
          state: "running",
          isPinned: false,
          isUnread: true,
          isArchived: false,
        },
        {
          id: "upstream",
          title: "get-bb/bb",
          detail: "main · clean",
          environment: "read-only sibling",
          branch: "main",
          state: "idle",
          isPinned: false,
          isUnread: false,
          isArchived: false,
        },
      ],
    },
    interactions: [
      {
        id: "open-thread",
        action: "open",
        threadId: "worktree",
        outcome: "host-navigates",
      },
    ],
  },
  {
    id: "quiet",
    name: "Quiet workspace",
    description: "The resting state should feel useful without feeling empty.",
    state: {
      status: "ready",
      provider: {
        selected: "plugin",
        availability: "available",
        outcome: "plugin-list",
      },
      activeThreadId: null,
      activeProjectId: "project-personal",
      isCompactViewport: true,
      searchQuery: "",
      project: "bb-plugin-studio",
      projects: [
        { id: "project-personal", name: "bb-plugin-studio", isPersonal: true },
      ],
      threads: [
        {
          id: "notes",
          title: "Sidebar notes",
          detail: "Idle 1h",
          environment: "local macOS",
          branch: "main",
          state: "idle",
          isPinned: false,
          isUnread: false,
          isArchived: false,
        },
      ],
    },
    interactions: [
      {
        id: "open-thread",
        action: "open",
        threadId: "notes",
        outcome: "host-navigates",
      },
    ],
  },
  {
    id: "loading-empty",
    name: "Loading empty list",
    description:
      "The plugin provider is loading before projects or threads arrive.",
    state: {
      status: "loading",
      provider: {
        selected: "plugin",
        availability: "available",
        outcome: "plugin-list",
      },
      activeThreadId: null,
      activeProjectId: null,
      isCompactViewport: false,
      searchQuery: "",
      project: "Loading",
      projects: [],
      threads: [],
    },
    interactions: [],
  },
  {
    id: "provider-unavailable",
    name: "Provider unavailable",
    description:
      "The selected plugin is unavailable and bb restores its built-in list.",
    state: {
      status: "error",
      provider: {
        selected: "plugin",
        availability: "unavailable",
        outcome: "built-in-fallback",
      },
      activeThreadId: null,
      activeProjectId: null,
      isCompactViewport: false,
      searchQuery: "",
      project: "Built-in",
      projects: [],
      threads: [],
    },
    interactions: [
      {
        id: "restore-built-in-provider",
        outcome: "host-renders-built-in-list",
      },
    ],
  },
] as const satisfies readonly ThreadListFixture[];
