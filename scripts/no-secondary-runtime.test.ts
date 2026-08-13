import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

const removedPaths = [
  "plugins/studio/runtime",
  "plugins/studio/src/generated/runtime-artifact-stamp.ts",
  "plugins/studio/src/runtime/darwin-arm64/bb-plugin-studio-runtime",
  "plugins/studio/src/runtime/darwin-arm64/manifest.json",
  "plugins/studio/src/backend/runtime-launcher.ts",
  "plugins/studio/src/backend/runtime-resolver.ts",
  "plugins/studio/src/backend/runtime-supervisor.ts",
  "plugins/studio/src/backend/runtime-target-client.ts",
  "apps/cli/src/serve.ts",
  "apps/cli/src/runtime-http-listener.ts",
  "apps/cli/src/runtime-target-controller.ts",
  "apps/cli/src/runtime-target-resources.ts",
  "apps/cli/src/supervisor-channel.ts",
  "packages/runtime/src/supervision/identity.ts",
  "packages/runtime/src/supervision/protocol.ts",
  "packages/runtime/src/persistence/store.ts",
  "packages/runtime/src/service/workbench-service.ts",
  "scripts/build-standalone.ts",
  "scripts/inspect-standalone.ts",
  "scripts/standalone-clean-room.ts",
] as const;

async function exists(relative: string): Promise<boolean> {
  return fs
    .access(path.join(repositoryRoot, relative))
    .then(() => true)
    .catch(() => false);
}

describe("secondary runtime removal", () => {
  test("keeps the removed child-runtime graph absent", async () => {
    const present = (
      await Promise.all(
        removedPaths.map(async (relative) => ({
          relative,
          present: await exists(relative),
        })),
      )
    ).filter(({ present }) => present);

    expect(present).toEqual([]);
  });

  test("keeps package and CLI contracts free of child runtime entrypoints", async () => {
    const [
      rootManifest,
      pluginManifest,
      args,
      commands,
      entrypoint,
      backend,
      nativeCatalog,
      controller,
    ] = await Promise.all(
      [
        "package.json",
        "plugins/studio/package.json",
        "apps/cli/src/args.ts",
        "apps/cli/src/commands.ts",
        "apps/cli/src/entrypoint.ts",
        "plugins/studio/src/backend/plugin.ts",
        "packages/runtime/src/native-catalog.ts",
        "packages/runtime/src/project-target-controller.ts",
      ].map((relative) =>
        fs.readFile(path.join(repositoryRoot, relative), "utf8"),
      ),
    );

    expect(rootManifest).not.toMatch(/standalone:/u);
    expect(pluginManifest).not.toMatch(/runtime\/darwin-arm64/u);
    expect(args).not.toMatch(/\bserve\b/u);
    expect(commands).not.toMatch(/\bserve\b/u);
    expect(entrypoint).not.toMatch(/runSupervisedServe|mode:\s*"standalone"/u);
    expect(backend).not.toMatch(
      /Bun\.spawn|node:child_process|Bun\.serve|\.listen\(/u,
    );
    expect(`${nativeCatalog}\n${controller}`).not.toMatch(
      /\b(?:createRuntimeTargetController|CreateRuntimeTargetControllerOptions)\b/u,
    );
  });
});
