import {
  definePluginApp,
  useRpc,
  type PluginNavPanelProps,
} from "@bb/plugin-sdk/app";
import { useCallback, useEffect, useRef, useState } from "react";

import type { rpcContract } from "../../server";
import "./workbench-panel.css";
import { PluginWorkbenchBoundary } from "./workbench-boundary";
import { PluginWorkbenchView } from "./workbench-panel";
import {
  parsePluginWorkbenchSnapshot,
  type PluginWorkbenchSnapshot,
} from "./workbench-snapshot";

const startingSnapshot: PluginWorkbenchSnapshot = {
  schemaVersion: 1,
  runtimeState: "starting",
  reason: null,
  runtimeVersion: null,
  apiVersion: null,
  canStart: false,
  browserLaunch: "unavailable",
  targets: "unavailable_pending_runtime_admission",
};

export function PluginWorkbenchPanel(_props: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<PluginWorkbenchSnapshot | null>(
    null,
  );
  const [statusFailed, setStatusFailed] = useState(false);

  const requestStatus = useCallback(() => {
    const request = ++generation.current;
    setSnapshot(null);
    setStatusFailed(false);
    void rpc.call("status", {}).then(
      (value) => {
        if (request !== generation.current) return;
        try {
          setSnapshot(parsePluginWorkbenchSnapshot(value));
        } catch {
          setStatusFailed(true);
        }
      },
      () => {
        if (request === generation.current) setStatusFailed(true);
      },
    );
  }, [rpc]);

  useEffect(() => {
    requestStatus();
    return () => {
      generation.current += 1;
    };
  }, [requestStatus]);

  const demandRuntime = useCallback(() => {
    const request = ++generation.current;
    setSnapshot(startingSnapshot);
    setStatusFailed(false);
    void rpc.call("ensure", {}).then(
      (value) => {
        if (request !== generation.current) return;
        try {
          setSnapshot(parsePluginWorkbenchSnapshot(value));
        } catch {
          setStatusFailed(true);
        }
      },
      () => {
        if (request === generation.current) setStatusFailed(true);
      },
    );
  }, [rpc]);

  if (statusFailed) {
    return <PluginWorkbenchBoundary state="failed" onRetry={requestStatus} />;
  }
  if (snapshot === null) {
    return <PluginWorkbenchBoundary state="pending" onRetry={requestStatus} />;
  }
  return <PluginWorkbenchView snapshot={snapshot} onDemand={demandRuntime} />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "plugin-workbench",
    title: "Plugin Workbench",
    icon: "Wrench",
    path: "workbench",
    component: PluginWorkbenchPanel,
  });
});
