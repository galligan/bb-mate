import { describe, expect, test } from "bun:test";

import { PrincipalKindSchema, ScopeSchema } from "./principals.ts";

describe("principal contracts", () => {
  test("exposes only the explicit credential classes and least-privilege scopes", () => {
    expect(PrincipalKindSchema.options).toEqual([
      "supervisor",
      "browser-session",
      "plugin-adapter",
      "mcp-client",
    ]);
    expect(ScopeSchema.options).toContain("runtime:read");
    expect(ScopeSchema.options).toContain("events:read");
    expect(ScopeSchema.options).toContain("credential:issue");
    expect(() => ScopeSchema.parse("admin")).toThrow();
    expect(() => PrincipalKindSchema.parse("user")).toThrow();
  });
});
