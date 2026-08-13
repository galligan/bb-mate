import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  createOpaqueId,
  createRequestContext,
  createRuntimeHttpHandler,
} from "@bb-plugin-studio/runtime";
import {
  RUNTIME_CAPABILITIES,
  TARGET_LIST_MAX_TARGETS,
} from "@bb-plugin-studio/runtime/supervision";
import { openRuntimeTargetResources } from "./runtime-target-resources.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true })),
  );
});

describe("runtime target resources", () => {
  test("reopens one stable identity and persistent catalog", async () => {
    const parent = await fs.mkdtemp(
      path.join(
        await fs.realpath(os.tmpdir()),
        "bb-plugin-studio-target-resources-",
      ),
    );
    temporaryRoots.push(parent);
    const dataRoot = path.join(parent, "data");
    const sourceRoot = path.join(parent, "source");
    await fs.mkdir(sourceRoot);
    await fs.writeFile(path.join(sourceRoot, "server.ts"), "export {};\n");
    await fs.writeFile(
      path.join(sourceRoot, "package.json"),
      JSON.stringify({
        name: "bb-plugin-persistent",
        version: "1.0.0",
        bb: {
          name: "persistent",
          description: "Persistent plugin",
          branding: { icon: "Puzzle" },
          server: "./server.ts",
        },
      }),
    );

    const first = await openRuntimeTargetResources(dataRoot);
    const firstContext = createRequestContext({
      id: first.identity.principalId,
      kind: "supervisor",
      scopes: ["runtime:read", "targets:read", "targets:write"],
      revoked: false,
      bbContextId: first.identity.bbContextId,
    });
    const admitted = await first.controller.admit(firstContext, {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [{ projectKey: "p".repeat(32), sourcePath: sourceRoot }],
    });
    expect(admitted.projects[0]?.targets).toHaveLength(1);
    first.close();

    const reopened = await openRuntimeTargetResources(dataRoot);
    expect(reopened.identity).toEqual(first.identity);
    const reopenedContext = createRequestContext({
      id: reopened.identity.principalId,
      kind: "supervisor",
      scopes: ["runtime:read", "targets:read", "targets:write"],
      revoked: false,
      bbContextId: reopened.identity.bbContextId,
    });
    expect((await reopened.controller.list(reopenedContext)).targets).toEqual(
      admitted.projects[0]?.targets,
    );
    reopened.close();
  });

  test("reclaims complete-snapshot capacity and reopens the replacement catalog", async () => {
    const parent = await fs.mkdtemp(
      path.join(
        await fs.realpath(os.tmpdir()),
        "bb-plugin-studio-target-limit-",
      ),
    );
    temporaryRoots.push(parent);
    const dataRoot = path.join(parent, "data");
    const sourceRoot = path.join(parent, "source");
    await fs.mkdir(sourceRoot);
    for (let index = 0; index < TARGET_LIST_MAX_TARGETS; index += 1) {
      const pluginRoot = path.join(sourceRoot, `plugin-${index}`);
      await fs.mkdir(pluginRoot);
      await fs.writeFile(path.join(pluginRoot, "server.ts"), "export {};\n");
      await fs.writeFile(
        path.join(pluginRoot, "package.json"),
        JSON.stringify({
          name: `bb-plugin-${index}`,
          version: "1.0.0",
          bb: {
            name: `plugin-${index}`,
            description: `Plugin ${index}`,
            branding: { icon: "Puzzle" },
            server: "./server.ts",
          },
        }),
      );
    }
    await fs.writeFile(
      path.join(sourceRoot, "package.json"),
      JSON.stringify({
        name: "target-limit-workspace",
        private: true,
        workspaces: ["plugin-*"],
      }),
    );

    const first = await openRuntimeTargetResources(dataRoot);
    const firstContext = createRequestContext({
      id: first.identity.principalId,
      kind: "supervisor",
      scopes: ["runtime:read", "targets:read", "targets:write"],
      revoked: false,
      bbContextId: first.identity.bbContextId,
    });
    const admitted = await first.controller.admit(firstContext, {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [{ projectKey: "l".repeat(32), sourcePath: sourceRoot }],
    });
    expect(admitted.projects[0]?.targets).toHaveLength(TARGET_LIST_MAX_TARGETS);

    const overflowRoot = path.join(parent, "overflow");
    await fs.mkdir(overflowRoot);
    await fs.writeFile(path.join(overflowRoot, "server.ts"), "export {};\n");
    await fs.writeFile(
      path.join(overflowRoot, "package.json"),
      JSON.stringify({
        name: "bb-plugin-overflow",
        version: "1.0.0",
        bb: {
          name: "overflow",
          description: "Overflow plugin",
          branding: { icon: "Puzzle" },
          server: "./server.ts",
        },
      }),
    );
    const overflow = await first.controller.admit(firstContext, {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [{ projectKey: "o".repeat(32), sourcePath: overflowRoot }],
    });
    expect(overflow.state).toBe("ready");
    expect(overflow.projects[0]?.targets).toMatchObject([
      { revision: 1, manifest: { pluginId: "overflow" } },
    ]);
    first.close();

    const reopened = await openRuntimeTargetResources(dataRoot);
    const reopenedContext = createRequestContext({
      id: reopened.identity.principalId,
      kind: "supervisor",
      scopes: ["runtime:read", "targets:read", "targets:write"],
      revoked: false,
      bbContextId: reopened.identity.bbContextId,
    });
    const handler = createRuntimeHttpHandler({
      port: 41_721,
      identity: {
        runtimeVersion: "0.1.0-alpha.3",
        instanceId: createOpaqueId(),
        capabilities: RUNTIME_CAPABILITIES,
      },
      authenticate: async () => reopenedContext,
      targets: reopened.controller,
    });
    const response = await handler(
      new Request("http://127.0.0.1:41721/v2/targets", {
        headers: { host: "127.0.0.1:41721" },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      readonly state: string;
      readonly targets: readonly {
        readonly manifest: { readonly pluginId: string };
      }[];
    };
    expect(body.state).toBe("ready");
    expect(body.targets).toHaveLength(1);
    expect(body.targets[0]?.manifest.pluginId).toBe("overflow");
    reopened.close();
  });
});
