import {
  definePluginApp,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreads,
  useBbNavigate,
  useRpc,
  type PluginNavPanelProps,
} from "@bb/plugin-sdk/app";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { rpcContract } from "../../server";
import "./workbench-panel.css";
import { PluginWorkbenchBoundary } from "./workbench-boundary";
import {
  PluginWorkbenchTargetDetail,
  PluginWorkbenchView,
  type WorkbenchProjectThread,
} from "./workbench-panel";
import {
  parsePluginWorkbenchSnapshot,
  type PluginWorkbenchSnapshot,
} from "./workbench-snapshot";

const listChangedMessage = "The plugin list changed.";
const projectOpenFailedMessage = "Project open failed safely. Try again.";
const targetRoute = /^projects\/([^/]+)\/targets\/([^/]+)$/u;

function parseTargetRoute(subPath: string) {
  const match = targetRoute.exec(subPath);
  if (!match) return null;
  try {
    return {
      projectId: decodeURIComponent(match[1] ?? ""),
      targetId: decodeURIComponent(match[2] ?? ""),
    };
  } catch {
    return null;
  }
}

export function PluginWorkbenchPanel({ subPath }: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const sidebar = experimental_useSidebarThreads();
  const threadActions = experimental_useSidebarThreadActions();
  const generation = useRef(0);
  const recoveredSubPath = useRef<string | null>(null);
  const attemptedRouteSubPath = useRef<string | null>(null);
  const failedAdmissionProjectId = useRef<string | null>(null);
  const previousTargetIds = useRef(new Map<string, readonly string[]>());
  const [snapshot, setSnapshot] = useState<PluginWorkbenchSnapshot | null>(
    null,
  );
  const [statusFailed, setStatusFailed] = useState(false);
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const [admittingProjectId, setAdmittingProjectId] = useState<string | null>(
    null,
  );
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);

  const acceptSnapshot = useCallback(
    (value: unknown, openedProject: string | null) => {
      const next = parsePluginWorkbenchSnapshot(value);
      failedAdmissionProjectId.current = null;
      const hasUsableCatalog =
        openedProject !== null &&
        (next.targets.state === "ready" || next.targets.state === "partial");
      const nextTargetIds = hasUsableCatalog
        ? next.targets.items.map(({ id }) => id)
        : [];
      const previous =
        openedProject === null
          ? undefined
          : previousTargetIds.current.get(openedProject);
      setSelectionMessage(
        hasUsableCatalog &&
          previous !== undefined &&
          (previous.length !== nextTargetIds.length ||
            previous.some((id, index) => id !== nextTargetIds[index]))
          ? listChangedMessage
          : null,
      );
      if (openedProject !== null && hasUsableCatalog) {
        previousTargetIds.current.set(openedProject, nextTargetIds);
      }
      setSnapshot(next);
      setOpenedProjectId(openedProject);
      return next;
    },
    [],
  );

  const requestStatus = useCallback(() => {
    const request = ++generation.current;
    setStatusFailed(false);
    setAdmittingProjectId(null);
    void rpc.call("status", {}).then(
      (value) => {
        if (request !== generation.current) return;
        try {
          const retryRoute = failedAdmissionProjectId.current !== null;
          acceptSnapshot(value, null);
          if (retryRoute) attemptedRouteSubPath.current = null;
        } catch {
          if (snapshot === null) setStatusFailed(true);
          else
            setSelectionMessage("Workbench reload failed safely. Try again.");
        }
      },
      () => {
        if (request !== generation.current) return;
        if (snapshot === null) setStatusFailed(true);
        else setSelectionMessage("Workbench reload failed safely. Try again.");
      },
    );
  }, [acceptSnapshot, rpc, snapshot]);

  const openProject = useCallback(
    (projectId: string) => {
      if (snapshot?.projects.state !== "ready") return;
      const project = snapshot.projects.items.find(
        ({ id }) => id === projectId,
      );
      if (project?.admission !== "available") return;
      const request = ++generation.current;
      setAdmittingProjectId(projectId);
      setStatusFailed(false);
      setSelectionMessage(null);
      void rpc.call("admit", { projectId }).then(
        (value) => {
          if (request !== generation.current) return;
          try {
            acceptSnapshot(value, projectId);
          } catch {
            failedAdmissionProjectId.current = projectId;
            setSelectionMessage(projectOpenFailedMessage);
          } finally {
            if (request === generation.current) setAdmittingProjectId(null);
          }
        },
        () => {
          if (request !== generation.current) return;
          failedAdmissionProjectId.current = projectId;
          setAdmittingProjectId(null);
          setSelectionMessage(projectOpenFailedMessage);
        },
      );
    },
    [acceptSnapshot, rpc, snapshot],
  );

  const reload = useCallback(() => {
    const openedProjectIsAvailable =
      openedProjectId !== null &&
      snapshot?.projects.state === "ready" &&
      failedAdmissionProjectId.current !== openedProjectId &&
      snapshot.projects.items.some(
        ({ id, admission }) =>
          id === openedProjectId && admission === "available",
      );
    if (openedProjectIsAvailable) openProject(openedProjectId);
    else requestStatus();
  }, [openProject, openedProjectId, requestStatus, snapshot]);

  useEffect(() => {
    requestStatus();
    return () => {
      generation.current += 1;
    };
    // Status runs once on mount. Subsequent reads are explicit actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const route = useMemo(() => parseTargetRoute(subPath), [subPath]);

  useEffect(() => {
    if (route === null) {
      attemptedRouteSubPath.current = null;
      return;
    }
    if (
      snapshot?.projects.state === "ready" &&
      openedProjectId !== route.projectId &&
      admittingProjectId === null &&
      attemptedRouteSubPath.current !== subPath
    ) {
      attemptedRouteSubPath.current = subPath;
      openProject(route.projectId);
    }
  }, [
    admittingProjectId,
    openProject,
    openedProjectId,
    route,
    snapshot,
    subPath,
  ]);

  const target =
    route !== null &&
    openedProjectId === route.projectId &&
    snapshot !== null &&
    (snapshot.targets.state === "ready" || snapshot.targets.state === "partial")
      ? snapshot.targets.items.find(({ id }) => id === route.targetId)
      : undefined;
  const project =
    route !== null && snapshot?.projects.state === "ready"
      ? snapshot.projects.items.find(({ id }) => id === route.projectId)
      : undefined;
  useEffect(() => {
    const malformedRoute = subPath !== "" && route === null;
    const invalidProject =
      route !== null &&
      snapshot?.projects.state === "ready" &&
      project?.admission !== "available";
    const missingTerminalTarget =
      route !== null &&
      openedProjectId === route.projectId &&
      snapshot !== null &&
      snapshot.targets.state === "ready" &&
      target === undefined;
    const routeOpenFailed =
      route !== null &&
      admittingProjectId === null &&
      openedProjectId !== route.projectId &&
      failedAdmissionProjectId.current === route.projectId &&
      selectionMessage === projectOpenFailedMessage;
    if (
      !malformedRoute &&
      !invalidProject &&
      !missingTerminalTarget &&
      !routeOpenFailed
    ) {
      recoveredSubPath.current = null;
      return;
    }
    if (recoveredSubPath.current === subPath) return;
    recoveredSubPath.current = subPath;
    navigate.toPluginPanel("workbench", { replace: true });
  }, [
    admittingProjectId,
    navigate,
    openedProjectId,
    project,
    route,
    selectionMessage,
    snapshot,
    subPath,
    target,
  ]);
  const threads = useMemo<readonly WorkbenchProjectThread[]>(() => {
    if (route === null || sidebar.status !== "ready") return [];
    return sidebar.threads
      .filter(
        (thread) =>
          thread.projectId === route.projectId && thread.isArchived === false,
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 8)
      .map((thread) => ({
        id: thread.id,
        title: thread.title ?? thread.titleFallback ?? "Untitled thread",
        updatedAt: thread.updatedAt,
      }));
  }, [route, sidebar]);

  if (statusFailed) {
    return <PluginWorkbenchBoundary state="failed" onRetry={requestStatus} />;
  }
  if (snapshot === null) {
    return <PluginWorkbenchBoundary state="pending" onRetry={requestStatus} />;
  }
  if (route !== null && target && project) {
    return (
      <PluginWorkbenchTargetDetail
        snapshot={snapshot}
        busy={admittingProjectId !== null}
        message={selectionMessage}
        projectLabel={project.label}
        target={target}
        threads={threads}
        threadsState={
          sidebar.status === "error" ? "unavailable" : sidebar.status
        }
        onBack={() => navigate.toPluginPanel("workbench")}
        onOpenThread={(threadId) => threadActions.open(threadId)}
        onNewThread={() =>
          threadActions.openNewThread({
            projectId: project.id,
            focusPrompt: true,
          })
        }
        onRefresh={reload}
      />
    );
  }
  return (
    <PluginWorkbenchView
      snapshot={snapshot}
      openedProjectId={openedProjectId}
      admittingProjectId={admittingProjectId}
      selectionMessage={selectionMessage}
      onOpenProject={(projectId) => {
        if (route !== null && route.projectId !== projectId) {
          attemptedRouteSubPath.current = subPath;
          navigate.toPluginPanel("workbench", { replace: true });
        }
        openProject(projectId);
      }}
      onOpenTarget={(projectId, targetId) =>
        navigate.toPluginPanel("workbench", {
          subPath: `projects/${encodeURIComponent(projectId)}/targets/${encodeURIComponent(targetId)}`,
        })
      }
      onRefresh={reload}
    />
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "plugin-workbench",
    title: "Plugin Workbench",
    icon: "Toolbox",
    path: "workbench",
    component: PluginWorkbenchPanel,
  });
});
