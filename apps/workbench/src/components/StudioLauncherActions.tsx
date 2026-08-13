import { useState } from "react";
import { CheckCheck, Clipboard, ExternalLink, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PluginHandoffs } from "@/usePluginInspection";

export type CopyCommand = (command: string) => Promise<void>;

const copyWithBrowser: CopyCommand = (command) =>
  navigator.clipboard.writeText(command);

export async function copyTerminalCommand(
  copyCommand: CopyCommand,
  command: string,
  label: string,
): Promise<string> {
  try {
    await copyCommand(command);
    return `${label} copied. Run it from the inspected workspace terminal.`;
  } catch {
    return `Could not copy ${label.toLowerCase()}. Select the command and copy it manually.`;
  }
}

interface StudioLauncherActionsProps {
  commands: PluginHandoffs;
  liveUrl: string | null;
  liveAvailable: boolean;
  copyCommand?: CopyCommand;
}

function CommandAction({
  label,
  command,
  disclosure,
  icon,
  onCopy,
}: {
  label: string;
  command: string | null;
  disclosure: string;
  icon: React.ReactNode;
  onCopy(command: string, label: string): void;
}) {
  return (
    <div className="studio-command-action">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!command}
        onClick={() => {
          if (command) onCopy(command, label);
        }}
      >
        {icon}
        {label}
      </Button>
      <p>{disclosure}</p>
      {command ? <code>{command}</code> : null}
    </div>
  );
}

export function StudioLauncherActions({
  commands,
  liveUrl,
  liveAvailable,
  copyCommand = copyWithBrowser,
}: StudioLauncherActionsProps) {
  const [announcement, setAnnouncement] = useState("");
  const onCopy = (command: string, label: string) => {
    void copyTerminalCommand(copyCommand, command, label).then(setAnnouncement);
  };

  return (
    <section
      className="studio-actions"
      aria-labelledby="studio-actions-heading"
    >
      <div className="studio-field-heading" id="studio-actions-heading">
        Terminal handoff
      </div>
      <p className="studio-help">{commands.detail}</p>
      <CommandAction
        label="Copy launch command"
        command={commands.launchCommand}
        disclosure="Starts this Fixture workbench through bb-plugin-studio. Read-only plugin discovery; native Vite output stays in your terminal."
        icon={<Play aria-hidden="true" />}
        onCopy={onCopy}
      />
      <CommandAction
        label="Copy build and re-check"
        command={commands.checkCommand}
        disclosure="State-changing: delegates to native `bb plugin build .` and writes build artifacts before refreshing the report."
        icon={<CheckCheck aria-hidden="true" />}
        onCopy={onCopy}
      />
      <CommandAction
        label="Copy live handoff"
        command={liveAvailable ? commands.liveCommand : null}
        disclosure="State-changing while running: delegates to native `bb plugin dev .` for this exact installed path."
        icon={<Clipboard aria-hidden="true" />}
        onCopy={onCopy}
      />
      {liveUrl ? (
        <a
          className="studio-native-link"
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open already-running native bb
          <ExternalLink aria-hidden="true" />
        </a>
      ) : null}
      <p className="studio-action-status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
