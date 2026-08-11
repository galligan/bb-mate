import { PluginWorkbenchView } from "./workbench-panel";
import type {
  PluginWorkbenchRuntimeState,
  PluginWorkbenchSnapshot,
} from "./workbench-snapshot";

const targetId = "abcdefghijklmnopqrstuvwxzy012345";

function snapshot(
  runtimeState: PluginWorkbenchRuntimeState,
  overrides: Partial<PluginWorkbenchSnapshot> = {},
): PluginWorkbenchSnapshot {
  const failed = runtimeState === "failed";
  const unavailable = runtimeState === "unavailable";
  return {
    schemaVersion: 2,
    runtimeState,
    reason: failed
      ? "startup_failed"
      : unavailable
        ? "unsupported_platform"
        : null,
    runtimeVersion: runtimeState === "ready" ? "0.7.0" : null,
    apiVersion: runtimeState === "ready" ? 2 : null,
    canStart: runtimeState === "idle" || failed,
    browserLaunch: "unavailable",
    projects: {
      state: "ready",
      items: [{ id: "project_01", label: "BB Mate", admission: "available" }],
    },
    targets: { state: "project_not_selected", items: [] },
    ...overrides,
  };
}

function Fixture({
  value,
  selectedProjectId = "",
  selectedTargetId = null,
}: {
  value: PluginWorkbenchSnapshot;
  selectedProjectId?: string;
  selectedTargetId?: string | null;
}) {
  return (
    <PluginWorkbenchView
      snapshot={value}
      selectedProjectId={selectedProjectId}
      selectedTargetId={selectedTargetId}
      admitting={false}
      selectionMessage={null}
      onProjectChange={() => {}}
      onTargetChange={() => {}}
      onAdmit={() => {}}
      onRefresh={() => {}}
    />
  );
}

export function Idle() {
  return <Fixture value={snapshot("idle")} />;
}
export function Starting() {
  return <Fixture value={snapshot("starting")} />;
}
export function Ready() {
  return <Fixture value={snapshot("ready")} />;
}
export function Stopping() {
  return <Fixture value={snapshot("stopping")} />;
}
export function Unavailable() {
  return <Fixture value={snapshot("unavailable")} />;
}
export function Failed() {
  return <Fixture value={snapshot("failed")} />;
}

export function HostileVersion() {
  const hostile = '<img src=x onerror="alert(1)">';
  return (
    <Fixture
      value={snapshot("ready", {
        projects: {
          state: "ready",
          items: [{ id: "project_01", label: hostile, admission: "available" }],
        },
        targets: {
          state: "ready",
          items: [
            { id: targetId, label: hostile, pluginId: "mate", revision: 1 },
          ],
        },
      })}
      selectedProjectId="project_01"
      selectedTargetId={targetId}
    />
  );
}
