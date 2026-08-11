import { createRoot } from "react-dom/client";

import { PluginWorkbenchView } from "../src/frontend/workbench-panel";
import "../src/frontend/workbench-panel.css";
import {
  parsePluginWorkbenchSnapshot,
  type PluginWorkbenchSnapshot,
} from "../src/frontend/workbench-snapshot";
import "./visual.css";

type FixtureName = "idle" | "ready" | "unavailable" | "hostile";

const base = {
  schemaVersion: 1,
  reason: null,
  runtimeVersion: null,
  apiVersion: null,
  browserLaunch: "unavailable",
  targets: "unavailable_pending_runtime_admission",
} as const;

const fixtures: Record<FixtureName, PluginWorkbenchSnapshot> = {
  idle: parsePluginWorkbenchSnapshot({
    ...base,
    runtimeState: "idle",
    canStart: true,
  }),
  ready: parsePluginWorkbenchSnapshot({
    ...base,
    runtimeState: "ready",
    runtimeVersion: "0.1.0-alpha.1",
    apiVersion: 1,
    canStart: false,
  }),
  unavailable: parsePluginWorkbenchSnapshot({
    ...base,
    runtimeState: "unavailable",
    reason: "artifact_missing",
    canStart: false,
  }),
  // Deliberately bypass the transport codec to prove React remains inert if a
  // future adapter accidentally forwards hostile display text.
  hostile: {
    ...base,
    runtimeState: "ready",
    runtimeVersion: '<img src=x onerror="alert(1)">',
    apiVersion: 1,
    canStart: false,
  },
};

const parameters = new URLSearchParams(window.location.search);
const fixtureName = parameters.get("state");
const selected =
  fixtureName === "idle" ||
  fixtureName === "ready" ||
  fixtureName === "unavailable" ||
  fixtureName === "hostile"
    ? fixtureName
    : "idle";
document.documentElement.dataset.theme =
  parameters.get("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.fixture = selected;

const root = document.querySelector("#panel-fixture");
if (!(root instanceof HTMLElement))
  throw new Error("Fixture root unavailable.");

createRoot(root).render(
  <PluginWorkbenchView snapshot={fixtures[selected]} onDemand={() => {}} />,
);
