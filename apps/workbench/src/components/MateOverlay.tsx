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
import { scenarios } from "@/scenarios";
import { usePluginInspection } from "@/usePluginInspection";

const scenarioItems = scenarios.map((scenario) => ({
  label: scenario.name,
  value: scenario.id,
}));

interface MateOverlayProps {
  scenarioId: string;
  onScenarioChange: (scenarioId: string) => void;
}

export function MateOverlay({
  scenarioId,
  onScenarioChange,
}: MateOverlayProps) {
  const [open, setOpen] = useState(true);
  const { inspection, error } = usePluginInspection();
  const target = inspection?.target;
  const harness = inspection?.modes.harness;
  const live = inspection?.modes.live;
  const build = target?.build.app ?? target?.build.server;

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

          <div className="mate-plugin-card" aria-live="polite">
            <div className="mate-field-heading">
              <span>Plugin target</span>
              <span className="mate-plugin-kind">
                {target?.appEntry
                  ? "frontend"
                  : target
                    ? "headless"
                    : "inspect"}
              </span>
            </div>
            {error ? (
              <p className="mate-plugin-error">{error}</p>
            ) : target ? (
              <>
                <div className="mate-plugin-title-row">
                  <strong>{target.displayName}</strong>
                  <span>v{target.version}</span>
                </div>
                <code className="mate-plugin-path">{target.displayPath}</code>
                <div className="mate-plugin-statuses">
                  <span data-available={Boolean(harness?.available)}>
                    Harness {harness?.available ? "ready" : "unavailable"}
                  </span>
                  <span data-available={Boolean(live?.available)}>
                    Live {live?.status ?? "not linked"}
                  </span>
                </div>
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
              <p className="mate-plugin-detail">
                {inspection?.message ?? "Inspecting workspace plugins…"}
              </p>
            )}
          </div>

          <div className="mate-field">
            <label className="mate-field-heading" htmlFor="mate-scenario">
              Scenario
            </label>
            <Select
              items={scenarioItems}
              value={scenarioId}
              onValueChange={(value) => {
                if (value) onScenarioChange(value);
              }}
            >
              <SelectTrigger id="mate-scenario" className="mate-select-trigger">
                <SelectValue placeholder="Choose a scenario" />
              </SelectTrigger>
              <SelectContent
                align="end"
                alignItemWithTrigger={false}
                className="dark mate-select-content"
              >
                <SelectGroup>
                  {scenarioItems.map((item) => (
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
