import { useState } from "react";
import { createRoot } from "react-dom/client";

import { PluginWorkbenchView } from "../src/frontend/workbench-panel";
import "../src/frontend/workbench-panel.css";
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
  | "partial"
  | "unavailable"
  | "changed"
  | "hostile";

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
  selectedProjectId: string;
  selectedTargetId: string | null;
  selectionMessage: string | null;
  admitting?: boolean;
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
    selectedProjectId: "",
    selectedTargetId: null,
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
    selectedProjectId: project.id,
    selectedTargetId: null,
    selectionMessage: "Project admission failed safely. Try again.",
  },
  admitting: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: { state: "project_not_selected", items: [] },
    }),
    selectedProjectId: project.id,
    selectedTargetId: null,
    selectionMessage: null,
    admitting: true,
  },
  "no-projects": {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      projects: { state: "ready", items: [] },
      targets: { state: "project_not_selected", items: [] },
    }),
    selectedProjectId: "",
    selectedTargetId: null,
    selectionMessage: null,
  },
  empty: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: { state: "ready", items: [] },
    }),
    selectedProjectId: project.id,
    selectedTargetId: null,
    selectionMessage: null,
  },
  single: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: { state: "ready", items: [target] },
    }),
    selectedProjectId: project.id,
    selectedTargetId: target.id,
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
    selectedProjectId: project.id,
    selectedTargetId: null,
    selectionMessage: null,
  },
  partial: {
    snapshot: parsePluginWorkbenchSnapshot({
      ...readyBase,
      targets: { state: "partial", items: [target] },
    }),
    selectedProjectId: project.id,
    selectedTargetId: target.id,
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
    selectedProjectId: "",
    selectedTargetId: null,
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
    selectedProjectId: project.id,
    selectedTargetId: targetB,
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
        items: [{ ...target, label: '<script>alert("x")</script>' }],
      },
    }),
    selectedProjectId: project.id,
    selectedTargetId: target.id,
    selectionMessage: null,
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
  const [projectId, setProjectId] = useState(fixture.selectedProjectId);
  const [targetId, setTargetId] = useState(fixture.selectedTargetId);
  return (
    <PluginWorkbenchView
      snapshot={fixture.snapshot}
      selectedProjectId={projectId}
      selectedTargetId={targetId}
      admitting={fixture.admitting ?? false}
      selectionMessage={fixture.selectionMessage}
      onProjectChange={setProjectId}
      onTargetChange={setTargetId}
      onAdmit={() => {}}
      onRefresh={() => {}}
    />
  );
}

const root = document.querySelector("#panel-fixture");
if (!(root instanceof HTMLElement))
  throw new Error("Fixture root unavailable.");
createRoot(root).render(<VisualFixture fixture={fixtures[selected]} />);
