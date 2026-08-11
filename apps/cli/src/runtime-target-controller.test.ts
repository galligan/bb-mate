import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  BbContextIdSchema,
  createRequestContext,
  ObjectIdSchema,
  OpaqueIdSchema,
  openDevelopmentTargetCatalog,
  PrincipalIdSchema,
} from "@bb-mate/runtime";
import { createRuntimeTargetController } from "./runtime-target-controller.ts";

const temporaryRoots: string[] = [];
const principalId = PrincipalIdSchema.parse("p".repeat(32));
const bbContextId = BbContextIdSchema.parse("b".repeat(32));

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true })),
  );
});

async function makeFixture() {
  const parent = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "bb-mate-cli-targets-"),
  );
  temporaryRoots.push(parent);
  return {
    dataRoot: path.join(parent, "data"),
    sourceRoot: path.join(parent, "source"),
  };
}

async function writePlugin(
  root: string,
  id: string,
  options: { readonly invalidSibling?: boolean } = {},
) {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "server.ts"), "export {};\n");
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: `bb-plugin-${id}`,
      version: "1.2.3",
      bb: {
        name: id,
        description: `${id} plugin`,
        branding: { icon: "Puzzle" },
        server: "./server.ts",
      },
    }),
  );
  if (options.invalidSibling) {
    const broken = path.join(root, "broken");
    await fs.mkdir(broken);
    await fs.writeFile(path.join(broken, "package.json"), "{");
  }
}

function context() {
  return createRequestContext({
    id: principalId,
    kind: "supervisor",
    scopes: ["runtime:read", "targets:read", "targets:write"],
    revoked: false,
    bbContextId,
  });
}

describe("runtime target controller", () => {
  test("admits, passively discovers, and refreshes only this scan's targets", async () => {
    const fixture = await makeFixture();
    const first = path.join(fixture.sourceRoot, "first");
    const second = path.join(fixture.sourceRoot, "second");
    await writePlugin(first, "first");
    await writePlugin(second, "second");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: (() => {
        const ids = ["a".repeat(32), "z".repeat(32)];
        return () => ObjectIdSchema.parse(ids.shift());
      })(),
      clock: () => 1_000,
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("r".repeat(32)),
      clock: () => 1_000,
    });

    const response = await controller.admit(context(), {
      schemaVersion: 1,
      sourcePath: fixture.sourceRoot,
    });

    expect(response.state).toBe("ready");
    expect(response.targets.map((target) => target.manifest.pluginId)).toEqual([
      "first",
      "second",
    ]);
    expect(response.targets.map((target) => target.revision)).toEqual([1, 1]);
    expect(JSON.stringify(response)).not.toContain(fixture.sourceRoot);

    const refreshed = await controller.admit(context(), {
      schemaVersion: 1,
      sourcePath: first,
    });
    expect(refreshed.targets).toHaveLength(1);
    expect(refreshed.targets[0]?.manifest.pluginId).toBe("first");
    expect(refreshed.targets[0]?.revision).toBe(2);

    const global = await controller.list(context());
    expect(global.state).toBe("ready");
    expect(global.targets.map((target) => target.manifest.pluginId)).toEqual([
      "first",
      "second",
    ]);
    catalog.close();
  });

  test("reports bounded discovery diagnostics without leaking them or skipping valid candidates", async () => {
    const fixture = await makeFixture();
    await writePlugin(fixture.sourceRoot, "valid", { invalidSibling: true });
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("t".repeat(32)),
      clock: () => 1_000,
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("r".repeat(32)),
      clock: () => 1_000,
    });

    const response = await controller.admit(context(), {
      schemaVersion: 1,
      sourcePath: fixture.sourceRoot,
    });

    expect(response).toMatchObject({ state: "partial" });
    expect(response.targets.map((target) => target.manifest.pluginId)).toEqual([
      "valid",
    ]);
    expect(Object.keys(response).sort()).toEqual([
      "schemaVersion",
      "state",
      "targets",
    ]);
    expect(JSON.stringify(response)).not.toContain("broken");
    expect(JSON.stringify(response)).not.toContain(fixture.sourceRoot);
    catalog.close();
  });

  test("returns a path-free partial result when no root can be admitted", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("r".repeat(32)),
    });

    const response = await controller.admit(context(), {
      schemaVersion: 1,
      sourcePath: path.join(fixture.sourceRoot, "missing"),
    });

    expect(response).toEqual({
      schemaVersion: 1,
      state: "partial",
      targets: [],
    });
    expect((await controller.list(context())).targets).toEqual([]);
    expect(JSON.stringify(response)).not.toContain("missing");
    catalog.close();
  });

  test("keeps successful refreshes when a later candidate fails", async () => {
    const fixture = await makeFixture();
    await writePlugin(path.join(fixture.sourceRoot, "a-first"), "first");
    await writePlugin(path.join(fixture.sourceRoot, "b-failing"), "failing");
    await writePlugin(path.join(fixture.sourceRoot, "c-last"), "last");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: (() => {
        const ids = ["a".repeat(32), "z".repeat(32)];
        return () => ObjectIdSchema.parse(ids.shift());
      })(),
      clock: () => 1_000,
    });
    let observation = 0;
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("r".repeat(32)),
      clock: () => {
        observation += 1;
        return observation === 2 ? -1 : 1_000 + observation;
      },
    });

    const response = await controller.admit(context(), {
      schemaVersion: 1,
      sourcePath: fixture.sourceRoot,
    });

    expect(response.state).toBe("partial");
    expect(response.targets.map((target) => target.manifest.pluginId)).toEqual([
      "first",
      "last",
    ]);
    expect(
      (await controller.list(context())).targets.map(
        (target) => target.manifest.pluginId,
      ),
    ).toEqual(["first", "last"]);
    catalog.close();
  });
});
