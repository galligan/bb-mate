import { describe, expect, test } from "bun:test";
import { parseStandaloneSupervisionArgs } from "./run-standalone-supervision.ts";

describe("Node-hosted standalone supervision entry", () => {
  test("accepts only four bounded absolute arguments", () => {
    expect(
      parseStandaloneSupervisionArgs([
        "/tmp/bb-plugin-studio-runtime",
        "/tmp/cwd",
        "0.1.0-alpha.3",
        "/tmp/root",
      ]),
    ).toEqual({
      executable: "/tmp/bb-plugin-studio-runtime",
      cwd: "/tmp/cwd",
      runtimeVersion: "0.1.0-alpha.3",
      temporaryRoot: "/tmp/root",
    });
    expect(() => parseStandaloneSupervisionArgs([])).toThrow("exactly four");
    expect(() =>
      parseStandaloneSupervisionArgs([
        "relative",
        "/tmp/cwd",
        "0.1.0",
        "/tmp/root",
      ]),
    ).toThrow("bounded and absolute");
  });
});
