import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  attestPackagedRuntime,
  resolvePackagedRuntime,
  type RuntimeArtifactStamp,
} from "./runtime-resolver.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function runtimeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "bb-plugin-mate-resolver-"));
  roots.push(root);
  const executablePath = path.join(root, "runtime", "darwin-arm64", "bb-mate");
  await mkdir(path.dirname(executablePath), { recursive: true });
  await mkdir(path.join(root, "dist"));
  await writeFile(path.join(root, "dist", "server.js"), "// built server\n");
  const bytes = Buffer.alloc(32);
  bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeUInt32LE(0x0100000c, 4);
  bytes.writeUInt32LE(2, 12);
  await writeFile(executablePath, bytes, { mode: 0o755 });
  await chmod(executablePath, 0o755);
  const artifactStamp = {
    schemaVersion: 1,
    artifact: "bb-mate",
    target: "bun-darwin-arm64",
    platform: "darwin",
    architecture: "arm64",
    mode: "0755",
    size: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    runtimeVersion: "0.1.0-alpha.2",
    expectedApiVersion: 1,
  } as const;
  const manifestPath = path.join(path.dirname(executablePath), "manifest.json");
  const { expectedApiVersion: _expectedApiVersion, ...manifestStamp } =
    artifactStamp;
  const manifest = {
    ...manifestStamp,
    bunVersion: "1.3.4",
    storyCount: 13,
    assets: [
      { route: "assets/app.js", size: 24, sha256: "c".repeat(64) },
      { route: "index.html", size: 12, sha256: "b".repeat(64) },
    ],
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const stamp: RuntimeArtifactStamp = {
    ...artifactStamp,
    manifestSize: manifestBytes.byteLength,
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
  };
  await writeFile(manifestPath, manifestBytes);
  return {
    executablePath,
    manifestPath,
    moduleUrl: pathToFileURL(path.join(root, "dist", "server.js")).href,
    stamp,
  };
}

describe("packaged runtime resolver", () => {
  test("resolves only the stamped package-relative darwin-arm64 executable", async () => {
    const fixture = await runtimeFixture();

    await expect(
      resolvePackagedRuntime({
        moduleUrl: fixture.moduleUrl,
        stamp: fixture.stamp,
        platform: "darwin",
        architecture: "arm64",
      }),
    ).resolves.toEqual({
      kind: "available",
      executablePath: fixture.executablePath,
      runtimeVersion: "0.1.0-alpha.2",
      apiVersion: 1,
      size: fixture.stamp.size,
      sha256: fixture.stamp.sha256,
    });
  });

  test("reports an unsupported host before consulting the package", async () => {
    const fixture = await runtimeFixture();
    await rm(fixture.executablePath);

    await expect(
      resolvePackagedRuntime({
        moduleUrl: fixture.moduleUrl,
        stamp: fixture.stamp,
        platform: "linux",
        architecture: "x64",
      }),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "unsupported-platform",
    });
  });

  test("rejects a runtime whose bytes no longer match the embedded stamp", async () => {
    const fixture = await runtimeFixture();
    const tampered = Buffer.alloc(fixture.stamp.size);
    tampered.writeUInt32LE(0xfeedfacf, 0);
    tampered.writeUInt32LE(0x0100000c, 4);
    tampered.writeUInt32LE(2, 12);
    tampered[20] = 1;
    await writeFile(fixture.executablePath, tampered, { mode: 0o755 });

    await expect(
      resolvePackagedRuntime({
        moduleUrl: fixture.moduleUrl,
        stamp: fixture.stamp,
        platform: "darwin",
        architecture: "arm64",
      }),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "artifact-invalid",
    });
  });

  test("rejects a sibling manifest that diverges from the embedded stamp", async () => {
    const fixture = await runtimeFixture();
    const current = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    await writeFile(
      fixture.manifestPath,
      JSON.stringify({ ...current, runtimeVersion: "0.1.0-alpha.1" }),
    );

    await expect(
      resolvePackagedRuntime({
        moduleUrl: fixture.moduleUrl,
        stamp: fixture.stamp,
        platform: "darwin",
        architecture: "arm64",
      }),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "artifact-invalid",
    });
  });

  test("binds every valid standalone manifest field to the embedded byte hash", async () => {
    const mutate = [
      (manifest: Record<string, unknown>) => {
        manifest.bunVersion = "1.3.5";
      },
      (manifest: Record<string, unknown>) => {
        manifest.storyCount = 14;
      },
      (manifest: Record<string, unknown>) => {
        const assets = manifest.assets as Array<Record<string, unknown>>;
        assets[0]!.route = "assets/app2.js";
      },
      (manifest: Record<string, unknown>) => {
        const assets = manifest.assets as Array<Record<string, unknown>>;
        assets[0]!.size = 25;
      },
      (manifest: Record<string, unknown>) => {
        const assets = manifest.assets as Array<Record<string, unknown>>;
        assets[0]!.sha256 = "d".repeat(64);
      },
    ];
    for (const change of mutate) {
      const fixture = await runtimeFixture();
      const manifest = JSON.parse(
        await readFile(fixture.manifestPath, "utf8"),
      ) as Record<string, unknown>;
      change(manifest);
      await writeFile(fixture.manifestPath, JSON.stringify(manifest));
      await expect(
        resolvePackagedRuntime({
          moduleUrl: fixture.moduleUrl,
          stamp: fixture.stamp,
          platform: "darwin",
          architecture: "arm64",
        }),
      ).resolves.toEqual({ kind: "unavailable", reason: "artifact-invalid" });
    }
  });

  test("accepts only canonical safe relative standalone asset routes", async () => {
    for (const route of [
      "/index.html",
      "../index.html",
      "assets//app.js",
      "assets\\app.js",
      "assets/\u001fapp.js",
      "assets/\u007fapp.js",
    ]) {
      const fixture = await runtimeFixture();
      const manifest = JSON.parse(
        await readFile(fixture.manifestPath, "utf8"),
      ) as { assets: Array<Record<string, unknown>> };
      manifest.assets[0]!.route = route;
      await writeFile(fixture.manifestPath, JSON.stringify(manifest));
      await expect(
        resolvePackagedRuntime({
          moduleUrl: fixture.moduleUrl,
          stamp: fixture.stamp,
          platform: "darwin",
          architecture: "arm64",
        }),
      ).resolves.toEqual({ kind: "unavailable", reason: "artifact-invalid" });
    }
  });

  test("rejects non-executable mode and non-arm64 Mach-O identity", async () => {
    const wrongMode = await runtimeFixture();
    await chmod(wrongMode.executablePath, 0o644);
    expect(
      await resolvePackagedRuntime({
        moduleUrl: wrongMode.moduleUrl,
        stamp: wrongMode.stamp,
        platform: "darwin",
        architecture: "arm64",
      }),
    ).toEqual({ kind: "unavailable", reason: "artifact-invalid" });

    const wrongArchitecture = await runtimeFixture();
    const bytes = Buffer.alloc(wrongArchitecture.stamp.size);
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(0x01000007, 4);
    bytes.writeUInt32LE(2, 12);
    await writeFile(wrongArchitecture.executablePath, bytes, { mode: 0o755 });
    expect(
      await resolvePackagedRuntime({
        moduleUrl: wrongArchitecture.moduleUrl,
        stamp: {
          ...wrongArchitecture.stamp,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
        platform: "darwin",
        architecture: "arm64",
      }),
    ).toEqual({ kind: "unavailable", reason: "artifact-invalid" });
  });

  test("rejects symlinked and multiply-linked runtime artifacts", async () => {
    const symlinked = await runtimeFixture();
    const outsideRoot = await mkdtemp(
      path.join(tmpdir(), "bb-plugin-mate-outside-"),
    );
    roots.push(outsideRoot);
    const outside = path.join(outsideRoot, "bb-mate");
    await writeFile(outside, await readFile(symlinked.executablePath), {
      mode: 0o755,
    });
    await rm(symlinked.executablePath);
    await symlink(outside, symlinked.executablePath);
    expect(
      await resolvePackagedRuntime({
        moduleUrl: symlinked.moduleUrl,
        stamp: symlinked.stamp,
        platform: "darwin",
        architecture: "arm64",
      }),
    ).toEqual({ kind: "unavailable", reason: "artifact-invalid" });

    const hardlinked = await runtimeFixture();
    await link(hardlinked.executablePath, path.join(outsideRoot, "hardlink"));
    expect(
      await resolvePackagedRuntime({
        moduleUrl: hardlinked.moduleUrl,
        stamp: hardlinked.stamp,
        platform: "darwin",
        architecture: "arm64",
      }),
    ).toEqual({ kind: "unavailable", reason: "artifact-invalid" });
  });

  test("rejects a symlinked packaged runtime directory ancestor", async () => {
    const fixture = await runtimeFixture();
    const packageRoot = fileURLToPath(new URL("..", fixture.moduleUrl));
    const outsideRoot = await mkdtemp(
      path.join(tmpdir(), "bb-plugin-mate-runtime-dir-"),
    );
    roots.push(outsideRoot);
    await rename(
      path.join(packageRoot, "runtime"),
      path.join(outsideRoot, "runtime"),
    );
    await symlink(
      path.join(outsideRoot, "runtime"),
      path.join(packageRoot, "runtime"),
    );

    await expect(
      resolvePackagedRuntime({
        moduleUrl: fixture.moduleUrl,
        stamp: fixture.stamp,
        platform: "darwin",
        architecture: "arm64",
      }),
    ).resolves.toEqual({ kind: "unavailable", reason: "artifact-invalid" });
  });

  test("rejects a symlinked loaded server and catches post-resolution drift", async () => {
    const symlinkedServer = await runtimeFixture();
    const modulePath = fileURLToPath(symlinkedServer.moduleUrl);
    const outsideRoot = await mkdtemp(
      path.join(tmpdir(), "bb-plugin-mate-server-link-"),
    );
    roots.push(outsideRoot);
    const outsideServer = path.join(outsideRoot, "server.js");
    await writeFile(outsideServer, "// outside server\n");
    await rm(modulePath);
    await symlink(outsideServer, modulePath);
    await expect(
      resolvePackagedRuntime({
        moduleUrl: symlinkedServer.moduleUrl,
        stamp: symlinkedServer.stamp,
        platform: "darwin",
        architecture: "arm64",
      }),
    ).resolves.toEqual({ kind: "unavailable", reason: "artifact-invalid" });

    const drifted = await runtimeFixture();
    const resolved = await resolvePackagedRuntime({
      moduleUrl: drifted.moduleUrl,
      stamp: drifted.stamp,
      platform: "darwin",
      architecture: "arm64",
    });
    expect(resolved.kind).toBe("available");
    if (resolved.kind !== "available")
      throw new Error("fixture did not resolve");
    const replacement = Buffer.alloc(drifted.stamp.size);
    replacement.writeUInt32LE(0xfeedfacf, 0);
    replacement.writeUInt32LE(0x0100000c, 4);
    replacement.writeUInt32LE(2, 12);
    replacement[20] = 1;
    await writeFile(drifted.executablePath, replacement, { mode: 0o755 });
    await expect(attestPackagedRuntime(resolved)).resolves.toBe(false);
  });
});
