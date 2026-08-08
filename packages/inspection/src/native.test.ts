import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CommandResult } from "./types.ts";
import { defaultRunBb, readNativeState } from "./native.ts";

const temporaryRoots: string[] = [];
const originalBbCli = process.env.BB_CLI;
const originalBbCliReexec = process.env.BB_CLI_REEXEC;
const originalSentinel = process.env.BB_MATE_SENTINEL;

afterEach(async () => {
  if (originalBbCli === undefined) delete process.env.BB_CLI;
  else process.env.BB_CLI = originalBbCli;
  if (originalBbCliReexec === undefined) delete process.env.BB_CLI_REEXEC;
  else process.env.BB_CLI_REEXEC = originalBbCliReexec;
  if (originalSentinel === undefined) delete process.env.BB_MATE_SENTINEL;
  else process.env.BB_MATE_SENTINEL = originalSentinel;
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

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
  test("uses the selected BB_CLI executable for default inspection", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bb-mate-bb-cli-"));
    temporaryRoots.push(root);
    const executable = path.join(root, "selected-bb");
    await fs.writeFile(
      executable,
      `#!/bin/sh
case "$1 $2" in
  "--version ") printf '9.9.9\\n' ;;
  "connect status") printf '{"state":"disconnected","paired":false,"url":null,"shares":[]}' ;;
  "connect shares") printf '{"host":{"id":"host_test","name":"test","isServer":true},"shares":[]}' ;;
  "plugin list") printf '{"plugins":[]}' ;;
  "plugin source") printf '{}' ;;
  *) exit 2 ;;
esac
`,
      { mode: 0o755 },
    );
    process.env.BB_CLI = executable;
    process.env.BB_CLI_REEXEC = "1";
    process.env.BB_MATE_SENTINEL = "preserved";

    const native = await readNativeState("/workspace/plugins/notes");

    expect(native.bbVersion).toBe("9.9.9");
    expect(native.connect).toMatchObject({
      state: "disconnected",
      paired: false,
    });
  });

  test("consumes native selectors before invoking the selected bb", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bb-mate-bb-env-"));
    temporaryRoots.push(root);
    const executable = path.join(root, "selected-bb");
    await fs.writeFile(
      executable,
      '#!/bin/sh\nprintf \'%s|%s|%s\' "${BB_CLI-unset}" "${BB_CLI_REEXEC-unset}" "${BB_MATE_SENTINEL-unset}"\n',
      { mode: 0o755 },
    );
    process.env.BB_CLI = executable;
    process.env.BB_CLI_REEXEC = "1";
    process.env.BB_MATE_SENTINEL = "preserved";

    expect(await defaultRunBb(["--version"])).toMatchObject({
      stdout: "unset|unset|preserved",
      exitCode: 0,
    });
  });

  test("force-terminates a selected BB_CLI that ignores the passive deadline", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-mate-bb-timeout-"),
    );
    temporaryRoots.push(root);
    const executable = path.join(root, "selected-bb");
    await fs.writeFile(
      executable,
      "#!/bin/sh\ntrap '' TERM\nwhile :; do :; done\n",
      { mode: 0o755 },
    );
    process.env.BB_CLI = executable;
    const startedAt = performance.now();

    const result = await defaultRunBb(["--version"], { timeoutMs: 20 });

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(result).toMatchObject({
      exitCode: 124,
      stderr: expect.stringContaining("timed out after 20ms"),
    });
  });

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
