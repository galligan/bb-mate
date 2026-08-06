import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp02Icon,
  BubbleChatAddIcon,
  Bug01Icon,
  FolderAddIcon,
  Mic02Icon,
  PlusSignIcon,
  Search01Icon,
  Settings01Icon,
  SidebarLeftIcon,
  SidebarRightIcon,
  SmartPhone01Icon,
  TimeScheduleIcon,
  ToolboxIcon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { Scenario } from "@/scenarios";
import { BbIcon } from "./BbIcon";
import { SidebarListView } from "./SidebarListView";

interface BbShellProps {
  scenario: Scenario;
}

function OpenAiIcon() {
  return (
    <svg
      aria-hidden="true"
      className="bb-provider-icon"
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

function SidebarAction({
  icon,
  label,
  end,
}: {
  icon: Parameters<typeof BbIcon>[0]["icon"];
  label: string;
  end?: React.ReactNode;
}) {
  return (
    <button className="bb-sidebar-row bb-sidebar-action" type="button">
      <BbIcon icon={icon} />
      <span>{label}</span>
      {end ? <span className="bb-row-end">{end}</span> : null}
    </button>
  );
}

export function BbShell({ scenario }: BbShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <main className="bb-app" aria-label="BB Mate workbench">
      {mobileSidebarOpen ? (
        <button
          className="bb-mobile-sidebar-backdrop"
          type="button"
          aria-label="Close sidebar"
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}
      <aside
        id="bb-workbench-sidebar"
        className={`bb-sidebar${mobileSidebarOpen ? " mobile-open" : ""}`}
        aria-label={`${scenario.name} preview`}
      >
        <header className="bb-sidebar-chrome">
          <button
            className="bb-icon-button"
            type="button"
            aria-label="Hide sidebar"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <BbIcon icon={SidebarLeftIcon} />
          </button>
          <div className="bb-history-actions">
            <button
              className="bb-icon-button"
              type="button"
              aria-label="Go back"
            >
              <BbIcon icon={ArrowLeft01Icon} />
            </button>
            <button
              className="bb-icon-button"
              type="button"
              aria-label="Go forward"
            >
              <BbIcon icon={ArrowRight01Icon} />
            </button>
          </div>
        </header>

        <div className="bb-primary-actions">
          <SidebarAction
            icon={BubbleChatAddIcon}
            label="New thread"
            end={
              <span className="bb-search-glyph" aria-label="Search threads">
                <BbIcon icon={Search01Icon} />
              </span>
            }
          />
          <SidebarAction icon={ToolboxIcon} label="Extensions" />
          <SidebarAction icon={TimeScheduleIcon} label="Automations" />
        </div>

        <SidebarListView model={scenario} />

        <footer className="bb-sidebar-footer">
          <button
            className="bb-icon-button"
            type="button"
            aria-label="Settings"
          >
            <BbIcon icon={Settings01Icon} />
          </button>
          <button
            className="bb-icon-button"
            type="button"
            aria-label="Remote access"
          >
            <BbIcon icon={SmartPhone01Icon} />
          </button>
          <button
            className="bb-icon-button"
            type="button"
            aria-label="Report a bug"
          >
            <BbIcon icon={Bug01Icon} />
          </button>
        </footer>
      </aside>

      <section className="bb-main" aria-label="New thread">
        <button
          className="bb-mobile-sidebar-button"
          type="button"
          aria-label="Show sidebar"
          aria-controls="bb-workbench-sidebar"
          aria-expanded={mobileSidebarOpen}
          onClick={() => setMobileSidebarOpen(true)}
        >
          <BbIcon icon={SidebarLeftIcon} />
        </button>
        <button
          className="bb-right-panel-button"
          type="button"
          aria-label="Show right panel"
        >
          <BbIcon icon={SidebarRightIcon} />
        </button>

        <div className="bb-compose-wrap">
          <div className="bb-composer">
            <div className="bb-composer-editor">
              <p className="bb-placeholder">Ask anything.</p>
            </div>
            <div className="bb-composer-toolbar">
              <button
                className="bb-compose-icon"
                type="button"
                aria-label="Prompt actions"
              >
                <BbIcon icon={PlusSignIcon} />
              </button>
              <button className="bb-model-button" type="button">
                <OpenAiIcon />
                <span>5.5 Medium</span>
                <BbIcon icon={ArrowDown01Icon} size={14} />
              </button>
              <span className="bb-compose-spacer" />
              <button
                className="bb-compose-icon"
                type="button"
                aria-label="Start voice input"
              >
                <BbIcon icon={Mic02Icon} />
              </button>
              <button
                className="bb-submit-button"
                type="button"
                aria-label="Submit"
                disabled
              >
                <BbIcon icon={ArrowUp02Icon} />
              </button>
            </div>
          </div>

          <div className="bb-compose-options">
            <button type="button">
              <BbIcon icon={FolderAddIcon} size={14} />
              <span>Work in a project</span>
              <BbIcon icon={ArrowDown01Icon} size={14} />
            </button>
            <button type="button">
              <span>Approve for me</span>
              <BbIcon icon={ArrowDown01Icon} size={14} />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
