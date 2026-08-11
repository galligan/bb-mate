import type {
  PluginWorkbenchSnapshot,
  PluginWorkbenchUnavailableReason,
  TargetCatalog,
} from "./workbench-snapshot";

export interface PluginWorkbenchViewProps {
  snapshot: PluginWorkbenchSnapshot;
  selectedProjectId: string;
  selectedTargetId: string | null;
  admitting: boolean;
  selectionMessage: string | null;
  onProjectChange(projectId: string): void;
  onTargetChange(targetId: string): void;
  onAdmit(): void;
  onRefresh(): void;
}

const stateCopy: Record<
  PluginWorkbenchSnapshot["runtimeState"],
  { title: string; detail: string }
> = {
  idle: {
    title: "Runtime idle",
    detail:
      "Choose a project to start the runtime and admit its development plugins.",
  },
  starting: {
    title: "Starting runtime",
    detail: "Verifying the packaged runtime and its capabilities.",
  },
  ready: {
    title: "Runtime ready",
    detail: "The supervised runtime passed its compatibility handshake.",
  },
  stopping: {
    title: "Stopping runtime",
    detail: "Closing the owned runtime and its loopback listener.",
  },
  unavailable: {
    title: "Runtime unavailable",
    detail: "This installation cannot start the packaged runtime.",
  },
  failed: {
    title: "Runtime stopped",
    detail: "The last startup attempt did not complete.",
  },
};

const reasonCopy: Record<PluginWorkbenchUnavailableReason, string> = {
  unsupported_platform: "This packaged runtime does not support this platform.",
  artifact_missing: "The packaged runtime artifact is missing.",
  artifact_invalid: "The packaged runtime did not pass integrity checks.",
  runtime_incompatible: "The packaged runtime version is incompatible.",
  startup_failed: "The runtime stopped during startup. You can retry safely.",
};

const targetUnavailableCopy: Record<
  Extract<TargetCatalog, { state: "unavailable" }>["reason"],
  string
> = {
  runtime_not_ready: "Admit an eligible project to start the runtime.",
  runtime_incompatible:
    "The runtime cannot provide a compatible target catalog.",
  catalog_unavailable: "The target catalog could not be read safely.",
};

function TargetCatalogView({
  catalog,
  selectedTargetId,
  onTargetChange,
}: {
  catalog: TargetCatalog;
  selectedTargetId: string | null;
  onTargetChange(targetId: string): void;
}) {
  if (catalog.state === "project_not_selected") {
    return (
      <div className="pw-empty-state">
        <span className="pw-empty-mark" aria-hidden="true">
          +
        </span>
        <div>
          <h3>Choose a development project</h3>
          <p>Admit a project to inspect only its source development plugins.</p>
        </div>
      </div>
    );
  }
  if (catalog.state === "unavailable") {
    return (
      <div className="pw-empty-state">
        <span className="pw-empty-mark" aria-hidden="true">
          !
        </span>
        <div>
          <h3>Development targets unavailable</h3>
          <p>{targetUnavailableCopy[catalog.reason]}</p>
        </div>
      </div>
    );
  }
  if (catalog.items.length === 0) {
    return (
      <div className="pw-empty-state">
        <span className="pw-empty-mark" aria-hidden="true">
          0
        </span>
        <div>
          <h3>No development plugins found in this project</h3>
          <p>Installed plugins are not treated as development targets.</p>
        </div>
      </div>
    );
  }
  return (
    <>
      {catalog.state === "partial" ? (
        <p className="pw-inline-notice" role="status">
          Some development plugins could not be admitted. The available targets
          are shown below.
        </p>
      ) : null}
      <fieldset className="pw-target-list">
        <legend>Choose a development target</legend>
        {catalog.items.map((target) => (
          <label className="pw-target-option" key={target.id}>
            <input
              type="radio"
              name="plugin-workbench-target"
              value={target.id}
              checked={selectedTargetId === target.id}
              onChange={() => onTargetChange(target.id)}
            />
            <span>
              <strong>{target.label}</strong>
              <small>
                {target.pluginId} · revision {target.revision}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

export function PluginWorkbenchView({
  snapshot,
  selectedProjectId,
  selectedTargetId,
  admitting,
  selectionMessage,
  onProjectChange,
  onTargetChange,
  onAdmit,
  onRefresh,
}: PluginWorkbenchViewProps) {
  const status = stateCopy[snapshot.runtimeState];
  const selectedProject =
    snapshot.projects.state === "ready"
      ? snapshot.projects.items.find(({ id }) => id === selectedProjectId)
      : undefined;
  const canAdmit = selectedProject?.admission === "available" && !admitting;
  const hasCatalog =
    snapshot.targets.state === "ready" || snapshot.targets.state === "partial";
  const hasEligibleProject =
    snapshot.projects.state === "ready" &&
    snapshot.projects.items.some(({ admission }) => admission === "available");

  return (
    <div className="pw-shell" aria-busy={admitting}>
      <section
        className="pw-runtime"
        data-runtime-state={snapshot.runtimeState}
        aria-labelledby="pw-runtime-heading"
      >
        <div className="pw-status-rail" aria-hidden="true">
          <span />
        </div>
        <div className="pw-runtime-copy" aria-live="polite">
          <p className="pw-eyebrow">Supervised runtime</p>
          <h2 id="pw-runtime-heading">{status.title}</h2>
          <p>{snapshot.reason ? reasonCopy[snapshot.reason] : status.detail}</p>
          {snapshot.runtimeVersion || snapshot.apiVersion ? (
            <dl className="pw-version-row">
              <div>
                <dt>Runtime</dt>
                <dd>{snapshot.runtimeVersion ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>API</dt>
                <dd>{snapshot.apiVersion ?? "Unavailable"}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      </section>

      <section className="pw-projects" aria-labelledby="pw-project-heading">
        <div className="pw-section-heading">
          <div>
            <p className="pw-eyebrow">Development source</p>
            <h2 id="pw-project-heading">Project</h2>
          </div>
          <button type="button" onClick={onRefresh} disabled={admitting}>
            Refresh status
          </button>
        </div>
        {snapshot.projects.state === "unavailable" ? (
          <div className="pw-empty-state">
            <span className="pw-empty-mark" aria-hidden="true">
              !
            </span>
            <div>
              <h3>Project list unavailable</h3>
              <p>BB Mate could not read the project list safely.</p>
            </div>
          </div>
        ) : snapshot.projects.items.length === 0 ? (
          <div className="pw-empty-state">
            <span className="pw-empty-mark" aria-hidden="true">
              0
            </span>
            <div>
              <h3>No bb projects available</h3>
              <p>
                Create a project in bb before admitting development plugins.
              </p>
            </div>
          </div>
        ) : (
          <div className="pw-project-controls">
            <label>
              <span>Development project</span>
              <select
                aria-label="Development project"
                value={selectedProjectId}
                onChange={(event) => onProjectChange(event.currentTarget.value)}
                disabled={admitting}
              >
                <option value="">Choose a project</option>
                {snapshot.projects.items.map((project) => (
                  <option
                    key={project.id}
                    value={project.id}
                    disabled={project.admission === "no_source"}
                  >
                    {project.label}
                    {project.admission === "no_source"
                      ? " — No eligible local source"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            {selectedProject?.admission === "no_source" ? (
              <p className="pw-inline-notice">
                This project has no eligible local development source on this
                machine.
              </p>
            ) : null}
            {!hasEligibleProject ? (
              <p className="pw-inline-notice">
                No project has an eligible local development source on this
                machine.
              </p>
            ) : null}
            {selectedProject?.admission === "available" ? (
              <button
                className="pw-primary-action"
                type="button"
                onClick={onAdmit}
                disabled={!canAdmit}
              >
                {admitting
                  ? "Admitting…"
                  : hasCatalog
                    ? "Refresh project"
                    : "Admit project"}
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section className="pw-targets" aria-labelledby="pw-targets-heading">
        <div className="pw-section-heading">
          <div>
            <p className="pw-eyebrow">Source-first</p>
            <h2 id="pw-targets-heading">Development targets</h2>
          </div>
          <span className="pw-stage-badge">
            {snapshot.targets.state === "ready"
              ? "Ready"
              : snapshot.targets.state === "partial"
                ? "Partial"
                : "Unavailable"}
          </span>
        </div>
        <p className="pw-selection-message" role="status" aria-live="polite">
          {selectionMessage ?? ""}
        </p>
        <TargetCatalogView
          catalog={snapshot.targets}
          selectedTargetId={selectedTargetId}
          onTargetChange={onTargetChange}
        />
      </section>

      <section className="pw-browser" aria-labelledby="pw-browser-heading">
        <div>
          <p className="pw-eyebrow">Browser handoff</p>
          <h2 id="pw-browser-heading">Workbench preview</h2>
          <p id="pw-browser-detail">
            Browser launch is unavailable in this build.
          </p>
        </div>
        <button type="button" disabled aria-describedby="pw-browser-detail">
          Open Workbench
        </button>
      </section>
    </div>
  );
}
