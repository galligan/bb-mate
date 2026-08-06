export type ThreadState = "idle" | "running" | "waiting";

export interface ThreadFixture {
  id: string;
  title: string;
  detail: string;
  state: ThreadState;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  threads: ThreadFixture[];
}

export const scenarios: Scenario[] = [
  {
    id: "agents",
    name: "Agent focus",
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
