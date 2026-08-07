import { describe, expect, test } from "bun:test";
import type { CommandResult } from "./types.ts";
import { readNativeState } from "./native.ts";

function command(
  stdout: string,
  options: Partial<CommandResult> = {},
): CommandResult {
  return { stdout, stderr: "", exitCode: 0, ...options };
}

function runner(
  status: CommandResult,
  shares: CommandResult = command(
    JSON.stringify({
      host: { id: "host_123", name: "studio", isServer: true },
      shares: [],
    }),
  ),
) {
  return async (args: readonly string[]) => {
    if (args[0] === "--version") return command("0.35.1\n");
    if (args[0] === "connect") return args[1] === "shares" ? shares : status;
    return command(JSON.stringify({ plugins: [] }));
  };
}

describe("passive native Connect status", () => {
  test("keeps the base URL distinct from typed port shares", async () => {
    const native = await readNativeState(
      "/workspace/plugins/notes",
      runner(
        command(
          JSON.stringify({
            state: "connected",
            paired: true,
            url: "https://mate.getbb.app",
            shares: [
              {
                hostId: "host_123",
                hostName: "studio",
                port: 5173,
                url: "https://mate--5173.getbb.app",
              },
            ],
          }),
        ),
      ),
    );

    expect(native.connectUrl).toBe("https://mate.getbb.app");
    expect(native.connect).toMatchObject({
      state: "connected",
      paired: true,
      baseUrl: "https://mate.getbb.app",
      shares: [
        {
          hostId: "host_123",
          hostName: "studio",
          port: 5173,
          url: "https://mate--5173.getbb.app",
          available: true,
          unavailableReason: null,
        },
      ],
    });
  });

  test("accepts the canonical unpaired status with a null base URL", async () => {
    const native = await readNativeState(
      "/workspace/plugins/notes",
      runner(
        command(
          JSON.stringify({
            state: "disconnected",
            paired: false,
            url: null,
            shares: [],
          }),
        ),
      ),
    );

    expect(native.connectUrl).toBeNull();
    expect(native.connect).toMatchObject({
      state: "disconnected",
      paired: false,
      baseUrl: null,
      shares: [],
    });
  });

  test("retains mixed unavailable and usable canonical shares", async () => {
    const native = await readNativeState(
      "/workspace/plugins/notes",
      runner(
        command(
          JSON.stringify({
            state: "connected",
            paired: true,
            url: "https://mate.getbb.app",
            shares: [
              {
                hostId: "host_remote",
                hostName: "remote",
                port: 4100,
                url: "",
                unavailableReason: "Host is offline.",
              },
              {
                hostId: "host_123",
                hostName: "studio",
                port: 5173,
                url: "https://mate--5173.getbb.app",
              },
            ],
          }),
        ),
      ),
    );

    expect(native.connect?.shares).toEqual([
      {
        hostId: "host_remote",
        hostName: "remote",
        port: 4100,
        url: "",
        available: false,
        unavailableReason: "Host is offline.",
      },
      {
        hostId: "host_123",
        hostName: "studio",
        port: 5173,
        url: "https://mate--5173.getbb.app",
        available: true,
        unavailableReason: null,
      },
    ]);
  });

  test("preserves native error evidence for malformed share data", async () => {
    const raw = JSON.stringify({
      state: "connected",
      paired: true,
      url: "https://mate.getbb.app",
      shares: [{ hostName: "studio", port: 5173, url: "" }],
    });
    const native = await readNativeState(
      "/workspace/plugins/notes",
      runner(command(raw)),
    );

    expect(native.connect).toBeNull();
    expect(
      native.checks.find((check) => check.id === "native.connect"),
    ).toMatchObject({
      status: "warning",
      summary: "Native bb Connect JSON is malformed.",
      nativeError: { command: "bb connect status --json", stdout: raw },
    });
  });
});
