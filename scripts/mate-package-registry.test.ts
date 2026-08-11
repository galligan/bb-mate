import { describe, expect, test } from "bun:test";
import {
  createMateRegistryDocument,
  MATE_PACKAGE_NAME,
  MATE_PACKAGE_VERSION,
} from "./mate-package-registry.ts";

describe("Mate package clean-room registry", () => {
  test("serves one exact engine-pinned release with strict integrity", () => {
    const document = createMateRegistryDocument({
      baseUrl: "http://127.0.0.1:1234",
      integrity: "sha512-exact",
      shasum: "exact-sha1",
    }) as {
      name: string;
      "dist-tags": Record<string, string>;
      versions: Record<string, Record<string, unknown>>;
    };

    expect(document.name).toBe(MATE_PACKAGE_NAME);
    expect(document["dist-tags"]).toEqual({ latest: MATE_PACKAGE_VERSION });
    expect(Object.keys(document.versions)).toEqual([MATE_PACKAGE_VERSION]);
    expect(document.versions[MATE_PACKAGE_VERSION]).toEqual({
      name: MATE_PACKAGE_NAME,
      version: MATE_PACKAGE_VERSION,
      license: "MIT",
      engines: { bb: ">=0.36", bbPluginSdk: "^0.4.1" },
      dist: {
        integrity: "sha512-exact",
        shasum: "exact-sha1",
        tarball:
          "http://127.0.0.1:1234/bb-plugin-mate/-/bb-plugin-mate-0.1.0-alpha.1.tgz",
      },
    });
  });
});
