import type { SidebarListModel, ThreadState } from "@/scenarios";
import { BubbleChatIcon } from "@hugeicons/core-free-icons";
import { BbIcon } from "./BbIcon";

const stateLabels: Record<ThreadState, string> = {
  idle: "Idle",
  running: "Running",
  waiting: "Waiting",
};

interface SidebarListViewProps {
  model: SidebarListModel;
}

/**
 * Host-neutral list content. The workbench wraps it in replica bb chrome; a
 * plugin adapter can mount the same view in `experimental_threadList`, where
 * bb supplies the real surrounding sidebar.
 */
export function SidebarListView({ model }: SidebarListViewProps) {
  return (
    <div className="bb-sidebar-scroll">
      <section className="bb-project-section" aria-labelledby="project-name">
        <div className="bb-section-heading">
          <span id="project-name">{model.project}</span>
        </div>
        <div className="bb-thread-list">
          {model.threads.map((thread) => (
            <button className="bb-thread-row" key={thread.id} type="button">
              <span
                className={`bb-state-glyph ${thread.state}`}
                aria-hidden="true"
              />
              <span className="bb-thread-title">{thread.title}</span>
              <span className="sr-only">
                {stateLabels[thread.state]}: {thread.detail}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section
        className="bb-project-section bb-loose-section"
        aria-labelledby="threads-name"
      >
        <div className="bb-section-heading">
          <span id="threads-name">Threads</span>
        </div>
        <div className="bb-empty-row">
          <span className="bb-empty-icon">
            <BbIcon icon={BubbleChatIcon} size={14} />
          </span>
          <span>No threads</span>
        </div>
      </section>
    </div>
  );
}
