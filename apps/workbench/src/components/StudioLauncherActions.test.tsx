import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  copyTerminalCommand,
  StudioLauncherActions,
} from "./StudioLauncherActions";

describe("Studio launcher actions", () => {
  test("labels native mutations as copied terminal handoffs", () => {
    const html = renderToStaticMarkup(
      <StudioLauncherActions
        commands={{
          launchCommand: "bun run bb-plugin-studio dev plugins/notes",
          checkCommand: "bun run bb-plugin-studio check plugins/notes",
          liveCommand: "bun run bb-plugin-studio live plugins/notes",
          detail: "Run from the bb Plugin Studio repository root.",
        }}
        liveAvailable
        liveUrl="https://bb.example.test"
      />,
    );

    expect(html).toContain("Copy launch command");
    expect(html).toContain("Copy build and re-check");
    expect(html).toContain("State-changing");
    expect(html).toContain("Run from the bb Plugin Studio repository root");
    expect(html).toContain("bb plugin build .");
    expect(html).toContain("bb plugin dev .");
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("iframe");
  });

  test("does not offer a false live command when Live is unavailable", () => {
    const html = renderToStaticMarkup(
      <StudioLauncherActions
        commands={{
          launchCommand: "bun run bb-plugin-studio dev plugins/notes",
          checkCommand: "bun run bb-plugin-studio check plugins/notes",
          liveCommand: "bun run bb-plugin-studio live plugins/notes",
          detail: "Run from the bb Plugin Studio repository root.",
        }}
        liveAvailable={false}
        liveUrl={null}
      />,
    );

    expect(html).toContain("Copy live handoff");
    expect(html).toContain("disabled");
  });

  test("copies the exact trusted command and announces success", async () => {
    const copied: string[] = [];
    const announcement = await copyTerminalCommand(
      async (command) => {
        copied.push(command);
      },
      "bun run bb-plugin-studio check 'plugins/my plugin'",
      "Build and re-check command",
    );

    expect(copied).toEqual([
      "bun run bb-plugin-studio check 'plugins/my plugin'",
    ]);
    expect(announcement).toBe(
      "Build and re-check command copied. Run it from the inspected workspace terminal.",
    );
  });

  test("announces clipboard failure without executing a fallback", async () => {
    const announcement = await copyTerminalCommand(
      async () => {
        throw new Error("denied");
      },
      "bun run bb-plugin-studio live plugins/notes",
      "Live handoff command",
    );

    expect(announcement).toContain("Could not copy live handoff command");
    expect(announcement).toContain("copy it manually");
  });
});
