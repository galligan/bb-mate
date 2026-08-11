import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "./args.ts";

describe("bb-mate arguments", () => {
  test("treats a bare plugin path as the dev command", () => {
    expect(parseCliArgs(["plugins/linear"])).toEqual({
      command: "dev",
      targetPath: "plugins/linear",
      host: "127.0.0.1",
      port: 5173,
      json: false,
      help: false,
    });
  });

  test("parses explicit inspect output and strict dev address options", () => {
    expect(parseCliArgs(["inspect", "../plugin", "--json"]).command).toBe(
      "inspect",
    );
    expect(
      parseCliArgs(["dev", "--host", "::1", "--port", "6000"]),
    ).toMatchObject({ host: "::1", port: 6000 });
  });

  test("rejects command-specific options and invalid ports", () => {
    expect(() => parseCliArgs(["inspect", "--host", "127.0.0.1"])).toThrow(
      "--host and --port are only available with dev.",
    );
    expect(() => parseCliArgs(["dev", "--port", "70000"])).toThrow(
      "--port must be an integer between 1 and 65535.",
    );
    expect(() => parseCliArgs(["check", "--json"])).toThrow(
      "--json is only available with inspect.",
    );
  });

  test("parses the supervised serve contract without a target path", () => {
    expect(
      parseCliArgs([
        "serve",
        "--port",
        "0",
        "--json",
        "--parent-pid",
        "4321",
        "--supervisor-fd",
        "3",
      ]),
    ).toEqual({
      command: "serve",
      host: "127.0.0.1",
      port: 0,
      json: true,
      help: false,
      parentPid: 4321,
      supervisorFd: 3,
    });
  });

  test("fails closed when the supervised serve contract is incomplete", () => {
    const base = [
      "serve",
      "--port",
      "0",
      "--json",
      "--parent-pid",
      "4321",
      "--supervisor-fd",
      "3",
    ];

    expect(() => parseCliArgs(base.slice(0, -2))).toThrow(
      "Supervised serve requires --supervisor-fd >= 3.",
    );
    expect(() => parseCliArgs([...base, "plugins/notes"])).toThrow(
      "serve does not accept a plugin path.",
    );
    expect(() =>
      parseCliArgs(base.map((value) => (value === "4321" ? "0" : value))),
    ).toThrow("Supervised serve requires a positive --parent-pid.");
    expect(() =>
      parseCliArgs(base.map((value) => (value === "3" ? "2" : value))),
    ).toThrow("Supervised serve requires --supervisor-fd >= 3.");
    expect(() =>
      parseCliArgs(base.map((value) => (value === "0" ? "1" : value))),
    ).toThrow("--port must be 0 for supervised serve.");
    expect(() => parseCliArgs([...base, "--host", "127.0.0.1"])).toThrow(
      "Supervised serve does not accept --host.",
    );
    expect(() =>
      parseCliArgs(base.filter((value, index) => index !== 1 && index !== 2)),
    ).toThrow("Supervised serve requires explicit --port 0.");
  });

  test("allows supervised help without opening the supervisor channel", () => {
    expect(parseCliArgs(["serve", "--help"])).toEqual({
      command: "serve",
      host: "127.0.0.1",
      port: 0,
      json: false,
      help: true,
    });
  });
});
