import { useState } from "react";
import {
  Database,
  ExternalLink,
  FlaskConical,
  Minimize2,
  Radio,
  SlidersHorizontal,
} from "lucide-react";
import { StudioLauncherActions } from "@/components/StudioLauncherActions";
import { Button } from "@/components/ui/button";
import { previewModeCapabilities } from "@/preview-mode";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CatalogSelection } from "@/surface-catalog";
import { surfaceCatalog } from "@/surface-catalog";
import type { PluginCandidate, PluginHandoffs } from "@/usePluginInspection";
import type {
  PreviewMode,
  PreviewTheme,
  PreviewViewport,
  WorkbenchState,
} from "@/workbench-state";
import { isOpaqueTargetId } from "@/workbench-state";
import type { PluginInspection } from "@bb-plugin-studio/inspection";

const surfaceItems = surfaceCatalog.map((surface) => ({
  label: surface.name,
  value: surface.id,
}));

const pluginSdkPublicationIssue = "https://github.com/get-bb/bb/issues/1134";

interface StudioOverlayProps {
  selection: CatalogSelection;
  state: WorkbenchState;
  inspection: PluginInspection | null;
  inspectionError: string | null;
  selectionError: string | null;
  workspaceLabel: string | null;
  candidates: PluginCandidate[];
  selectedTargetId: string | null;
  handoffs: PluginHandoffs;
  onRefreshInspection: () => void;
  onTargetChange: (targetId: string | null) => void;
  onSurfaceChange: (surfaceId: string) => void;
  onFixtureChange: (fixtureId: string) => void;
  onModeChange: (mode: PreviewMode) => void;
  onThemeChange: (theme: PreviewTheme) => void;
  onViewportChange: (viewport: PreviewViewport) => void;
}

const actionableStatuses = new Set(["warning", "fail", "unavailable"]);
const workspaceSelectionValue = "control:workspace";

export function candidateSelectionValue(targetId: string): string {
  return `candidate:${targetId}`;
}

export function targetIdFromSelection(value: string): string | null {
  if (value === workspaceSelectionValue) return null;
  const targetId = value.startsWith("candidate:")
    ? value.slice("candidate:".length)
    : "";
  return isOpaqueTargetId(targetId) ? targetId : null;
}

export function PluginInspectionCard({
  inspection,
  error,
}: {
  inspection: PluginInspection | null;
  error: string | null;
}) {
  const target = inspection?.target;
  const harness = inspection?.modes.harness;
  const live = inspection?.modes.live;
  const actionableChecks =
    inspection?.checks.filter((check) =>
      actionableStatuses.has(check.status),
    ) ?? [];

  return (
    <div className="studio-plugin-card" aria-live="polite">
      <div className="studio-field-heading">
        <span>Plugin target</span>
        <span className="studio-plugin-kind">
          {target?.appEntry ? "frontend" : target ? "headless" : "inspect"}
        </span>
      </div>
      {error ? <p className="studio-plugin-error">{error}</p> : null}
      {target ? (
        <>
          <div className="studio-plugin-title-row">
            <strong>{target.displayName}</strong>
            <span>v{target.version}</span>
          </div>
          <code className="studio-plugin-path">{target.displayPath}</code>
          <div className="studio-plugin-statuses">
            <span data-outcome={inspection?.outcome}>
              Report {inspection?.outcome}
            </span>
            <span data-available={Boolean(harness?.available)}>
              Harness contract {harness?.available ? "ready" : "unavailable"}
            </span>
            <span>
              Source {inspection?.provenance?.kind ?? "not installed"}
            </span>
            <span data-available={Boolean(live?.available)}>
              Live
              {live?.available ? ` ${live.status ?? "ready"}` : " unavailable"}
            </span>
          </div>
          {target.appEntry && harness?.publication === "missing" ? (
            <a
              className="studio-live-link"
              href={pluginSdkPublicationIssue}
              target="_blank"
              rel="noreferrer"
            >
              Track SDK publication
              <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {live?.url ? (
            <a
              className="studio-live-link"
              href={live.url}
              target="_blank"
              rel="noreferrer"
            >
              Open native bb
              <ExternalLink aria-hidden="true" />
            </a>
          ) : (
            <p className="studio-plugin-detail">{live?.detail}</p>
          )}
        </>
      ) : (
        <>
          <p className="studio-plugin-detail">
            {inspection?.message ?? "Inspecting workspace plugins…"}
          </p>
          {inspection && inspection.candidates.length > 0 ? (
            <ul className="studio-plugin-candidates">
              {inspection.candidates.map((candidate) => (
                <li key={candidate}>
                  <code>{candidate}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {inspection ? (
        <>
          <div className="studio-report" aria-label="Compatibility report">
            <div className="studio-report-heading">
              <span>Compatibility</span>
              <span>{actionableChecks.length} actions</span>
            </div>
            {actionableChecks.length > 0 ? (
              <ul>
                {actionableChecks.map((check) => (
                  <li key={check.id} data-status={check.status}>
                    <strong>{check.summary}</strong>
                    {check.detail ? <span>{check.detail}</span> : null}
                    {check.nextAction ? (
                      <span>Next: {check.nextAction}</span>
                    ) : null}
                    {check.nativeError ? (
                      <code>
                        Native exit {check.nativeError.exitCode}:{" "}
                        {check.nativeError.stderr ||
                          check.nativeError.stdout ||
                          "no output"}
                      </code>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>All compatibility checks passed.</p>
            )}
          </div>
          <p className="studio-trust-disclosure">
            Full-trust local code. {inspection.trust.detail}
          </p>
        </>
      ) : null}
    </div>
  );
}

export function StudioOverlay({
  selection,
  state,
  inspection,
  inspectionError,
  selectionError,
  workspaceLabel,
  candidates,
  selectedTargetId,
  handoffs,
  onRefreshInspection,
  onTargetChange,
  onSurfaceChange,
  onFixtureChange,
  onModeChange,
  onThemeChange,
  onViewportChange,
}: StudioOverlayProps) {
  const [open, setOpen] = useState(true);
  const harness = inspection?.modes.harness;
  const live = inspection?.modes.live;
  const modeCapabilities = previewModeCapabilities(inspection);
  const build =
    inspection?.target?.build.app ?? inspection?.target?.build.server;
  const pluginItems = [
    {
      label: `Discover in ${workspaceLabel ?? "workspace"}`,
      value: workspaceSelectionValue,
    },
    ...candidates.map(({ id, label }) => ({
      label,
      value: candidateSelectionValue(id),
    })),
  ];
  const fixtureItems = selection.surface.fixtures.map((fixture) => ({
    label: fixture.name,
    value: fixture.id,
  }));

  return (
    <div className="dark studio-overlay">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              className="studio-fab"
              size="icon-lg"
              aria-label={
                open
                  ? "Hide bb Plugin Studio controls"
                  : "Show bb Plugin Studio controls"
              }
            />
          }
        >
          <SlidersHorizontal data-icon="inline-start" />
        </PopoverTrigger>

        <PopoverContent
          align="end"
          side="top"
          sideOffset={10}
          className="studio-popover"
        >
          <PopoverHeader className="studio-panel-header">
            <div className="studio-heading-copy">
              <span className="studio-kicker">bb Plugin Studio</span>
              <PopoverTitle>Workbench controls</PopoverTitle>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Minimize controls"
              onClick={() => setOpen(false)}
            >
              <Minimize2 />
            </Button>
          </PopoverHeader>
          <PopoverDescription className="sr-only">
            Choose the workbench state source and deterministic preview
            scenario.
          </PopoverDescription>

          <div className="studio-divider" />

          <div className="studio-field">
            <label className="studio-field-heading" htmlFor="studio-target">
              Development target
            </label>
            <Select
              items={pluginItems}
              value={
                state.targetId || selectedTargetId
                  ? candidateSelectionValue(
                      state.targetId ?? selectedTargetId ?? "",
                    )
                  : workspaceSelectionValue
              }
              onValueChange={(value) => {
                if (value) onTargetChange(targetIdFromSelection(value));
              }}
            >
              <SelectTrigger
                id="studio-target"
                className="studio-select-trigger"
              >
                <SelectValue placeholder="Choose a discovered plugin" />
              </SelectTrigger>
              <SelectContent
                align="end"
                alignItemWithTrigger={false}
                className="dark studio-select-content"
              >
                <SelectGroup>
                  {pluginItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {candidates.length > 1 && !selectedTargetId ? (
              <p className="studio-help" role="status">
                Multiple plugins were discovered. Choose one explicitly before
                using native handoffs.
              </p>
            ) : null}
            {selectionError ? (
              <p className="studio-help" role="status">
                {selectionError}
              </p>
            ) : null}
          </div>

          <div className="studio-field">
            <div className="studio-field-heading">
              <span>Source</span>
              <span className="studio-source-status">
                <i aria-hidden="true" /> {state.mode}
              </span>
            </div>
            <ToggleGroup
              aria-label="State source"
              className="studio-source-toggle"
              spacing={0}
              value={[state.mode]}
              onValueChange={(values) => {
                const mode = values[0] as PreviewMode | undefined;
                if (mode) onModeChange(mode);
              }}
            >
              <ToggleGroupItem value="fixture">
                <Database data-icon="inline-start" />
                Fixtures
              </ToggleGroupItem>
              <ToggleGroupItem
                value="harness"
                disabled={!modeCapabilities.harness.available}
              >
                <FlaskConical data-icon="inline-start" />
                Harness
              </ToggleGroupItem>
              <ToggleGroupItem
                value="live"
                disabled={!modeCapabilities.live.available}
              >
                <Radio data-icon="inline-start" />
                Live bb
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="studio-help">
              Fixture: deterministic approximation. Harness:{" "}
              {modeCapabilities.harness.detail} Live:{" "}
              {modeCapabilities.live.detail}
            </p>
          </div>

          <PluginInspectionCard
            inspection={inspection}
            error={inspectionError}
          />

          <div className="studio-field">
            <label className="studio-field-heading" htmlFor="studio-surface">
              Surface
            </label>
            <Select
              items={surfaceItems}
              value={selection.surface.id}
              onValueChange={(value) => {
                if (value) onSurfaceChange(value);
              }}
            >
              <SelectTrigger
                id="studio-surface"
                className="studio-select-trigger"
              >
                <SelectValue placeholder="Choose a surface" />
              </SelectTrigger>
              <SelectContent
                align="end"
                alignItemWithTrigger={false}
                className="dark studio-select-content"
              >
                <SelectGroup>
                  {surfaceItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="studio-field">
            <label className="studio-field-heading" htmlFor="studio-fixture">
              Scenario
            </label>
            <Select
              items={fixtureItems}
              value={selection.fixture.id}
              onValueChange={(value) => {
                if (value) onFixtureChange(value);
              }}
            >
              <SelectTrigger
                id="studio-fixture"
                className="studio-select-trigger"
              >
                <SelectValue placeholder="Choose a scenario" />
              </SelectTrigger>
              <SelectContent
                align="end"
                alignItemWithTrigger={false}
                className="dark studio-select-content"
              >
                <SelectGroup>
                  {fixtureItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="studio-control-row">
            <div className="studio-field">
              <span className="studio-field-heading">Theme</span>
              <ToggleGroup
                aria-label="Preview theme"
                className="studio-compact-toggle"
                spacing={0}
                value={[state.theme]}
                onValueChange={(values) => {
                  const theme = values[0] as PreviewTheme | undefined;
                  if (theme) onThemeChange(theme);
                }}
              >
                <ToggleGroupItem value="light">Light</ToggleGroupItem>
                <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="studio-field">
              <span className="studio-field-heading">Viewport</span>
              <ToggleGroup
                aria-label="Preview viewport"
                className="studio-compact-toggle"
                spacing={0}
                value={[state.viewport]}
                onValueChange={(values) => {
                  const viewport = values[0] as PreviewViewport | undefined;
                  if (viewport) onViewportChange(viewport);
                }}
              >
                <ToggleGroupItem value="desktop">Desktop</ToggleGroupItem>
                <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          <StudioLauncherActions
            commands={handoffs}
            liveAvailable={Boolean(live?.available)}
            liveUrl={live?.url ?? null}
          />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefreshInspection}
          >
            Refresh passive report
          </Button>

          <div className="studio-runtime-line">
            <span>bb {inspection?.native.bbVersion ?? "unavailable"}</span>
            <code>
              {build?.sdkVersion ? `sdk ${build.sdkVersion}` : "fixture/v1"}
            </code>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
