import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
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
  ProjectOption,
  ProjectScan,
  TargetSummary,
} from "./workbench-snapshot";

export interface WorkbenchProjectThread {
  id: string;
  title: string;
  updatedAt: number;
}

export type WorkbenchProjectThreads =
  | { state: "loading" | "unavailable"; items: [] }
  | { state: "ready"; items: readonly WorkbenchProjectThread[] };

export interface PluginWorkbenchViewProps {
  snapshot: PluginWorkbenchSnapshot;
  refreshing: boolean;
  catalogMessage: string | null;
  onOpenTarget(projectId: string, targetId: string): void;
  onRefresh(): void;
}

const stateCopy: Record<
  PluginWorkbenchSnapshot["runtimeState"],
  { title: string; detail: string }
> = {
  idle: {
    title: "Runtime idle",
    detail: "Reload Workbench data to start plugin discovery.",
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
    detail: "Reload Workbench data to retry.",
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
  const label = busy ? "Reloading Workbench data" : "Reload Workbench data";
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
            aria-label={label}
          >
            <Icon
              name="RotateCcw"
              className={cn("size-3.5", busy && "animate-spin")}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
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
    <div className="flex min-h-7 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2" aria-live="polite">
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
          {snapshot.reason ? (
            <span> · {reasonCopy[snapshot.reason]}</span>
          ) : (
            <span className="sr-only">{status.detail}</span>
          )}
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

function WorkbenchMessage({ message }: { message: string | null }) {
  return message ? (
    <p
      className="text-xs leading-snug text-subtle-foreground"
      role="status"
      aria-live="polite"
    >
      {message}
    </p>
  ) : null;
}

function ProjectStateRow({
  children,
  warning = false,
}: {
  children: string;
  warning?: boolean;
}) {
  return (
    <p
      className={cn(
        "border-t border-border px-4 py-3 pl-11 text-xs leading-snug text-subtle-foreground",
        warning && "text-foreground",
      )}
      role={warning ? "status" : undefined}
    >
      {children}
    </p>
  );
}

function PluginRows({
  items,
  projectId,
  projectLabel,
  onOpenTarget,
}: {
  items: readonly TargetSummary[];
  projectId: string;
  projectLabel: string;
  onOpenTarget(projectId: string, targetId: string): void;
}) {
  return (
    <ul className="list-none divide-y divide-border border-t border-border bg-muted/10 p-0">
      {items.map((target) => (
        <li key={target.id}>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-3 py-2.5 pl-11 pr-4 text-left transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => onOpenTarget(projectId, target.id)}
            aria-label={`Open ${target.label} in ${projectLabel}`}
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
        </li>
      ))}
    </ul>
  );
}

function unavailableCopy(scan: Extract<ProjectScan, { state: "unavailable" }>) {
  if (scan.reason === "source_changed") {
    return "The project changed during scanning. Reload Workbench data to try again.";
  }
  if (scan.reason === "capacity_reached") {
    return "The shared scan limit was reached before this project could be inspected.";
  }
  return "Plugins unavailable. Reload Workbench data to try again.";
}

function ProjectPlugins({
  project,
  onOpenTarget,
}: {
  project: ProjectOption;
  onOpenTarget(projectId: string, targetId: string): void;
}) {
  const { scan } = project;
  if (scan.state === "not_scanned") {
    return <ProjectStateRow>Finding development plugins…</ProjectStateRow>;
  }
  if (scan.state === "unavailable") {
    return <ProjectStateRow warning>{unavailableCopy(scan)}</ProjectStateRow>;
  }
  if (scan.state === "partial" && scan.items.length === 0) {
    return (
      <ProjectStateRow warning>
        Scan incomplete. No plugins were found within the safety limits.
      </ProjectStateRow>
    );
  }
  if (scan.state === "ready" && scan.items.length === 0) {
    return <ProjectStateRow>No development plugins found.</ProjectStateRow>;
  }
  return (
    <>
      {scan.state === "partial" ? (
        <ProjectStateRow warning>
          Scan incomplete. Available plugins are shown.
        </ProjectStateRow>
      ) : null}
      <PluginRows
        items={scan.items}
        projectId={project.id}
        projectLabel={project.label}
        onOpenTarget={onOpenTarget}
      />
    </>
  );
}

function ProjectRow({
  project,
  onOpenTarget,
}: {
  project: ProjectOption;
  onOpenTarget(projectId: string, targetId: string): void;
}) {
  const count = project.scan.items.length;
  const countCopy =
    project.scan.state === "not_scanned" || project.scan.state === "unavailable"
      ? null
      : `${count} ${count === 1 ? "plugin" : "plugins"}`;
  const headingId = `pw-project-${project.id}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon
          name="FolderGit"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="break-words text-sm text-foreground">
            {project.label}
          </h3>
          {countCopy ? (
            <p className="mt-0.5 text-xs text-subtle-foreground">{countCopy}</p>
          ) : null}
        </div>
        {project.activity.active ? (
          <Badge variant="outline" className="text-2xs font-normal">
            Active
          </Badge>
        ) : null}
        {project.scan.state === "partial" ? (
          <Badge variant="outline" className="text-2xs font-normal">
            Incomplete scan
          </Badge>
        ) : null}
      </div>
      <ProjectPlugins project={project} onOpenTarget={onOpenTarget} />
    </section>
  );
}

export function PluginWorkbenchView({
  snapshot,
  refreshing,
  catalogMessage,
  onOpenTarget,
  onRefresh,
}: PluginWorkbenchViewProps) {
  const projects = [...snapshot.projects.items].sort((left, right) => {
    if (left.activity.active !== right.activity.active) {
      return left.activity.active ? -1 : 1;
    }
    const leftUpdated = left.activity.lastThreadUpdatedAt ?? -1;
    const rightUpdated = right.activity.lastThreadUpdatedAt ?? -1;
    return rightUpdated - leftUpdated;
  });
  return (
    <div
      className="h-full overflow-y-auto bg-background text-foreground"
      aria-busy={refreshing}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-5 px-4 pb-6 pt-4 md:px-5 md:pb-8 md:pt-5">
        <RuntimeSummary
          snapshot={snapshot}
          busy={refreshing}
          onRefresh={onRefresh}
        />

        <WorkbenchMessage message={catalogMessage} />
        <NativeSettingsSection
          headingId="pw-projects-heading"
          title="Projects"
          description="Development plugins in bb projects on this machine."
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
            <>
              {snapshot.projects.truncated ? (
                <p
                  className="px-4 py-3 text-xs leading-snug text-subtle-foreground"
                  role="status"
                >
                  <span className="font-medium text-foreground">
                    Project inventory incomplete.
                  </span>{" "}
                  Some bb projects may not be shown.
                </p>
              ) : null}
              {projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onOpenTarget={onOpenTarget}
                />
              ))}
            </>
          )}
        </NativeSettingsSection>
      </div>
    </div>
  );
}

export interface PluginWorkbenchTargetDetailProps {
  snapshot: PluginWorkbenchSnapshot;
  projectLabel: string;
  target: TargetSummary;
  threads: WorkbenchProjectThreads;
  refreshing: boolean;
  catalogMessage: string | null;
  onBack(): void;
  onOpenThread(threadId: string): void;
  onNewThread(): void;
  onRefresh(): void;
}

export function PluginWorkbenchTargetDetail({
  snapshot,
  projectLabel,
  target,
  threads,
  refreshing,
  catalogMessage,
  onBack,
  onOpenThread,
  onNewThread,
  onRefresh,
}: PluginWorkbenchTargetDetailProps) {
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-5 px-4 pb-6 pt-4 md:px-5 md:pb-8 md:pt-5">
        <RuntimeSummary
          snapshot={snapshot}
          busy={refreshing}
          onRefresh={onRefresh}
        />
        <WorkbenchMessage message={catalogMessage} />
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
          <div className="flex items-center gap-3">
            <Icon
              name="Browser"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0">
              <p className="text-sm text-foreground">Preview unavailable</p>
              <p className="mt-0.5 text-xs leading-snug text-subtle-foreground">
                Browser handoff is not available in this build.
              </p>
            </div>
          </div>
        </NativeSettingsSection>

        <NativeSettingsSection
          headingId="pw-threads-heading"
          title="Project tasks"
          description={`Unarchived tasks in ${projectLabel}.`}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNewThread}
            >
              New task
            </Button>
          }
          cardClassName="divide-y divide-border p-0"
        >
          <div aria-live="polite" aria-busy={threads.state === "loading"}>
            {threads.state === "loading" ? (
              <p className="px-4 py-3 text-xs text-subtle-foreground">
                Loading project tasks…
              </p>
            ) : threads.state === "unavailable" ? (
              <p className="px-4 py-3 text-xs text-subtle-foreground">
                Project tasks unavailable.
              </p>
            ) : threads.items.length === 0 ? (
              <div className="p-4">
                <EmptyInset
                  title="No active project tasks"
                  detail="Start a task in this project to discuss or change this plugin."
                />
              </div>
            ) : (
              <ul className="list-none divide-y divide-border p-0">
                {threads.items.map((thread) => (
                  <li key={thread.id}>
                    <button
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </NativeSettingsSection>
      </div>
    </div>
  );
}

export function PluginWorkbenchMissingTarget({
  snapshot,
  refreshing,
  catalogMessage,
  reason,
  onBack,
  onRefresh,
}: {
  snapshot: PluginWorkbenchSnapshot;
  refreshing: boolean;
  catalogMessage: string | null;
  reason:
    | "removed"
    | "catalog_unavailable"
    | "scan_incomplete"
    | "not_scanned"
    | "source_changed"
    | "scan_failed"
    | "capacity_reached";
  onBack(): void;
  onRefresh(): void;
}) {
  const removed = reason === "removed";
  const detail =
    reason === "catalog_unavailable"
      ? "Project data is unavailable, so Workbench could not verify this plugin."
      : reason === "scan_incomplete"
        ? "The project scan was incomplete, so Workbench could not verify this plugin."
        : reason === "not_scanned"
          ? "The project has not been scanned, so Workbench could not verify this plugin."
          : reason === "source_changed"
            ? "The project changed during scanning, so Workbench could not verify this plugin."
            : reason === "capacity_reached"
              ? "The shared scan limit was reached before Workbench could verify this plugin."
              : reason === "scan_failed"
                ? "The project scan failed, so Workbench could not verify this plugin."
                : "The project or plugin is not present in the latest complete Workbench scan.";
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-5 px-4 pb-6 pt-4 md:px-5 md:pb-8 md:pt-5">
        <RuntimeSummary
          snapshot={snapshot}
          busy={refreshing}
          onRefresh={onRefresh}
        />
        <WorkbenchMessage message={catalogMessage} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 self-start h-7 px-2 text-xs text-muted-foreground"
          onClick={onBack}
        >
          <Icon name="ChevronLeft" className="size-3.5" />
          Back to projects
        </Button>
        <NativeSettingsSection
          headingId="pw-missing-target-heading"
          title={removed ? "Plugin no longer available" : "Plugin unavailable"}
          description={detail}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={onRefresh}
          >
            Reload Workbench data
          </Button>
        </NativeSettingsSection>
      </div>
    </div>
  );
}
