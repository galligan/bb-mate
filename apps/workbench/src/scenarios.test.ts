import { describe, expect, test } from "bun:test";
import { findScenario, scenarios } from "./scenarios";

describe("workbench scenarios", () => {
  test("provides stable unique fixture ids", () => {
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(
      scenarios.length,
    );
  });

  test("falls back to the first scenario", () => {
    expect(findScenario("missing")).toBe(scenarios[0]);
  });
});
