import { describe, expect, test } from "bun:test";
import { compareStableVersions, evaluateBbRelease } from "./check-latest-bb";

describe("stable bb release comparison", () => {
  test.each([
    ["0.36.0", "0.36.0", 0],
    ["0.37.0", "0.36.9", 1],
    ["1.0.0", "0.99.99", 1],
    ["0.36.0", "0.36.1", -1],
  ])("compares %s with %s", (left, right, expected) => {
    expect(compareStableVersions(left, right)).toBe(expected);
  });

  test.each(["0.36", "v0.36.0", "0.36.0-alpha.1", "01.2.3"])(
    "rejects non-stable version %s",
    (version) => {
      expect(() => compareStableVersions(version, "0.36.0")).toThrow(
        "stable semantic version",
      );
    },
  );
});

describe("bb release drift report", () => {
  test("is quiet-state compatible when the target is current", () => {
    expect(evaluateBbRelease("0.36.0", "0.36.0")).toMatchObject({
      targetVersion: "0.36.0",
      latestVersion: "0.36.0",
      status: "current",
    });
  });

  test("distinguishes an update from a suspicious target-ahead state", () => {
    expect(evaluateBbRelease("0.36.0", "0.37.0").status).toBe(
      "update-available",
    );
    expect(evaluateBbRelease("0.37.0", "0.36.0").status).toBe("target-ahead");
  });
});
