import { PluginWorkbenchView } from "./workbench-panel";
import type { PluginWorkbenchSnapshot } from "./workbench-snapshot";

const targetId = "abcdefghijklmnopqrstuvwxzy012345";

function snapshot(
  overrides: Partial<PluginWorkbenchSnapshot> = {},
): PluginWorkbenchSnapshot {
  return {
    schemaVersion: 4,
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
  return <Fixture value={snapshot()} />;
}
export function Starting() {
  return <Fixture value={snapshot()} />;
}
export function Ready() {
  return <Fixture value={snapshot()} />;
}
export function Stopping() {
  return <Fixture value={snapshot()} />;
}
export function Unavailable() {
  return (
    <Fixture
      value={snapshot({ projects: { state: "unavailable", items: [] } })}
    />
  );
}
export function Failed() {
  return (
    <Fixture
      value={snapshot({ projects: { state: "unavailable", items: [] } })}
    />
  );
}

export function HostileVersion() {
  const hostile = '<img src=x onerror="alert(1)">';
  return (
    <Fixture
      value={snapshot({
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
