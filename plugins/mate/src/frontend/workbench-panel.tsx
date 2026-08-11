import type {
  PluginWorkbenchSnapshot,
  PluginWorkbenchUnavailableReason,
} from "./workbench-snapshot";

export interface PluginWorkbenchViewProps {
  snapshot: PluginWorkbenchSnapshot;
  onDemand(): void;
}

const stateCopy: Record<
  PluginWorkbenchSnapshot["runtimeState"],
  { title: string; detail: string }
> = {
  idle: {
    title: "Runtime idle",
    detail: "Start the packaged runtime when you are ready to work.",
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

export function PluginWorkbenchView({
  snapshot,
  onDemand,
}: PluginWorkbenchViewProps) {
  const status = stateCopy[snapshot.runtimeState];
  const demandLabel =
    snapshot.runtimeState === "failed" ? "Retry runtime" : "Start runtime";

  return (
    <div className="pw-shell">
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
          {snapshot.canStart ? (
            <button
              className="pw-primary-action"
              type="button"
              onClick={onDemand}
            >
              {demandLabel}
            </button>
          ) : null}
        </div>
      </section>

      <section className="pw-targets" aria-labelledby="pw-targets-heading">
        <div className="pw-section-heading">
          <div>
            <p className="pw-eyebrow">Source-first</p>
            <h2 id="pw-targets-heading">Development targets</h2>
          </div>
          <span className="pw-stage-badge">Unavailable</span>
        </div>
        <div className="pw-empty-state">
          <span className="pw-empty-mark" aria-hidden="true">
            +
          </span>
          <div>
            <h3>Target discovery is unavailable in this build</h3>
            <p>
              Development target admission is unavailable in this build.
              Installed plugins are not treated as development targets.
            </p>
          </div>
        </div>
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
