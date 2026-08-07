import { describe, expect, test } from "bun:test";
import { inspectionOutcome, provenanceKind } from "./index.ts";

describe("inspection report helpers", () => {
  test("maps native source schemes to stable provenance kinds", () => {
    expect(provenanceKind("path:/tmp/plugin")).toBe("path");
    expect(provenanceKind("npm:bb-plugin-demo@1.0.0")).toBe("npm");
    expect(provenanceKind("git:https://example.test/repo.git")).toBe("git");
    expect(provenanceKind("github:owner/repo")).toBe("git");
    expect(provenanceKind("builtin:connect")).toBe("bundled");
    expect(provenanceKind("future:value")).toBe("unknown");
    expect(provenanceKind(null)).toBe("unknown");
  });

  test("makes failures blocking and warnings or unavailable checks attention", () => {
    expect(inspectionOutcome([])).toBe("ready");
    expect(
      inspectionOutcome([
        { id: "warning", status: "warning", summary: "warning" },
      ]),
    ).toBe("attention");
    expect(
      inspectionOutcome([
        { id: "missing", status: "unavailable", summary: "missing" },
      ]),
    ).toBe("attention");
    expect(
      inspectionOutcome([{ id: "failed", status: "fail", summary: "failed" }]),
    ).toBe("blocked");
  });
});
