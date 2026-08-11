import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  assertMatePackageFileSize,
  assertMatePackageMetadata,
  assertMateThirdPartyCoverage,
  gunzipMateTar,
  inspectMatePackageArchive,
  preflightMateTarBytes,
} from "./inspect-mate-package.ts";
import { MATE_PACKAGE_ALLOWLIST } from "./mate-package-artifact.ts";
import { createCanonicalUstarFixture } from "./mate-package-ustar-fixture.ts";

function buildMetadata() {
  return {
    sdkMajor: 0,
    sdkVersion: "0.4.1",
    artifactFormatVersion: 1,
    pluginId: "mate",
    pluginVersion: "0.1.0-alpha.2",
    builtWith: { bbVersion: "0.36.0", pluginSdkVersion: "0.4.1" },
  };
}

function packageManifest() {
  return {
    name: "bb-plugin-mate",
    version: "0.1.0-alpha.2",
    private: true,
    type: "module",
    license: "MIT",
    engines: { bb: ">=0.36", bbPluginSdk: "^0.4.1" },
    bb: {
      name: "Plugin Workbench",
      description:
        "Develop source plugins with the supervised bb-mate runtime.",
      branding: { icon: "Wrench" },
      server: "./dist/server.js",
      app: "./dist/app.js",
      skills: ["./skills/plugin-workbench"],
    },
    files: MATE_PACKAGE_ALLOWLIST.filter((file) => file !== "package.json"),
  };
}

describe("Mate package inspection", () => {
  test("accepts only the pinned package and plugin build identities", () => {
    expect(() =>
      assertMatePackageMetadata(
        packageManifest(),
        buildMetadata(),
        buildMetadata(),
      ),
    ).not.toThrow();
  });

  test("rejects source entrypoints and build-version drift", () => {
    expect(() =>
      assertMatePackageMetadata(
        {
          ...packageManifest(),
          bb: {
            ...packageManifest().bb,
            server: "./server.ts",
            app: "./app.tsx",
          },
        },
        buildMetadata(),
        buildMetadata(),
      ),
    ).toThrow("entrypoints");
    expect(() =>
      assertMatePackageMetadata(
        packageManifest(),
        {
          ...buildMetadata(),
          builtWith: { bbVersion: "0.37.0", pluginSdkVersion: "0.4.1" },
        },
        buildMetadata(),
      ),
    ).toThrow("build metadata");
  });

  test("rejects dependency drift in the local-verification manifest", () => {
    expect(() =>
      assertMatePackageMetadata(
        { ...packageManifest(), dependencies: { zod: "latest" } },
        buildMetadata(),
        buildMetadata(),
      ),
    ).toThrow("manifest keys differ");
  });

  test("rejects incomplete runtime redistribution notices", () => {
    const notices =
      "bundled Zod protocol implementation; compiled with and embeds the Bun 1.3.14 runtime; Bun itself is MIT-licensed; JavaScriptCore and WebKit under LGPL-2; local verification only; BUN_LICENSE.md";
    expect(() =>
      assertMateThirdPartyCoverage(notices, "## zod@4.4.3\n", "1.3.14"),
    ).not.toThrow();
    expect(() =>
      assertMateThirdPartyCoverage(
        notices.replace("compiled with and embeds", "built by"),
        "## zod@4.4.3\n",
        "1.3.14",
      ),
    ).toThrow("do not cover");
  });

  test("bounds non-runtime files and expanded gzip input", () => {
    expect(() =>
      assertMatePackageFileSize("dist/server.js", 17 * 1024 * 1024),
    ).toThrow("oversized");
    expect(() => gunzipMateTar(gzipSync(Buffer.alloc(2_048)), 1_024)).toThrow();
  });

  test("rejects crafted link and traversal headers before extraction", async () => {
    const tarExecutable = "/usr/bin/tar";
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mate-hostile-tar-"),
    );
    async function createArchive(
      name: string,
      entries: Parameters<typeof createCanonicalUstarFixture>[0],
    ): Promise<string> {
      const archive = path.join(temporaryRoot, `${name}.tgz`);
      await fs.writeFile(
        archive,
        gzipSync(createCanonicalUstarFixture(entries)),
      );
      return archive;
    }
    try {
      const symlink = await createArchive("symlink", [
        { name: "package/symlink", type: "2", linkName: "file" },
      ]);
      const hardlink = await createArchive("hardlink", [
        { name: "package/hardlink", type: "1", linkName: "package/file" },
      ]);
      const traversal = await createArchive("traversal", [
        { name: "../escape", contents: "fixture" },
      ]);
      const longname = await createArchive("longname", [
        {
          name: "././@LongLink",
          type: "L",
          contents: `${"package/"}${"a".repeat(120)}\0`,
        },
      ]);
      await expect(
        inspectMatePackageArchive(symlink, tarExecutable),
      ).rejects.toThrow("unsupported raw header type");
      await expect(
        inspectMatePackageArchive(hardlink, tarExecutable),
      ).rejects.toThrow("unsupported raw header type");
      await expect(
        inspectMatePackageArchive(traversal, tarExecutable),
      ).rejects.toThrow("unsafe raw header");
      await expect(
        inspectMatePackageArchive(longname, tarExecutable),
      ).rejects.toThrow("unsupported raw header type");
      expect(
        await fs
          .access(path.join(temporaryRoot, "escape"))
          .then(() => true)
          .catch(() => false),
      ).toBe(false);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("rejects a second gzip member and noncanonical tar endings", async () => {
    const expanded = createCanonicalUstarFixture(
      MATE_PACKAGE_ALLOWLIST.map((file) => ({
        name: `package/${file}`,
        contents: file,
      })),
    );
    const valid = gzipSync(expanded);
    expect(preflightMateTarBytes(valid)).toHaveLength(14);
    expect(() =>
      preflightMateTarBytes(
        Buffer.concat([valid, gzipSync("SECRET_SOURCE_PAYLOAD")]),
      ),
    ).toThrow("canonical end");
    expect(() =>
      preflightMateTarBytes(gzipSync(expanded.subarray(0, -512))),
    ).toThrow("canonical end");
    expect(() =>
      preflightMateTarBytes(
        gzipSync(Buffer.concat([expanded, Buffer.alloc(512)])),
      ),
    ).toThrow("canonical end");
  });
});
