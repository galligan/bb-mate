import { describe, expect, test } from "bun:test";

import { parsePluginSession, readBoundedJson } from "./plugin-session";

describe("browser plugin session codec", () => {
  test("rejects unknown session fields with a generic error", () => {
    expect(() =>
      parsePluginSession({ schemaVersion: 2, privateRoot: "/private/plugin" }),
    ).toThrow("Plugin inspection returned an invalid session.");
  });

  test("requires the JSON response content type", async () => {
    await expect(
      readBoundedJson(
        new Response("{}", { headers: { "Content-Type": "text/plain" } }),
      ),
    ).rejects.toThrow("Plugin inspection returned an invalid session.");
  });

  test("stops reading after 256 KiB", async () => {
    await expect(
      readBoundedJson(
        new Response(`"${"x".repeat(256 * 1_024)}"`, {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ).rejects.toThrow("Plugin inspection returned an invalid session.");
  });
});
