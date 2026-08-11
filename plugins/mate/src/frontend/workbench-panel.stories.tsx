import { PluginWorkbenchView } from "./workbench-panel";
import type {
  PluginWorkbenchRuntimeState,
  PluginWorkbenchSnapshot,
} from "./workbench-snapshot";

function snapshot(
  runtimeState: PluginWorkbenchRuntimeState,
  overrides: Partial<PluginWorkbenchSnapshot> = {},
): PluginWorkbenchSnapshot {
  const failed = runtimeState === "failed";
  const unavailable = runtimeState === "unavailable";
  return {
    schemaVersion: 1,
    runtimeState,
    reason: failed
      ? "startup_failed"
      : unavailable
        ? "unsupported_platform"
        : null,
    runtimeVersion: runtimeState === "ready" ? "0.1.0-alpha.1" : null,
    apiVersion: runtimeState === "ready" ? 1 : null,
    canStart: runtimeState === "idle" || failed,
    browserLaunch: "unavailable",
    targets: "unavailable_pending_runtime_admission",
    ...overrides,
  };
}

function Fixture({ value }: { value: PluginWorkbenchSnapshot }) {
  return <PluginWorkbenchView snapshot={value} onDemand={() => {}} />;
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
  return (
    <Fixture
      value={snapshot("ready", {
        runtimeVersion: '<img src=x onerror="alert(1)">',
      })}
    />
  );
}
