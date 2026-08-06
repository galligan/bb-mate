import { useState } from "react";
import { findScenario, scenarios, type ThreadState } from "./scenarios";

const stateLabels: Record<ThreadState, string> = {
  idle: "Idle",
  running: "Running",
  waiting: "Waiting",
};

export function App() {
  const [scenarioId, setScenarioId] = useState(scenarios[0]!.id);
  const scenario = findScenario(scenarioId);

  return (
    <main className="studio">
      <header className="studio-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            8
          </span>
          <div>
            <h1>BB Mate</h1>
            <p>Browser workbench</p>
          </div>
        </div>
        <p className="studio-purpose">Prototype locally. Ship as plugins.</p>
      </header>

      <section className="workspace" aria-label="Workbench">
        <aside className="scenario-panel">
          <div>
            <p className="section-label">Fake state</p>
            <h2>Sidebar playground</h2>
            <p className="scenario-copy">{scenario.description}</p>
          </div>

          <nav className="scenario-list" aria-label="Preview scenarios">
            {scenarios.map((item) => (
              <button
                className={
                  item.id === scenario.id ? "scenario active" : "scenario"
                }
                key={item.id}
                onClick={() => setScenarioId(item.id)}
                type="button"
              >
                <span>{item.name}</span>
                <small>{item.threads.length} rows</small>
              </button>
            ))}
          </nav>
        </aside>

        <div className="preview-stage">
          <div className="preview-window">
            <aside
              className="bb-sidebar"
              aria-label={`${scenario.name} preview`}
            >
              <div className="bb-sidebar-header">
                <div className="bb-brand">
                  <span className="bb-dot" />
                  <span>bb</span>
                </div>
                <button type="button" aria-label="Create thread">
                  +
                </button>
              </div>

              <label className="search">
                <span aria-hidden="true">⌕</span>
                <input aria-label="Search threads" placeholder="Search" />
              </label>

              <div className="thread-section">
                <p>{scenario.name}</p>
                <div className="thread-list">
                  {scenario.threads.map((thread) => (
                    <button
                      className="thread-row"
                      key={thread.id}
                      type="button"
                    >
                      <span className={`state-dot ${thread.state}`} />
                      <span className="thread-copy">
                        <strong>{thread.title}</strong>
                        <small>{thread.detail}</small>
                      </span>
                      <span className="sr-only">
                        {stateLabels[thread.state]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <footer>
                <span>Settings</span>
                <span className="connection">Local</span>
              </footer>
            </aside>

            <section className="canvas">
              <div>
                <p className="section-label">{scenario.name}</p>
                <h2>Make the state obvious.</h2>
                <p>
                  This shell is intentionally disconnected from bb. Iterate on
                  the information hierarchy here, then move proven components
                  behind a plugin adapter.
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
