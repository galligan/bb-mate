import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freshStandaloneBuildCommand } from "./fresh-standalone-build.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

describe("fresh standalone build worker", () => {
  test("uses the exact Bun executable and bounded output argument", () => {
    const outputRoot = path.join(repositoryRoot, "artifacts", "fixture");
    expect(freshStandaloneBuildCommand(outputRoot)).toEqual([
      process.execPath,
      path.join(repositoryRoot, "scripts", "build-standalone.ts"),
      outputRoot,
    ]);
    expect(() => freshStandaloneBuildCommand("relative/output")).toThrow(
      "bounded absolute path",
    );
    expect(() => freshStandaloneBuildCommand(`/${"a".repeat(4097)}`)).toThrow(
      "bounded absolute path",
    );
  });
});
