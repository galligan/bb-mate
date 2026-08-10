import { describe, expect, test } from "bun:test";

import { RuntimeError } from "./errors.ts";

describe("runtime errors", () => {
  test("exposes only a stable code and redacted public message", () => {
    const sensitiveCause = new Error("secret token and object id");
    const error = new RuntimeError("not_found", { cause: sensitiveCause });

    expect(error.code).toBe("not_found");
    expect(error.message).toBe("Resource not found");
    expect(JSON.stringify(error)).toBe(
      '{"code":"not_found","message":"Resource not found"}',
    );
    expect(JSON.stringify(error)).not.toContain("secret");
  });
});
