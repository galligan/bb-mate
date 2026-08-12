import { createRoot } from "react-dom/client";

import {
  PluginWorkbenchMissingTarget,
  PluginWorkbenchTargetDetail,
  PluginWorkbenchView,
} from "../src/frontend/workbench-panel";
import "../dist/app.css";
import {
  parsePluginWorkbenchSnapshot,
  type PluginWorkbenchSnapshot,
  type ProjectOption,
} from "../src/frontend/workbench-snapshot";
import "./visual.css";

type FixtureName =
  | "idle"
  | "failed"
  | "refreshing"
  | "no-projects"
  | "all-projects"
  | "partial"
  | "partial-empty"
  | "project-unavailable"
  | "catalog-unavailable"
  | "changed"
  | "hostile"
  | "detail"
  | "detail-empty"
  | "detail-unavailable"
  | "stale-detail";

const targetA = "abcdefghijklmnopqrstuvwxzy012345";
const targetB = "0123456789abcdefghijklmnopqrstuv";
const target = {
  id: targetA,
  label: "Plugin Studio",
  pluginId: "mate",
  revision: 3,
} as const;

function project(
  id: string,
  label: string,
  scan: ProjectOption["scan"],
  activity: ProjectOption["activity"] = {
    active: false,
    lastThreadUpdatedAt: null,
  },
): ProjectOption {
  return { id, label, activity, scan };
}

function readySnapshot(
  items: ProjectOption[],
  state: "ready" | "partial" = items.some(
    ({ scan }) => scan.state === "partial" || scan.state === "unavailable",
  )
    ? "partial"
    : "ready",
  truncated = false,
): PluginWorkbenchSnapshot {
  return parsePluginWorkbenchSnapshot({
    schemaVersion: 3,
    runtimeState: "ready",
    reason: null,
    runtimeVersion: "0.7.0",
    apiVersion: 2,
    canStart: false,
    browserLaunch: "unavailable",
    projects: { state, truncated, items },
  });
}

const allProjects = readySnapshot([
  project(
    "project_01",
    "bb Plugin Studio",
    {
      state: "ready",
      items: [
        target,
        { id: targetB, label: "Linear", pluginId: "linear", revision: 2 },
      ],
    },
    { active: true, lastThreadUpdatedAt: 3 },
  ),
  project("project_02", "Empty Project", { state: "ready", items: [] }),
  project(
    "project_03",
    "Recently Used",
    {
      state: "ready",
      items: [
        {
          id: "zyxwvutsrqponmlkjihgfedcba987654",
          label: "Status Tools",
          pluginId: "status-tools",
          revision: 1,
        },
      ],
    },
    { active: false, lastThreadUpdatedAt: 2 },
  ),
]);

interface Fixture {
  snapshot: PluginWorkbenchSnapshot;
  catalogMessage?: string | null;
  detail?: "ready" | "empty" | "unavailable" | "stale";
  refreshing?: boolean;
}

const fixtures: Record<FixtureName, Fixture> = {
  idle: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...allProjects,
      runtimeState: "idle",
      runtimeVersion: null,
      apiVersion: null,
      canStart: true,
      projects: {
        state: "ready",
        truncated: false,
        items: allProjects.projects.items.map((item) => ({
          ...item,
          scan: { state: "not_scanned", items: [] },
        })),
      },
    }),
  },
  failed: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...allProjects,
      runtimeState: "failed",
      reason: "startup_failed",
      runtimeVersion: null,
      apiVersion: null,
      canStart: true,
      projects: {
        state: "partial",
        truncated: false,
        items: [
          project("project_01", "bb Plugin Studio", {
            state: "unavailable",
            reason: "scan_failed",
            items: [],
          }),
        ],
      },
    }),
    catalogMessage: "Plugin Studio reload failed safely. Try again.",
  },
  refreshing: { snapshot: allProjects, refreshing: true },
  "no-projects": { snapshot: readySnapshot([]) },
  "all-projects": { snapshot: allProjects },
  partial: {
    snapshot: readySnapshot(
      [
        project("project_01", "bb Plugin Studio", {
          state: "partial",
          items: [target],
        }),
        project("project_02", "Linear Tools", {
          state: "ready",
          items: [
            { id: targetB, label: "Linear", pluginId: "linear", revision: 2 },
          ],
        }),
      ],
      "partial",
      true,
    ),
  },
  "partial-empty": {
    snapshot: readySnapshot([
      project("project_01", "bb Plugin Studio", {
        state: "partial",
        items: [],
      }),
      project("project_02", "Linear Tools", {
        state: "ready",
        items: [
          { id: targetB, label: "Linear", pluginId: "linear", revision: 2 },
        ],
      }),
    ]),
  },
  "project-unavailable": {
    snapshot: readySnapshot([
      project("project_01", "Changed Project", {
        state: "unavailable",
        reason: "source_changed",
        items: [],
      }),
      project("project_02", "Working Project", {
        state: "ready",
        items: [target],
      }),
    ]),
  },
  "catalog-unavailable": {
    snapshot: parsePluginWorkbenchSnapshot({
      ...allProjects,
      projects: { state: "unavailable", items: [] },
    }),
  },
  changed: {
    snapshot: allProjects,
    catalogMessage: "The plugin list changed.",
  },
  hostile: {
    snapshot: readySnapshot([
      project("project_01", '<img src=x onerror="alert(1)">', {
        state: "ready",
        items: [
          {
            ...target,
            label:
              '<script>alert("x") — A deliberately long plugin label that must wrap without escaping its project row',
          },
        ],
      }),
    ]),
  },
  detail: { snapshot: allProjects, detail: "ready" },
  "detail-empty": { snapshot: allProjects, detail: "empty" },
  "detail-unavailable": { snapshot: allProjects, detail: "unavailable" },
  "stale-detail": { snapshot: allProjects, detail: "stale" },
};

const parameters = new URLSearchParams(window.location.search);
const fixtureName = parameters.get("state");
const selected = Object.hasOwn(fixtures, fixtureName ?? "")
  ? (fixtureName as FixtureName)
  : "all-projects";
document.documentElement.dataset.theme =
  parameters.get("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.fixture = selected;

function VisualFixture({ fixture }: { fixture: Fixture }) {
  if (fixture.detail === "stale") {
    return (
      <PluginWorkbenchMissingTarget
        snapshot={fixture.snapshot}
        refreshing={false}
        catalogMessage={fixture.catalogMessage ?? null}
        reason="removed"
        onBack={() => {}}
        onRefresh={() => {}}
      />
    );
  }
  if (fixture.detail) {
    return (
      <PluginWorkbenchTargetDetail
        snapshot={fixture.snapshot}
        projectLabel="bb Plugin Studio"
        target={target}
        threads={
          fixture.detail === "ready"
            ? {
                state: "ready",
                items: [
                  {
                    id: "thread_01",
                    title: "Native Plugin Studio design",
                    updatedAt: 2,
                  },
                  {
                    id: "thread_02",
                    title: "Plugin catalog refresh",
                    updatedAt: 1,
                  },
                ],
              }
            : fixture.detail === "empty"
              ? { state: "ready", items: [] }
              : { state: "unavailable", items: [] }
        }
        refreshing={false}
        catalogMessage={fixture.catalogMessage ?? null}
        onBack={() => {}}
        onOpenThread={() => {}}
        onNewThread={() => {}}
        onRefresh={() => {}}
      />
    );
  }
  return (
    <PluginWorkbenchView
      snapshot={fixture.snapshot}
      refreshing={fixture.refreshing ?? false}
      catalogMessage={fixture.catalogMessage ?? null}
      onOpenTarget={() => {}}
      onRefresh={() => {}}
    />
  );
}

const root = document.querySelector("#panel-fixture");
if (!(root instanceof HTMLElement))
  throw new Error("Fixture root unavailable.");
root.dataset.bbPlugin = "mate";
createRoot(root).render(<VisualFixture fixture={fixtures[selected]} />);
