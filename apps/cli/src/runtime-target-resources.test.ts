import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createRequestContext } from "@bb-mate/runtime";
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
      path.join(await fs.realpath(os.tmpdir()), "bb-mate-target-resources-"),
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
      schemaVersion: 1,
      sourcePath: sourceRoot,
    });
    expect(admitted.targets).toHaveLength(1);
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
      admitted.targets,
    );
    reopened.close();
  });
});
