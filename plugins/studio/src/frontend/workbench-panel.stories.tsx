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
    schemaVersion: 3,
    runtimeState,
    reason: failed
      ? "startup_failed"
      : unavailable
        ? "unsupported_platform"
        : null,
    runtimeVersion:
      runtimeState === "ready" || runtimeState === "stopping" ? "0.7.0" : null,
    apiVersion:
      runtimeState === "ready" || runtimeState === "stopping" ? 2 : null,
    canStart: runtimeState === "idle" || failed,
    browserLaunch: "unavailable",
    projects: {
      state: "ready",
      truncated: false,
      items: [
        {
          id: "project_01",
          label: "bb Plugin Studio",
          activity: { active: false, lastThreadUpdatedAt: null },
          scan: { state: "not_scanned", items: [] },
        },
      ],
    },
    ...overrides,
  };
}

function Fixture({ value }: { value: PluginWorkbenchSnapshot }) {
  return (
    <PluginWorkbenchView
      snapshot={value}
      refreshing={false}
      catalogMessage={null}
      onOpenTarget={() => {}}
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
          truncated: false,
          items: [
            {
              id: "project_01",
              label: hostile,
              activity: { active: true, lastThreadUpdatedAt: 42 },
              scan: {
                state: "ready",
                items: [
                  {
                    id: targetId,
                    label: hostile,
                    pluginId: "studio",
                    revision: 1,
                  },
                ],
              },
            },
          ],
        },
      })}
    />
  );
}
