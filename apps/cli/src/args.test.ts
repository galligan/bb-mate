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
});
