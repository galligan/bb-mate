import { useState } from "react";
import { createRoot } from "react-dom/client";

import {
  PluginWorkbenchTargetDetail,
  PluginWorkbenchView,
} from "../src/frontend/workbench-panel";
import "../dist/app.css";
import {
  parsePluginWorkbenchSnapshot,
  type PluginWorkbenchSnapshot,
} from "../src/frontend/workbench-snapshot";
import "./visual.css";

type FixtureName =
  | "idle"
  | "failed"
  | "admitting"
  | "no-projects"
  | "empty"
  | "single"
  | "multiple"
  | "partial-empty"
  | "partial"
  | "unavailable"
  | "changed"
  | "hostile"
  | "detail";

const targetA = "abcdefghijklmnopqrstuvwxzy012345";
const targetB = "0123456789abcdefghijklmnopqrstuv";
const project = {
  id: "project_01",
  label: "BB Mate",
  admission: "available",
} as const;
const target = {
  id: targetA,
  label: "Plugin Workbench",
  pluginId: "mate",
  revision: 3,
} as const;

const readyBase = {
  schemaVersion: 2,
  runtimeState: "ready",
  reason: null,
  runtimeVersion: "0.7.0",
  apiVersion: 2,
  canStart: false,
  browserLaunch: "unavailable",
  projects: { state: "ready", items: [project] },
} as const;

interface Fixture {
  snapshot: PluginWorkbenchSnapshot;
  openedProjectId: string | null;
  selectionMessage: string | null;
  admitting?: boolean;
  detail?: boolean;
}

const fixtures: Record<FixtureName, Fixture> = {
  idle: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      runtimeState: "idle",
      runtimeVersion: null,
      apiVersion: null,
      canStart: true,
      targets: { state: "unavailable", reason: "runtime_not_ready", items: [] },
    }),
    openedProjectId: null,
    selectionMessage: null,
  },
  failed: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      runtimeState: "failed",
      reason: "startup_failed",
      runtimeVersion: null,
      apiVersion: null,
      canStart: true,
      targets: {
        state: "unavailable",
        reason: "runtime_not_ready",
        items: [],
      },
    }),
    openedProjectId: project.id,
    selectionMessage: "Project admission failed safely. Try again.",
  },
  admitting: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: { state: "project_not_selected", items: [] },
    }),
    openedProjectId: null,
    selectionMessage: null,
    admitting: true,
  },
  "no-projects": {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      projects: { state: "ready", items: [] },
      targets: { state: "project_not_selected", items: [] },
    }),
    openedProjectId: null,
    selectionMessage: null,
  },
  empty: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: { state: "ready", items: [] },
    }),
    openedProjectId: project.id,
    selectionMessage: null,
  },
  single: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: { state: "ready", items: [target] },
    }),
    openedProjectId: project.id,
    selectionMessage: null,
  },
  multiple: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: {
        state: "ready",
        items: [
          target,
          { id: targetB, label: "Linear", pluginId: "linear", revision: 2 },
        ],
      },
    }),
    openedProjectId: project.id,
    selectionMessage: null,
  },
  "partial-empty": {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: { state: "partial", items: [] },
    }),
    openedProjectId: project.id,
    selectionMessage: null,
  },
  partial: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: { state: "partial", items: [target] },
    }),
    openedProjectId: project.id,
    selectionMessage: null,
  },
  unavailable: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      projects: { state: "unavailable", items: [] },
      targets: {
        state: "unavailable",
        reason: "catalog_unavailable",
        items: [],
      },
    }),
    openedProjectId: null,
    selectionMessage: null,
  },
  changed: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: {
        state: "ready",
        items: [
          { id: targetB, label: "Linear", pluginId: "linear", revision: 2 },
        ],
      },
    }),
    openedProjectId: project.id,
    selectionMessage: "The target list changed. Choose a target.",
  },
  hostile: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      projects: {
        state: "ready",
        items: [{ ...project, label: '<img src=x onerror="alert(1)">' }],
      },
      targets: {
        state: "ready",
        items: [{ ...target, label: '<script>alert("x")' }],
      },
    }),
    openedProjectId: project.id,
    selectionMessage: null,
  },
  detail: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: { state: "ready", items: [target] },
    }),
    openedProjectId: project.id,
    selectionMessage: null,
    detail: true,
  },
};

const parameters = new URLSearchParams(window.location.search);
const fixtureName = parameters.get("state");
const selected = Object.hasOwn(fixtures, fixtureName ?? "")
  ? (fixtureName as FixtureName)
  : "idle";
document.documentElement.dataset.theme =
  parameters.get("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.fixture = selected;

function VisualFixture({ fixture }: { fixture: Fixture }) {
  const [projectId, setProjectId] = useState(fixture.openedProjectId);
  if (fixture.detail) {
    return (
      <PluginWorkbenchTargetDetail
        snapshot={fixture.snapshot}
        busy={false}
        message={fixture.selectionMessage}
        projectLabel="BB Mate"
        target={target}
        threads={[
          { id: "thread_01", title: "Native Workbench design", updatedAt: 2 },
          { id: "thread_02", title: "Plugin target admission", updatedAt: 1 },
        ]}
        threadsState="ready"
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
      openedProjectId={projectId}
      admittingProjectId={fixture.admitting ? project.id : null}
      selectionMessage={fixture.selectionMessage}
      onOpenProject={setProjectId}
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
