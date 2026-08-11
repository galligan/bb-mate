import { describe, expect, test } from "bun:test";
import { generateThirdPartyLicenses } from "./third-party-licenses.ts";

describe("third-party license generation", () => {
  test("covers the native component registry dependency closure", async () => {
    const licenses = await generateThirdPartyLicenses();

    for (const packageName of [
      "@floating-ui/core",
      "@floating-ui/dom",
      "@floating-ui/react-dom",
      "@floating-ui/utils",
      "@radix-ui/primitive",
      "@radix-ui/react-arrow",
      "@radix-ui/react-compose-refs",
      "@radix-ui/react-context",
      "@radix-ui/react-dismissable-layer",
      "@radix-ui/react-id",
      "@radix-ui/react-popper",
      "@radix-ui/react-portal",
      "@radix-ui/react-presence",
      "@radix-ui/react-primitive",
      "@radix-ui/react-slot",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-use-callback-ref",
      "@radix-ui/react-use-controllable-state",
      "@radix-ui/react-use-effect-event",
      "@radix-ui/react-use-layout-effect",
      "@radix-ui/react-use-rect",
      "@radix-ui/react-use-size",
      "@radix-ui/react-visually-hidden",
      "@radix-ui/rect",
    ]) {
      expect(licenses).toContain(`## ${packageName}@`);
    }
  });
});
