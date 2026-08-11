import {
  definePluginApp,
  useRpc,
  type PluginNavPanelProps,
} from "@bb/plugin-sdk/app";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { rpcContract } from "../../server";
import "./workbench-panel.css";
import { PluginWorkbenchBoundary } from "./workbench-boundary";
import { PluginWorkbenchView } from "./workbench-panel";
import {
  parsePluginWorkbenchSnapshot,
  type PluginWorkbenchSnapshot,
} from "./workbench-snapshot";

const listChangedMessage = "The target list changed. Choose a target.";

export function PluginWorkbenchPanel(_props: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<PluginWorkbenchSnapshot | null>(
    null,
  );
  const [statusFailed, setStatusFailed] = useState(false);
  const [admitting, setAdmitting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [admittedProjectId, setAdmittedProjectId] = useState<string | null>(
    null,
  );
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const selectedTargetIdRef = useRef<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);

  const acceptSnapshot = useCallback(
    (value: unknown, admittedProject: string | null) => {
      const next = parsePluginWorkbenchSnapshot(value);
      setSnapshot(next);
      setAdmittedProjectId(admittedProject);
      setSelectedProjectId((current) => {
        if (
          next.projects.state === "ready" &&
          next.projects.items.some(({ id }) => id === current)
        ) {
          return current;
        }
        return "";
      });
      const currentTarget = selectedTargetIdRef.current;
      let nextTarget: string | null = null;
      let nextMessage: string | null = null;
      if (
        admittedProject !== null &&
        (next.targets.state === "ready" || next.targets.state === "partial")
      ) {
        const currentRemains =
          currentTarget !== null &&
          next.targets.items.some(({ id }) => id === currentTarget);
        nextTarget =
          currentTarget !== null
            ? currentRemains
              ? currentTarget
              : null
            : next.targets.items.length === 1
              ? (next.targets.items[0]?.id ?? null)
              : null;
        nextMessage =
          currentTarget !== null && !currentRemains ? listChangedMessage : null;
      }
      selectedTargetIdRef.current = nextTarget;
      setSelectedTargetId(nextTarget);
      setSelectionMessage(nextMessage);
      return next;
    },
    [],
  );

  const requestStatus = useCallback(() => {
    const request = ++generation.current;
    setStatusFailed(false);
    setAdmitting(false);
    void rpc.call("status", {}).then(
      (value) => {
        if (request !== generation.current) return;
        try {
          acceptSnapshot(value, null);
        } catch {
          if (snapshot === null) setStatusFailed(true);
          else setSelectionMessage("Status refresh failed safely. Try again.");
        }
      },
      () => {
        if (request !== generation.current) return;
        if (snapshot === null) setStatusFailed(true);
        else setSelectionMessage("Status refresh failed safely. Try again.");
      },
    );
  }, [acceptSnapshot, rpc, snapshot]);

  useEffect(() => {
    requestStatus();
    return () => {
      generation.current += 1;
    };
    // Status runs once on mount. Subsequent reads are explicit actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const admitProject = useCallback(() => {
    if (snapshot?.projects.state !== "ready") return;
    const selected = snapshot.projects.items.find(
      ({ id }) => id === selectedProjectId,
    );
    if (selected?.admission !== "available") return;
    const request = ++generation.current;
    setAdmitting(true);
    setStatusFailed(false);
    setSelectionMessage(null);
    void rpc.call("admit", { projectId: selected.id }).then(
      (value) => {
        if (request !== generation.current) return;
        try {
          acceptSnapshot(value, selected.id);
        } catch {
          setSelectionMessage("Project admission failed safely. Try again.");
        } finally {
          if (request === generation.current) setAdmitting(false);
        }
      },
      () => {
        if (request !== generation.current) return;
        setAdmitting(false);
        setSelectionMessage("Project admission failed safely. Try again.");
      },
    );
  }, [acceptSnapshot, rpc, selectedProjectId, snapshot]);

  const changeProject = useCallback((projectId: string) => {
    generation.current += 1;
    setAdmitting(false);
    setSelectedProjectId(projectId);
    setAdmittedProjectId(null);
    selectedTargetIdRef.current = null;
    setSelectedTargetId(null);
    setSelectionMessage(null);
  }, []);

  const displayedSnapshot = useMemo(() => {
    if (snapshot === null) {
      return snapshot;
    }
    if (
      (snapshot.targets.state !== "ready" &&
        snapshot.targets.state !== "partial") ||
      (admittedProjectId !== null && admittedProjectId === selectedProjectId)
    ) {
      return snapshot;
    }
    return {
      ...snapshot,
      targets: { state: "project_not_selected", items: [] },
    } satisfies PluginWorkbenchSnapshot;
  }, [admittedProjectId, selectedProjectId, snapshot]);

  if (statusFailed) {
    return <PluginWorkbenchBoundary state="failed" onRetry={requestStatus} />;
  }
  if (displayedSnapshot === null) {
    return <PluginWorkbenchBoundary state="pending" onRetry={requestStatus} />;
  }
  return (
    <PluginWorkbenchView
      snapshot={displayedSnapshot}
      selectedProjectId={selectedProjectId}
      selectedTargetId={selectedTargetId}
      admitting={admitting}
      selectionMessage={selectionMessage}
      onProjectChange={changeProject}
      onTargetChange={(targetId) => {
        selectedTargetIdRef.current = targetId;
        setSelectedTargetId(targetId);
        setSelectionMessage(null);
      }}
      onAdmit={admitProject}
      onRefresh={requestStatus}
    />
  );
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
