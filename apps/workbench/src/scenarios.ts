export type ThreadState = "idle" | "running" | "waiting";

export interface SidebarThreadModel {
  id: string;
  title: string;
  detail: string;
  state: ThreadState;
}

export interface SidebarListModel {
  project: string;
  threads: readonly SidebarThreadModel[];
}

export interface Scenario extends SidebarListModel {
  id: string;
  name: string;
  description: string;
}

export const scenarios: Scenario[] = [
  {
    id: "agents",
    name: "Agent focus",
    project: "grid",
    description: "A compact view of active, waiting, and quiet agent work.",
    threads: [
      {
        id: "patch",
        title: "@Patch [primary]",
        detail: "Coordinating the board",
        state: "running",
      },
      {
        id: "rez",
        title: "@Rez [plugin build]",
        detail: "Waiting for review",
        state: "waiting",
      },
      {
        id: "index",
        title: "@Index [research]",
        detail: "Idle 12m",
        state: "idle",
      },
    ],
  },
  {
    id: "gitbutler",
    name: "GitButler repo",
    project: "bb",
    description: "Repository state without the misleading mega-diff treatment.",
    threads: [
      {
        id: "worktree",
        title: "bb-mate",
        detail: "2 branches · 4 changed files",
        state: "running",
      },
      {
        id: "upstream",
        title: "get-bb/bb",
        detail: "main · clean",
        state: "idle",
      },
    ],
  },
  {
    id: "quiet",
    name: "Quiet workspace",
    project: "bb-mate",
    description: "The resting state should feel useful without feeling empty.",
    threads: [
      {
        id: "notes",
        title: "Sidebar notes",
        detail: "Idle 1h",
        state: "idle",
      },
    ],
  },
];

export function findScenario(id: string): Scenario {
  return scenarios.find((scenario) => scenario.id === id) ?? scenarios[0]!;
}
