import { useState, type ReactNode } from "react";
import { BbShell } from "@/components/BbShell";
import {
  resolveCatalogSelection,
  type CatalogSelection,
  type SurfaceId,
} from "@/surface-catalog";
import type {
  SurfaceStoryTheme,
  SurfaceStoryViewport,
} from "./surface-story-contract";
import "./surface-lab.css";

interface SurfaceLabProps {
  surfaceId: SurfaceId;
  fixtureId: string;
  theme: SurfaceStoryTheme;
  viewport: SurfaceStoryViewport;
}

type FixtureState = Record<string, unknown>;

function stateOf(selection: CatalogSelection): FixtureState {
  return selection.fixture.state as FixtureState;
}

function stringValue(value: unknown, fallback = "Not provided") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function booleanValue(value: unknown) {
  return value === true;
}

function ContractRows({ selection }: { selection: CatalogSelection }) {
  return (
    <dl className="surface-lab-contract">
      <div>
        <dt>Registration</dt>
        <dd>
          <code>{selection.surface.registrationPath}</code>
        </dd>
      </div>
      <div>
        <dt>Inputs</dt>
        <dd>{selection.surface.publicContract.inputs.join(", ")}</dd>
      </div>
      <div>
        <dt>Data</dt>
        <dd>
          {selection.surface.publicContract.data.join(", ") || "No host data"}
        </dd>
      </div>
      <div>
        <dt>Actions</dt>
        <dd>
          {selection.surface.publicContract.actions.join(", ") ||
            "No host actions"}
        </dd>
      </div>
    </dl>
  );
}

function HostActionPreview({ selection }: { selection: CatalogSelection }) {
  const outcomes = [
    ...new Set(
      (selection.fixture.interactions as readonly { outcome: string }[]).map(
        ({ outcome }) => outcome,
      ),
    ),
  ];

  return (
    <section className="surface-lab-host-contract">
      <span>Host-rendered action</span>
      <h2>bb owns this control</h2>
      <p>
        This fixture documents callback inputs and expected outcomes without
        reproducing bb-owned chrome.
      </p>
      <ContractRows selection={selection} />
      <div className="surface-lab-host-evidence">
        <div>
          <strong>Fixture context</strong>
          <pre>{JSON.stringify(stateOf(selection), null, 2)}</pre>
        </div>
        <div>
          <strong>Expected host outcomes</strong>
          {outcomes.length > 0 ? (
            <ul>
              {outcomes.map((outcome) => (
                <li key={outcome}>{outcome}</li>
              ))}
            </ul>
          ) : (
            <p>No callback applies while this fixture is unavailable.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function HomepagePreview({ state }: { state: FixtureState }) {
  const hasProject = typeof state.projectId === "string";
  return (
    <section className="surface-demo-card surface-demo-homepage">
      <span>Release workspace</span>
      <h2>{hasProject ? "Ready for the next alpha" : "Choose a project"}</h2>
      <p>
        {hasProject
          ? "Review compatibility, stories, and handoff readiness in one place."
          : "Project-specific release context appears after selection."}
      </p>
    </section>
  );
}

function SettingsPreview({ state }: { state: FixtureState }) {
  const values = state.values as { enabled?: boolean } | undefined;
  return (
    <section className="surface-demo-card">
      <div className="surface-demo-setting">
        <div>
          <h2>Compatibility reminders</h2>
          <p>Show target-runtime drift before native bb handoff.</p>
        </div>
        <span role="switch" aria-checked={values?.enabled ?? false}>
          <i />
        </span>
      </div>
      {booleanValue(state.isSaving) ? <p role="status">Saving…</p> : null}
    </section>
  );
}

function NavigationPreview({ state }: { state: FixtureState }) {
  return (
    <section className="surface-demo-card">
      <span className="surface-demo-eyebrow">Plugin route</span>
      <h2>{stringValue(state.title, "Workspace")}</h2>
      <p>/mate/{stringValue(state.subPath, "overview")}</p>
      <nav aria-label="Fixture navigation">
        <a href="#overview">Overview</a>
        <a href="#today">Today</a>
        <a href="#ideas">Ideas</a>
      </nav>
    </section>
  );
}

function ThreadPanelPreview({ state }: { state: FixtureState }) {
  return (
    <section className="surface-demo-card surface-demo-panel">
      <span className="surface-demo-eyebrow">Plugin panel content</span>
      <h2>Release summary</h2>
      <p>
        Thread {stringValue(state.threadId)} is ready for local alpha review.
      </p>
      <div className="surface-demo-meter">
        <span style={{ width: state.panel === "open" ? "100%" : "68%" }} />
      </div>
      <small>
        Host launcher state: {stringValue(state.panel)}. The launcher itself is
        not reproduced.
      </small>
    </section>
  );
}

function PendingInteractionPreview({ state }: { state: FixtureState }) {
  const interaction = state.interaction as
    { title?: string; payload?: { channels?: readonly string[] } } | undefined;
  return (
    <section className="surface-demo-card">
      <span className="surface-demo-eyebrow">Input requested</span>
      <h2>{interaction?.title ?? "Choose an option"}</h2>
      {state.status === "submitted" ? (
        <p role="status">Alpha was submitted to the host.</p>
      ) : (
        <div className="surface-demo-options">
          {(interaction?.payload?.channels ?? []).map((channel) => (
            <span key={channel}>{channel}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function ThreadHeaderPreview({ state }: { state: FixtureState }) {
  return (
    <section className="surface-demo-inline">
      <span>Compatibility</span>
      <button type="button">
        {booleanValue(state.isCompactViewport) ? "Check" : "Check plugin"}
      </button>
    </section>
  );
}

function FileOpenerPreview({ state }: { state: FixtureState }) {
  return (
    <section className="surface-demo-file">
      <header>
        <strong>{stringValue(state.path)}</strong>
        <span>{stringValue(state.mode)}</span>
      </header>
      <pre>{`# Architecture\n\nBB Mate orchestrates public plugin seams.\nLive bb remains the visual authority.`}</pre>
    </section>
  );
}

function MessageDirectivePreview({ state }: { state: FixtureState }) {
  return (
    <section className="surface-demo-card surface-demo-artifact">
      <span className="surface-demo-eyebrow">Generated artifact</span>
      <h2>
        {booleanValue(state.workspaceFileAvailable)
          ? "Report ready"
          : "Report unavailable"}
      </h2>
      <code>{stringValue(state.source)}</code>
    </section>
  );
}

function ComposerPreview({ state }: { state: FixtureState }) {
  const view = state.view as
    | {
        layout?: string;
        draft?: { text?: string };
        run?: { isRunning?: boolean };
      }
    | undefined;
  return (
    <section className="surface-demo-composer">
      <div>Release context · deterministic fixture</div>
      <p>{view?.draft?.text || "Ask anything."}</p>
      <footer>
        <button type="button">Attach context</button>
        <span>{view?.run?.isRunning ? "Running" : view?.layout}</span>
      </footer>
    </section>
  );
}

function ContentScriptPreview({ state }: { state: FixtureState }) {
  return (
    <section className="surface-lab-lifecycle">
      <span>Discovery safety</span>
      <h2>No content-script code mounted</h2>
      <ol>
        <li data-active="true">Discover declaration</li>
        <li>Host activates one generation</li>
        <li>Host aborts, then disposes once</li>
      </ol>
      <p>
        Recorded generation {String(state.generation)} · phase{" "}
        {String(state.phase)}
      </p>
    </section>
  );
}

function PluginPreview({ selection }: { selection: CatalogSelection }) {
  const state = stateOf(selection);

  switch (selection.surface.id) {
    case "homepage-section":
      return <HomepagePreview state={state} />;
    case "settings-section":
      return <SettingsPreview state={state} />;
    case "navigation-panel":
      return <NavigationPreview state={state} />;
    case "thread-panel-action":
      return <ThreadPanelPreview state={state} />;
    case "pending-interaction":
      return <PendingInteractionPreview state={state} />;
    case "thread-header-action":
      return <ThreadHeaderPreview state={state} />;
    case "file-opener":
      return <FileOpenerPreview state={state} />;
    case "message-directive":
      return <MessageDirectivePreview state={state} />;
    case "composer-customization":
      return <ComposerPreview state={state} />;
    case "content-script":
      return <ContentScriptPreview state={state} />;
    case "sidebar-footer-action":
    case "message-action":
      return <HostActionPreview selection={selection} />;
    case "thread-list":
      return null;
  }
}

function InteractionControls({
  selection,
  outcome,
  onOutcome,
}: {
  selection: CatalogSelection;
  outcome: string | null;
  onOutcome: (outcome: string) => void;
}) {
  const interactions = selection.fixture.interactions as readonly {
    id: string;
    outcome: string;
  }[];

  return (
    <section className="surface-lab-interactions" aria-label="Fixture outcomes">
      <div>
        <strong>Deterministic interactions</strong>
        <span>No bb callback is invoked</span>
      </div>
      {interactions.length > 0 ? (
        <div className="surface-lab-interaction-buttons">
          {interactions.map((interaction) => (
            <button
              key={interaction.id}
              type="button"
              onClick={() => onOutcome(interaction.outcome)}
            >
              {selection.surface.id === "content-script"
                ? "Inspect"
                : "Simulate"}{" "}
              {interaction.id.replaceAll("-", " ")}
            </button>
          ))}
        </div>
      ) : (
        <p>No interaction applies to this state.</p>
      )}
      <output>
        {outcome ??
          "Choose a fixture interaction to record its expected outcome."}
      </output>
    </section>
  );
}

function StoryFrame({
  selection,
  viewport,
  children,
}: {
  selection: CatalogSelection;
  viewport: SurfaceStoryViewport;
  children: ReactNode;
}) {
  return (
    <article
      className="surface-lab-frame"
      data-viewport={viewport}
      data-surface-id={selection.surface.id}
      data-fixture-id={selection.fixture.id}
    >
      <header className="surface-lab-heading">
        <div>
          <span>{selection.surface.classification.replaceAll("-", " ")}</span>
          <h1>{selection.surface.name}</h1>
          <p>{selection.fixture.description}</p>
        </div>
        <div>
          <code>{selection.surface.fixtureSchema}</code>
          <strong>Fixture ≈ approximation</strong>
        </div>
      </header>
      <main className="surface-lab-canvas">{children}</main>
    </article>
  );
}

export function SurfaceLab({
  surfaceId,
  fixtureId,
  theme,
  viewport,
}: SurfaceLabProps) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const selection = resolveCatalogSelection(surfaceId, fixtureId);

  if (selection.surface.id === "thread-list") {
    return (
      <div
        className={`surface-lab-theme surface-lab-thread-story ${theme}`}
        data-surface-id={selection.surface.id}
        data-fixture-id={selection.fixture.id}
        data-viewport={viewport}
      >
        <BbShell selection={selection} theme={theme} />
        <div className="surface-lab-thread-controls">
          <div className="surface-lab-thread-fidelity">
            <strong>{selection.fixture.name}</strong>
            <span>Fixture ≈ approximation · live bb is visual authority</span>
          </div>
          <InteractionControls
            selection={selection}
            outcome={outcome}
            onOutcome={setOutcome}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`surface-lab-theme ${theme}`}>
      <StoryFrame selection={selection} viewport={viewport}>
        <div className="surface-lab-preview">
          <PluginPreview selection={selection} />
        </div>
        {selection.surface.classification === "mixed" ? (
          <aside className="surface-lab-mixed-contract">
            <strong>bb-owned seam</strong>
            <p>Host chrome is intentionally absent from this fixture.</p>
            <ContractRows selection={selection} />
          </aside>
        ) : null}
        <InteractionControls
          selection={selection}
          outcome={outcome}
          onOutcome={setOutcome}
        />
      </StoryFrame>
    </div>
  );
}
