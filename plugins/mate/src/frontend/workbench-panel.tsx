import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Icon } from "../components/ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { cn } from "../lib/utils";
import { NativeSettingsSection } from "./native-settings";
import type {
  PluginWorkbenchSnapshot,
  PluginWorkbenchUnavailableReason,
  TargetCatalog,
} from "./workbench-snapshot";

type DevelopmentTarget = Extract<
  TargetCatalog,
  { state: "ready" | "partial" }
>["items"][number];

export interface WorkbenchProjectThread {
  id: string;
  title: string;
  updatedAt: number;
}

export interface PluginWorkbenchViewProps {
  snapshot: PluginWorkbenchSnapshot;
  openedProjectId: string | null;
  admittingProjectId: string | null;
  selectionMessage: string | null;
  onOpenProject(projectId: string): void;
  onOpenTarget(projectId: string, targetId: string): void;
  onRefresh(): void;
}

const stateCopy: Record<
  PluginWorkbenchSnapshot["runtimeState"],
  { title: string; detail: string }
> = {
  idle: {
    title: "Runtime idle",
    detail: "It starts when you open a project.",
  },
  starting: {
    title: "Starting runtime",
    detail: "Verifying the packaged runtime.",
  },
  ready: {
    title: "Runtime ready",
    detail: "The local plugin runtime is available.",
  },
  stopping: {
    title: "Stopping runtime",
    detail: "Closing the local plugin runtime.",
  },
  unavailable: {
    title: "Runtime unavailable",
    detail: "This installation cannot start the packaged runtime.",
  },
  failed: {
    title: "Runtime stopped",
    detail: "Open a project to retry.",
  },
};

const reasonCopy: Record<PluginWorkbenchUnavailableReason, string> = {
  unsupported_platform: "This packaged runtime does not support this platform.",
  artifact_missing: "The packaged runtime artifact is missing.",
  artifact_invalid: "The packaged runtime did not pass integrity checks.",
  runtime_incompatible: "The packaged runtime version is incompatible.",
  startup_failed: "The runtime stopped during startup.",
};

const statusDotClass: Record<PluginWorkbenchSnapshot["runtimeState"], string> =
  {
    idle: "bg-muted-foreground/45",
    starting: "pw-status-dot--busy bg-warning",
    ready: "bg-success",
    stopping: "pw-status-dot--busy bg-warning",
    unavailable: "bg-destructive",
    failed: "bg-destructive",
  };

function RefreshButton({
  busy,
  onRefresh,
}: {
  busy: boolean;
  onRefresh(): void;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            disabled={busy}
            onClick={onRefresh}
            aria-label={
              busy ? "Reloading Workbench data" : "Reload Workbench data"
            }
          >
            <Icon
              name="RotateCcw"
              className={cn("size-3.5", busy && "animate-spin")}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Reload Workbench data</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function RuntimeSummary({
  snapshot,
  busy,
  onRefresh,
}: {
  snapshot: PluginWorkbenchSnapshot;
  busy: boolean;
  onRefresh(): void;
}) {
  const status = stateCopy[snapshot.runtimeState];
  const identity =
    snapshot.runtimeVersion && snapshot.apiVersion
      ? `${snapshot.runtimeVersion} · API ${snapshot.apiVersion}`
      : null;
  return (
    <div
      className="flex min-h-7 items-center justify-between gap-3"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            statusDotClass[snapshot.runtimeState],
          )}
        />
        <p className="min-w-0 text-xs text-subtle-foreground">
          <span className="font-medium text-foreground">{status.title}</span>
          {identity ? <span> · {identity}</span> : null}
          <span className="sr-only">
            {snapshot.reason ? reasonCopy[snapshot.reason] : status.detail}
          </span>
        </p>
      </div>
      <RefreshButton busy={busy} onRefresh={onRefresh} />
    </div>
  );
}

function EmptyInset({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-6 text-center">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-lg text-xs leading-snug text-subtle-foreground">
        {detail}
      </p>
    </div>
  );
}

function ProjectTargets({
  catalog,
  projectId,
  projectLabel,
  selectionMessage,
  onOpenTarget,
}: {
  catalog: TargetCatalog;
  projectId: string;
  projectLabel: string;
  selectionMessage: string | null;
  onOpenTarget(projectId: string, targetId: string): void;
}) {
  if (catalog.state === "project_not_selected") return null;
  if (catalog.state === "unavailable") {
    return (
      <EmptyInset
        title="Plugins unavailable"
        detail="Reload this project to retry plugin discovery."
      />
    );
  }
  if (catalog.state === "partial" && catalog.items.length === 0) {
    return (
      <EmptyInset
        title="No plugins could be opened"
        detail="Reload this project to retry the bounded source scan."
      />
    );
  }
  if (catalog.items.length === 0) {
    return (
      <EmptyInset
        title="No development plugins found"
        detail="Installed plugins are not included in this source-project view."
      />
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-foreground">
          Plugins in {projectLabel}
        </p>
        {catalog.state === "partial" ? (
          <Badge variant="outline" className="text-2xs font-normal">
            Incomplete scan
          </Badge>
        ) : null}
      </div>
      {catalog.state === "partial" ? (
        <p
          className="rounded-md border border-warning/35 bg-warning/5 px-3 py-2 text-xs leading-snug text-foreground"
          role="status"
        >
          The project scan was not exhaustive. Plugins found within the safety
          limits are shown below.
        </p>
      ) : null}
      {selectionMessage ? (
        <p
          className="text-xs leading-snug text-subtle-foreground"
          role="status"
          aria-live="polite"
        >
          {selectionMessage}
        </p>
      ) : null}
      <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {catalog.items.map((target) => (
          <button
            key={target.id}
            type="button"
            className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => onOpenTarget(projectId, target.id)}
            aria-label={`Open ${target.label}`}
          >
            <Icon
              name="Puzzle"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm text-foreground">
                {target.label}
              </span>
              <span className="mt-0.5 block break-words text-xs text-subtle-foreground">
                {target.pluginId} · revision {target.revision}
              </span>
            </span>
            <Icon
              name="ChevronRight"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function PluginWorkbenchView({
  snapshot,
  openedProjectId,
  admittingProjectId,
  selectionMessage,
  onOpenProject,
  onOpenTarget,
  onRefresh,
}: PluginWorkbenchViewProps) {
  const projects =
    snapshot.projects.state === "ready" ? snapshot.projects.items : [];
  return (
    <div
      className="h-full overflow-y-auto bg-background text-foreground"
      aria-busy={admittingProjectId !== null}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-5 px-4 pb-6 pt-4 md:px-5 md:pb-8 md:pt-5">
        <RuntimeSummary
          snapshot={snapshot}
          busy={admittingProjectId !== null}
          onRefresh={onRefresh}
        />

        {selectionMessage && openedProjectId === null ? (
          <p
            className="text-xs leading-snug text-subtle-foreground"
            role="status"
            aria-live="polite"
          >
            {selectionMessage}
          </p>
        ) : null}

        <NativeSettingsSection
          headingId="pw-projects-heading"
          title="Projects"
          description="Projects with local sources on this machine. Open one to find its development plugins."
          cardClassName="divide-y divide-border p-0"
        >
          {snapshot.projects.state === "unavailable" ? (
            <div className="p-4">
              <EmptyInset
                title="Project list unavailable"
                detail="Reload Workbench data to try again."
              />
            </div>
          ) : projects.length === 0 ? (
            <div className="p-4">
              <EmptyInset
                title="No local projects found"
                detail="Add a project from bb's sidebar, then reload Workbench data."
              />
            </div>
          ) : (
            projects.map((project) => {
              const opened = project.id === openedProjectId;
              const opening = project.id === admittingProjectId;
              const available = project.admission === "available";
              return (
                <div key={project.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Icon
                      name="FolderGit"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm text-foreground">
                        {project.label}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-subtle-foreground">
                        {available
                          ? opened
                            ? "Development plugins are listed below."
                            : "Local source available on this machine."
                          : "No eligible local source on this machine."}
                      </p>
                    </div>
                    {available ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={admittingProjectId !== null}
                        onClick={() => onOpenProject(project.id)}
                      >
                        {opening ? "Opening…" : opened ? "Refresh" : "Open"}
                      </Button>
                    ) : null}
                  </div>
                  {opened ? (
                    <div className="border-t border-border bg-muted/10 px-4 py-3.5">
                      <ProjectTargets
                        catalog={snapshot.targets}
                        projectId={project.id}
                        projectLabel={project.label}
                        selectionMessage={selectionMessage}
                        onOpenTarget={onOpenTarget}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </NativeSettingsSection>
      </div>
    </div>
  );
}

export interface PluginWorkbenchTargetDetailProps {
  snapshot: PluginWorkbenchSnapshot;
  busy: boolean;
  message: string | null;
  projectLabel: string;
  target: DevelopmentTarget;
  threads: readonly WorkbenchProjectThread[];
  threadsState: "loading" | "ready" | "unavailable";
  onBack(): void;
  onOpenThread(threadId: string): void;
  onNewThread(): void;
  onRefresh(): void;
}

export function PluginWorkbenchTargetDetail({
  snapshot,
  busy,
  message,
  projectLabel,
  target,
  threads,
  threadsState,
  onBack,
  onOpenThread,
  onNewThread,
  onRefresh,
}: PluginWorkbenchTargetDetailProps) {
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-5 px-4 pb-6 pt-4 md:px-5 md:pb-8 md:pt-5">
        <RuntimeSummary snapshot={snapshot} busy={busy} onRefresh={onRefresh} />
        {message ? (
          <p
            className="text-xs leading-snug text-subtle-foreground"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 mb-2 h-7 px-2 text-xs text-muted-foreground"
            onClick={onBack}
          >
            <Icon name="ChevronLeft" className="size-3.5" />
            Back to projects
          </Button>
          <div className="flex items-start gap-3">
            <Icon
              name="Puzzle"
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0">
              <h2 className="break-words text-base font-semibold text-foreground">
                {target.label}
              </h2>
              <p className="mt-0.5 break-words text-xs text-subtle-foreground">
                {projectLabel} · {target.pluginId} · revision {target.revision}
              </p>
            </div>
          </div>
        </div>

        <NativeSettingsSection headingId="pw-preview-heading" title="Preview">
          <EmptyInset
            title="Preview unavailable"
            detail="Browser preview will appear here when Workbench browser handoff is available."
          />
        </NativeSettingsSection>

        <NativeSettingsSection
          headingId="pw-threads-heading"
          title="Project threads"
          description={`Unarchived threads in ${projectLabel}.`}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNewThread}
            >
              New thread
            </Button>
          }
          cardClassName="divide-y divide-border p-0"
        >
          {threadsState === "loading" ? (
            <div className="p-4">
              <EmptyInset
                title="Loading project threads"
                detail="Reading active threads from bb."
              />
            </div>
          ) : threadsState === "unavailable" ? (
            <div className="p-4">
              <EmptyInset
                title="Project threads unavailable"
                detail="bb could not provide the project thread list right now."
              />
            </div>
          ) : threads.length === 0 ? (
            <div className="p-4">
              <EmptyInset
                title="No active project threads"
                detail="Start a thread in this project to discuss or change this plugin."
              />
            </div>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => onOpenThread(thread.id)}
              >
                <Icon
                  name="MessageSquare"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {thread.title}
                </span>
                <Icon
                  name="ChevronRight"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              </button>
            ))
          )}
        </NativeSettingsSection>
      </div>
    </div>
  );
}
