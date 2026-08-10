import { describe, expect, test } from "bun:test";

import {
  ObjectIdSchema,
  createOpaqueId,
  type OpaqueIdRandomSource,
} from "./ids.ts";

describe("opaque identifiers", () => {
  test("accepts generated identifiers without embedding caller data", () => {
    const randomSource: OpaqueIdRandomSource = (length) =>
      new Uint8Array(length).fill(0xab);

    const id = createOpaqueId(randomSource);

    expect(String(id)).toBe("q6urq6urq6urq6urq6urq6urq6urq6ur");
    expect(String(ObjectIdSchema.parse(id))).toBe(String(id));
    expect(() => ObjectIdSchema.parse("target-my-plugin")).toThrow();
  });
});
