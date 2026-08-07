import { useState } from "react";
import {
  Database,
  ExternalLink,
  FlaskConical,
  Minimize2,
  Radio,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { usePluginInspection } from "@/usePluginInspection";
import type { PluginInspection } from "@bb-mate/inspection";

const surfaceItems = surfaceCatalog.map((surface) => ({
  label: surface.name,
  value: surface.id,
}));

const pluginSdkPublicationIssue = "https://github.com/get-bb/bb/issues/1134";

interface MateOverlayProps {
  selection: CatalogSelection;
  onSurfaceChange: (surfaceId: string) => void;
  onFixtureChange: (fixtureId: string) => void;
}

const actionableStatuses = new Set(["warning", "fail", "unavailable"]);

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
    <div className="mate-plugin-card" aria-live="polite">
      <div className="mate-field-heading">
        <span>Plugin target</span>
        <span className="mate-plugin-kind">
          {target?.appEntry ? "frontend" : target ? "headless" : "inspect"}
        </span>
      </div>
      {error ? <p className="mate-plugin-error">{error}</p> : null}
      {target ? (
        <>
          <div className="mate-plugin-title-row">
            <strong>{target.displayName}</strong>
            <span>v{target.version}</span>
          </div>
          <code className="mate-plugin-path">{target.displayPath}</code>
          <div className="mate-plugin-statuses">
            <span data-outcome={inspection?.outcome}>
              Report {inspection?.outcome}
            </span>
            <span data-available={Boolean(harness?.available)}>
              Harness {harness?.available ? "ready" : "unavailable"}
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
              className="mate-live-link"
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
              className="mate-live-link"
              href={live.url}
              target="_blank"
              rel="noreferrer"
            >
              Open native bb
              <ExternalLink aria-hidden="true" />
            </a>
          ) : (
            <p className="mate-plugin-detail">{live?.detail}</p>
          )}
        </>
      ) : (
        <>
          <p className="mate-plugin-detail">
            {inspection?.message ?? "Inspecting workspace plugins…"}
          </p>
          {inspection && inspection.candidates.length > 0 ? (
            <ul className="mate-plugin-candidates">
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
          <div className="mate-report" aria-label="Compatibility report">
            <div className="mate-report-heading">
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
          <p className="mate-trust-disclosure">
            Full-trust local code. {inspection.trust.detail}
          </p>
        </>
      ) : null}
    </div>
  );
}

export function MateOverlay({
  selection,
  onSurfaceChange,
  onFixtureChange,
}: MateOverlayProps) {
  const [open, setOpen] = useState(true);
  const { inspection, error } = usePluginInspection();
  const harness = inspection?.modes.harness;
  const build =
    inspection?.target?.build.app ?? inspection?.target?.build.server;
  const fixtureItems = selection.surface.fixtures.map((fixture) => ({
    label: fixture.name,
    value: fixture.id,
  }));

  return (
    <div className="dark mate-overlay">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              className="mate-fab"
              size="icon-lg"
              aria-label={
                open ? "Hide BB Mate controls" : "Show BB Mate controls"
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
          className="mate-popover"
        >
          <PopoverHeader className="mate-panel-header">
            <div className="mate-heading-copy">
              <span className="mate-kicker">BB Mate</span>
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

          <div className="mate-divider" />

          <div className="mate-field">
            <div className="mate-field-heading">
              <span>Source</span>
              <span className="mate-source-status">
                <i aria-hidden="true" /> fixture
              </span>
            </div>
            <ToggleGroup
              aria-label="State source"
              className="mate-source-toggle"
              spacing={0}
              value={["fixtures"]}
            >
              <ToggleGroupItem value="fixtures">
                <Database data-icon="inline-start" />
                Fixtures
              </ToggleGroupItem>
              <ToggleGroupItem value="harness" disabled={!harness?.available}>
                <FlaskConical data-icon="inline-start" />
                Harness
              </ToggleGroupItem>
              <ToggleGroupItem value="live" disabled>
                <Radio data-icon="inline-start" />
                Live bb
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="mate-help">
              {harness?.detail ??
                "Inspecting the official SDK harness and native bb runtime…"}
            </p>
          </div>

          <PluginInspectionCard inspection={inspection} error={error} />

          <div className="mate-field">
            <label className="mate-field-heading" htmlFor="mate-surface">
              Surface
            </label>
            <Select
              items={surfaceItems}
              value={selection.surface.id}
              onValueChange={(value) => {
                if (value) onSurfaceChange(value);
              }}
            >
              <SelectTrigger id="mate-surface" className="mate-select-trigger">
                <SelectValue placeholder="Choose a surface" />
              </SelectTrigger>
              <SelectContent
                align="end"
                alignItemWithTrigger={false}
                className="dark mate-select-content"
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

          <div className="mate-field">
            <label className="mate-field-heading" htmlFor="mate-fixture">
              Fixture
            </label>
            <Select
              items={fixtureItems}
              value={selection.fixture.id}
              onValueChange={(value) => {
                if (value) onFixtureChange(value);
              }}
            >
              <SelectTrigger id="mate-fixture" className="mate-select-trigger">
                <SelectValue placeholder="Choose a fixture" />
              </SelectTrigger>
              <SelectContent
                align="end"
                alignItemWithTrigger={false}
                className="dark mate-select-content"
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

          <div className="mate-runtime-line">
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
