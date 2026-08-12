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
  type OpaqueId,
} from "@bb-mate/runtime";
import { TARGET_LIST_MAX_TARGETS } from "@bb-mate/runtime/supervision";
import { createRuntimeTargetController } from "./runtime-target-controller.ts";
import {
  admitTrustedRoots,
  discoverWorkspaceSourceCandidates,
} from "@bb-mate/inspection";

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
  test("admits all requested projects in one path-free grouped discovery pass", async () => {
    const fixture = await makeFixture();
    const first = path.join(fixture.sourceRoot, "first-project");
    const second = path.join(fixture.sourceRoot, "second-project");
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
      createRootKey: (() => {
        const keys = [
          "r".repeat(32),
          "q".repeat(32),
          "u".repeat(32),
          "v".repeat(32),
          "w".repeat(32),
        ];
        return () => OpaqueIdSchema.parse(keys.shift());
      })(),
      clock: () => 1_000,
    });

    const response = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "f".repeat(32), sourcePath: first },
        { projectKey: "s".repeat(32), sourcePath: second },
      ],
    });

    expect(response.state).toBe("ready");
    expect(response.projects).toHaveLength(2);
    expect(response.projects.map(({ projectKey }) => projectKey)).toEqual([
      "f".repeat(32),
      "s".repeat(32),
    ]);
    expect(
      response.projects.map(({ state, targets }) => ({
        state,
        plugins: targets.map((target) => target.manifest.pluginId),
      })),
    ).toEqual([
      { state: "ready", plugins: ["first"] },
      { state: "ready", plugins: ["second"] },
    ]);
    expect(JSON.stringify(response)).not.toContain(fixture.sourceRoot);
    const secondTargetId = response.projects[1]?.targets[0]?.id;

    const refreshed = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [{ projectKey: "f".repeat(32), sourcePath: first }],
    });
    expect(refreshed.projects[0]?.targets).toHaveLength(1);
    expect(refreshed.projects[0]?.targets[0]?.manifest.pluginId).toBe("first");
    expect(refreshed.projects[0]?.targets[0]?.revision).toBe(1);

    const global = await controller.list(context());
    expect(global.state).toBe("ready");
    expect(global.targets.map((target) => target.manifest.pluginId)).toEqual([
      "first",
    ]);

    const reopened = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete",
      projects: [
        { projectKey: "f".repeat(32), sourcePath: first },
        { projectKey: "s".repeat(32), sourcePath: second },
      ],
    });
    expect(reopened.projects[1]?.targets).toMatchObject([
      { id: secondTargetId, revision: 3, manifest: { pluginId: "second" } },
    ]);
    catalog.close();
  });

  test("marks every project partial when its shared candidate exceeds the cap", async () => {
    const fixture = await makeFixture();
    const parent = path.join(fixture.sourceRoot, "parent");
    const child = path.join(parent, "z-child");
    await writePlugin(path.join(child, "z-shared"), "shared-overflow");
    await fs.writeFile(
      path.join(parent, "package.json"),
      JSON.stringify({
        name: "parent",
        private: true,
        workspaces: ["a-parent/*", "z-child/z-shared"],
      }),
    );
    await fs.writeFile(
      path.join(child, "package.json"),
      JSON.stringify({
        name: "child",
        private: true,
        workspaces: ["a-child/*", "z-shared"],
      }),
    );
    for (const [container, prefix] of [
      [path.join(parent, "a-parent"), "parent"],
      [path.join(child, "a-child"), "child"],
    ] as const) {
      for (let index = 0; index < 64; index += 1)
        await writePlugin(
          path.join(container, `plugin-${index}`),
          `${prefix}-${index}`,
        );
    }
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
    });

    const response = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete",
      projects: [
        { projectKey: "p".repeat(32), sourcePath: parent },
        { projectKey: "c".repeat(32), sourcePath: child },
      ],
    });

    expect(response.state).toBe("partial");
    expect(
      response.projects.map(({ projectKey, state }) => ({ projectKey, state })),
    ).toEqual([
      { projectKey: "p".repeat(32), state: "partial" },
      { projectKey: "c".repeat(32), state: "partial" },
    ]);
    expect(response.projects.flatMap(({ targets }) => targets)).toHaveLength(
      128,
    );
    expect(
      response.projects
        .flatMap(({ targets }) => targets)
        .some(({ manifest }) => manifest.pluginId === "shared-overflow"),
    ).toBe(false);
    catalog.close();
  });

  test("preserves projects omitted from a partial inventory", async () => {
    const fixture = await makeFixture();
    const visible = path.join(fixture.sourceRoot, "visible-project");
    const omitted = path.join(fixture.sourceRoot, "omitted-project");
    await writePlugin(visible, "visible");
    await writePlugin(omitted, "omitted");
    const ids = ["v".repeat(32), "o".repeat(32)];
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse(ids.shift()),
      clock: () => 1_000,
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
    });
    await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete",
      projects: [
        { projectKey: "v".repeat(32), sourcePath: visible },
        { projectKey: "o".repeat(32), sourcePath: omitted },
      ],
    });

    const partial = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial",
      projects: [{ projectKey: "v".repeat(32), sourcePath: visible }],
    });

    expect(partial).toMatchObject({
      state: "partial",
      projects: [{ projectKey: "v".repeat(32), state: "ready" }],
    });
    expect(
      (await controller.list(context())).targets
        .map((target) => target.manifest.pluginId)
        .sort(),
    ).toEqual(["omitted", "visible"]);
    catalog.close();
  });

  test("retires absent targets only after a complete project snapshot", async () => {
    const fixture = await makeFixture();
    await writePlugin(fixture.sourceRoot, "removable");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("r".repeat(32)),
      clock: (() => {
        let value = 1_000;
        return () => (value += 1);
      })(),
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("k".repeat(32)),
    });
    const request = () => ({
      schemaVersion: 2 as const,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });

    expect(
      (await controller.admit(context(), request())).projects[0]?.targets,
    ).toHaveLength(1);
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({ name: "no-longer-a-plugin", private: true }),
    );
    const complete = await controller.admit(context(), request());

    expect(complete).toMatchObject({
      state: "ready",
      projects: [{ state: "ready", targets: [] }],
    });
    expect((await controller.list(context())).targets).toEqual([]);
    catalog.close();
  });

  test("retires prior project targets from an empty complete inventory", async () => {
    const fixture = await makeFixture();
    await writePlugin(fixture.sourceRoot, "removed-project");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("e".repeat(32)),
      clock: (() => {
        let value = 1_000;
        return () => (value += 1);
      })(),
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
    });
    await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete",
      projects: [
        { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });

    const empty = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete",
      projects: [],
    });

    expect(empty).toEqual({
      schemaVersion: 2,
      state: "ready",
      projects: [],
    });
    expect((await controller.list(context())).targets).toEqual([]);
    catalog.close();
  });

  test("retains uncertain targets after a partial project snapshot", async () => {
    const fixture = await makeFixture();
    await writePlugin(fixture.sourceRoot, "uncertain");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("u".repeat(32)),
      clock: (() => {
        let value = 1_000;
        return () => (value += 1);
      })(),
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("k".repeat(32)),
    });
    const request = () => ({
      schemaVersion: 2 as const,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });
    await controller.admit(context(), request());
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({
        name: "uncertain-workspace",
        private: true,
        workspaces: 42,
      }),
    );
    const partial = await controller.admit(context(), request());

    expect(partial).toMatchObject({
      state: "partial",
      projects: [{ state: "partial", targets: [] }],
    });
    expect(
      (await controller.list(context())).targets.map(
        (target) => target.manifest.pluginId,
      ),
    ).toEqual(["uncertain"]);
    catalog.close();
  });

  test(
    "retires a healthy project's removed targets while a peer stays partial",
    async () => {
      const fixture = await makeFixture();
      const healthyRoot = path.join(fixture.sourceRoot, "healthy");
      const partialRoot = path.join(fixture.sourceRoot, "partial");
      await writePlugin(healthyRoot, "removable-healthy");
      await writePlugin(partialRoot, "retained-partial");
      const partialManifestPath = path.join(partialRoot, "package.json");
      const partialManifest = JSON.parse(
        await fs.readFile(partialManifestPath, "utf8"),
      ) as Record<string, unknown>;
      partialManifest.workspaces = 42;
      await fs.writeFile(partialManifestPath, JSON.stringify(partialManifest));
      const catalog = await openDevelopmentTargetCatalog({
        dataRoot: fixture.dataRoot,
        clock: (() => {
          let value = 1_000;
          return () => (value += 1);
        })(),
      });
      const controller = createRuntimeTargetController({
        catalog,
        principalId,
        bbContextId,
      });
      const request = () => ({
        schemaVersion: 2 as const,
        inventoryState: "complete" as const,
        projects: [
          { projectKey: "h".repeat(32), sourcePath: healthyRoot },
          { projectKey: "p".repeat(32), sourcePath: partialRoot },
        ],
      });

      expect((await controller.admit(context(), request())).state).toBe(
        "partial",
      );
      await fs.writeFile(
        path.join(healthyRoot, "package.json"),
        JSON.stringify({
          name: "healthy-workspace",
          private: true,
          workspaces: ["cycle-*"],
        }),
      );

      const refreshed = await controller.admit(context(), request());

      expect(refreshed.projects).toMatchObject([
        { state: "ready", targets: [] },
        {
          state: "partial",
          targets: [{ manifest: { pluginId: "retained-partial" } }],
        },
      ]);
      expect(
        (await controller.list(context())).targets.map(
          (target) => target.manifest.pluginId,
        ),
      ).toEqual(["retained-partial"]);

      let previousRoot: string | undefined;
      for (let index = 0; index <= TARGET_LIST_MAX_TARGETS; index += 1) {
        if (previousRoot !== undefined) {
          await fs.rm(previousRoot, { recursive: true });
        }
        const nextRoot = path.join(healthyRoot, `cycle-${index}`);
        await writePlugin(nextRoot, `cycle-${index}`);
        const cycled = await controller.admit(context(), request());
        expect(cycled.projects[0]?.targets).toHaveLength(1);
        previousRoot = nextRoot;
      }
      expect(
        (await controller.list(context())).targets.map(
          (target) => target.manifest.pluginId,
        ),
      ).toEqual(["retained-partial", `cycle-${TARGET_LIST_MAX_TARGETS}`]);
      catalog.close();
    },
    { timeout: 15_000 },
  );

  test("preserves targets reachable from a nested partial project", async () => {
    const fixture = await makeFixture();
    const parentRoot = path.join(fixture.sourceRoot, "parent");
    const childRoot = path.join(parentRoot, "child");
    await writePlugin(childRoot, "nested-partial");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("n".repeat(32)),
      clock: (() => {
        let value = 1_000;
        return () => (value += 1);
      })(),
    });
    const seed = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("s".repeat(32)),
    });
    await seed.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [{ projectKey: "s".repeat(32), sourcePath: childRoot }],
    });

    const keys = ["p".repeat(32), "c".repeat(32)];
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse(keys.shift()),
      discoverCandidates: async (roots, options) => {
        const discovered = await discoverWorkspaceSourceCandidates(
          roots,
          options,
        );
        return {
          candidates: discovered.candidates,
          diagnostics: [
            ...discovered.diagnostics,
            {
              code: "test-partial-child",
              rootKey: "c".repeat(32),
              displayPath: "child",
              detail: "The nested project scan is incomplete.",
            },
          ],
        };
      },
    });

    const response = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "p".repeat(32), sourcePath: parentRoot },
        { projectKey: "c".repeat(32), sourcePath: childRoot },
      ],
    });

    expect(response.projects.map(({ state }) => state)).toEqual([
      "ready",
      "partial",
    ]);
    expect(
      (await controller.list(context())).targets.map(
        (target) => target.manifest.pluginId,
      ),
    ).toEqual(["nested-partial"]);
    catalog.close();
  });

  test("scans a duplicate canonical root once and fans its projections out", async () => {
    const fixture = await makeFixture();
    await writePlugin(fixture.sourceRoot, "shared");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("d".repeat(32)),
      clock: () => 1_000,
    });
    const keys = [
      "r".repeat(32),
      "q".repeat(32),
      "s".repeat(32),
      "t".repeat(32),
    ];
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse(keys.shift()),
      clock: () => 1_000,
    });

    const response = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "a".repeat(32), sourcePath: fixture.sourceRoot },
        { projectKey: "b".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });

    expect(response.state).toBe("ready");
    expect(
      response.projects.map(({ state, targets }) => ({
        state,
        ids: targets.map((target) => String(target.id)),
        revisions: targets.map((target) => target.revision),
      })),
    ).toEqual([
      { state: "ready", ids: ["d".repeat(32)], revisions: [1] },
      { state: "ready", ids: ["d".repeat(32)], revisions: [1] },
    ]);
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({ name: "no-longer-a-plugin", private: true }),
    );
    const retired = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "a".repeat(32), sourcePath: fixture.sourceRoot },
        { projectKey: "b".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });
    expect(retired.projects.map(({ targets }) => targets)).toEqual([[], []]);
    expect((await controller.list(context())).targets).toEqual([]);
    catalog.close();
  });

  test("fans a nested workspace candidate out to every project that discovered it", async () => {
    const fixture = await makeFixture();
    const nestedRoot = path.join(fixture.sourceRoot, "plugins", "shared");
    await fs.mkdir(fixture.sourceRoot, { recursive: true });
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({
        name: "parent",
        private: true,
        workspaces: ["plugins/*"],
      }),
    );
    await writePlugin(nestedRoot, "shared");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("n".repeat(32)),
      clock: () => 1_000,
    });
    const keys = ["r".repeat(32), "q".repeat(32), "s".repeat(32)];
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse(keys.shift()),
      clock: () => 1_000,
    });

    const response = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "a".repeat(32), sourcePath: fixture.sourceRoot },
        { projectKey: "b".repeat(32), sourcePath: nestedRoot },
      ],
    });

    expect(
      response.projects.map(({ state, targets }) => ({
        state,
        ids: targets.map((target) => String(target.id)),
      })),
    ).toEqual([
      { state: "ready", ids: ["n".repeat(32)] },
      { state: "ready", ids: ["n".repeat(32)] },
    ]);
    catalog.close();
  });

  test("keeps child-first shared candidates active across partial root snapshots", async () => {
    const fixture = await makeFixture();
    const nestedRoot = path.join(fixture.sourceRoot, "plugins", "shared");
    await fs.mkdir(fixture.sourceRoot, { recursive: true });
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({
        name: "parent",
        private: true,
        workspaces: ["plugins/*"],
      }),
    );
    await writePlugin(nestedRoot, "shared-partial");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("h".repeat(32)),
      clock: () => 1_000,
    });
    const keys = ["c".repeat(32), "p".repeat(32)];
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse(keys.shift()),
      clock: () => 1_000,
    });

    const response = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial" as const,
      projects: [
        { projectKey: "c".repeat(32), sourcePath: nestedRoot },
        { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });

    expect(
      response.projects.map(({ targets }) =>
        targets.map((target) => target.manifest.pluginId),
      ),
    ).toEqual([["shared-partial"], ["shared-partial"]]);
    expect(
      (await controller.list(context())).targets.map(
        (target) => target.manifest.pluginId,
      ),
    ).toEqual(["shared-partial"]);
    catalog.close();
  });

  test("refreshes a candidate shared by ready and partial roots only once", async () => {
    const fixture = await makeFixture();
    const childRoot = path.join(fixture.sourceRoot, "child");
    await fs.mkdir(fixture.sourceRoot, { recursive: true });
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({
        name: "parent",
        private: true,
        workspaces: ["child"],
      }),
    );
    await writePlugin(childRoot, "shared-once");
    const childManifest = JSON.parse(
      await fs.readFile(path.join(childRoot, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    childManifest.workspaces = 42;
    await fs.writeFile(
      path.join(childRoot, "package.json"),
      JSON.stringify(childManifest),
    );
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      clock: (() => {
        let value = 1_000;
        return () => (value += 1);
      })(),
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
    });
    const request = () => ({
      schemaVersion: 2 as const,
      inventoryState: "partial" as const,
      projects: [
        { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
        { projectKey: "c".repeat(32), sourcePath: childRoot },
      ],
    });

    for (let refresh = 0; refresh < 2; refresh += 1) {
      const response = await controller.admit(context(), request());
      const revisions = response.projects.map(
        ({ targets }) => targets[0]?.revision,
      );
      expect(revisions).toEqual([1, 1]);
      expect((await controller.list(context())).targets[0]?.revision).toBe(1);
    }
    catalog.close();
  });

  test("refreshes a candidate shared by overlapping partial roots only once", async () => {
    const fixture = await makeFixture();
    const childRoot = path.join(fixture.sourceRoot, "child");
    await fs.mkdir(fixture.sourceRoot, { recursive: true });
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({
        name: "parent",
        private: true,
        workspaces: ["child"],
      }),
    );
    await writePlugin(childRoot, "shared-partial-once");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      clock: (() => {
        let value = 1_000;
        return () => (value += 1);
      })(),
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      discoverCandidates: async (roots, options) => {
        const discovered = await discoverWorkspaceSourceCandidates(
          roots,
          options,
        );
        return {
          ...discovered,
          diagnostics: roots.map(({ rootKey }) => ({
            code: "test-partial-root",
            rootKey,
            displayPath: null,
            detail: "The project scan is incomplete.",
          })),
        };
      },
    });
    const request = () => ({
      schemaVersion: 2 as const,
      inventoryState: "partial" as const,
      projects: [
        { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
        { projectKey: "c".repeat(32), sourcePath: childRoot },
      ],
    });

    for (let refresh = 0; refresh < 2; refresh += 1) {
      const response = await controller.admit(context(), request());
      const expectedRevision = refresh + 1;
      expect(
        response.projects.map(({ targets }) => targets[0]?.revision),
      ).toEqual([expectedRevision, expectedRevision]);
      expect((await controller.list(context())).targets[0]?.revision).toBe(
        expectedRevision,
      );
    }
    catalog.close();
  });

  test("retires a removed target once across overlapping ready roots in a partial inventory", async () => {
    const fixture = await makeFixture();
    const parentRoot = path.join(fixture.sourceRoot, "repo");
    const childRoot = path.join(parentRoot, "child");
    const partialRoot = path.join(fixture.sourceRoot, "partial");
    await fs.mkdir(parentRoot, { recursive: true });
    await fs.writeFile(
      path.join(parentRoot, "package.json"),
      JSON.stringify({
        name: "parent",
        private: true,
        workspaces: ["child"],
      }),
    );
    await writePlugin(childRoot, "removed-overlap");
    await writePlugin(partialRoot, "retained-peer");
    const partialManifest = JSON.parse(
      await fs.readFile(path.join(partialRoot, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    partialManifest.workspaces = 42;
    await fs.writeFile(
      path.join(partialRoot, "package.json"),
      JSON.stringify(partialManifest),
    );
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      clock: (() => {
        let value = 1_000;
        return () => (value += 1);
      })(),
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
    });
    const request = () => ({
      schemaVersion: 2 as const,
      inventoryState: "partial" as const,
      projects: [
        { projectKey: "p".repeat(32), sourcePath: parentRoot },
        { projectKey: "c".repeat(32), sourcePath: childRoot },
        { projectKey: "u".repeat(32), sourcePath: partialRoot },
      ],
    });
    expect(
      (await controller.admit(context(), request())).projects
        .slice(0, 2)
        .map(({ targets }) => targets.map(({ manifest }) => manifest.pluginId)),
    ).toEqual([["removed-overlap"], ["removed-overlap"]]);

    await fs.rm(childRoot, { recursive: true });
    await fs.mkdir(childRoot);

    for (let refresh = 0; refresh < 2; refresh += 1) {
      const response = await controller.admit(context(), request());
      expect(response.state).toBe("partial");
      expect(
        response.projects.slice(0, 2).map(({ targets }) => targets),
      ).toEqual([[], []]);
      expect(
        (await controller.list(context())).targets.map(
          ({ manifest }) => manifest.pluginId,
        ),
      ).toEqual(["retained-peer"]);
    }
    catalog.close();
  });

  test("protects an omitted partial child scope from ready ancestor retirement", async () => {
    const fixture = await makeFixture();
    const parentRoot = path.join(fixture.sourceRoot, "repo");
    const childRoot = path.join(parentRoot, "child");
    await fs.mkdir(parentRoot, { recursive: true });
    await fs.writeFile(
      path.join(parentRoot, "package.json"),
      JSON.stringify({ name: "parent", private: true }),
    );
    await writePlugin(childRoot, "protected-child");
    const childManifest = JSON.parse(
      await fs.readFile(path.join(childRoot, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    childManifest.workspaces = 42;
    await fs.writeFile(
      path.join(childRoot, "package.json"),
      JSON.stringify(childManifest),
    );
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
    });

    const first = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial",
      projects: [{ projectKey: "c".repeat(32), sourcePath: childRoot }],
    });
    expect(first.projects[0]).toMatchObject({
      state: "partial",
      targets: [{ manifest: { pluginId: "protected-child" } }],
    });

    const omitted = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial",
      projects: [{ projectKey: "p".repeat(32), sourcePath: parentRoot }],
    });

    expect(omitted.projects[0]).toMatchObject({ state: "ready", targets: [] });
    expect(
      (await controller.list(context())).targets.map(
        ({ manifest }) => manifest.pluginId,
      ),
    ).toEqual(["protected-child"]);
    catalog.close();
  });

  test("reconciles a partial inventory against the root attested during admission", async () => {
    const fixture = await makeFixture();
    const firstContainer = path.join(fixture.sourceRoot, "first-container");
    const secondContainer = path.join(fixture.sourceRoot, "second-container");
    const firstProject = path.join(firstContainer, "project");
    const secondProject = path.join(secondContainer, "project");
    const selectedContainer = path.join(fixture.sourceRoot, "selected");
    const selectedProject = path.join(selectedContainer, "project");
    await writePlugin(firstProject, "attested-first");
    await writePlugin(secondProject, "unrelated-second");
    await fs.symlink(firstContainer, selectedContainer, "dir");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    const seed = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
    });
    await seed.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial",
      projects: [{ projectKey: "s".repeat(32), sourcePath: secondProject }],
    });
    let swapped = false;
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      admitRoots: async (inputs, options) => {
        const admission = await admitTrustedRoots(inputs, options);
        await fs.unlink(selectedContainer);
        await fs.symlink(secondContainer, selectedContainer, "dir");
        swapped = true;
        return admission;
      },
    });

    const response = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial",
      projects: [{ projectKey: "p".repeat(32), sourcePath: selectedProject }],
    });

    expect(swapped).toBe(true);
    expect(response.projects[0]).toMatchObject({
      state: "ready",
      targets: [{ manifest: { pluginId: "attested-first" } }],
    });
    expect(
      (await controller.list(context())).targets.map(
        ({ manifest }) => manifest.pluginId,
      ),
    ).toEqual(["unrelated-second", "attested-first"]);
    expect(JSON.stringify(response)).not.toContain(fixture.sourceRoot);
    catalog.close();
  });

  test("registers an authoritative scope before capacity fallback persists targets", async () => {
    const fixture = await makeFixture();
    const unrelatedRoot = path.join(fixture.sourceRoot, "unrelated");
    const ancestorRoot = path.join(fixture.sourceRoot, "ancestor");
    const projectRoot = path.join(ancestorRoot, "project");
    await fs.mkdir(unrelatedRoot, { recursive: true });
    await fs.writeFile(
      path.join(unrelatedRoot, "package.json"),
      JSON.stringify({
        name: "unrelated",
        private: true,
        workspaces: ["plugin-*"],
      }),
    );
    for (let index = 0; index < 120; index += 1) {
      await writePlugin(
        path.join(unrelatedRoot, `plugin-${index}`),
        `unrelated-${index}`,
      );
    }
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        name: "fallback-project",
        private: true,
        workspaces: ["plugin-*"],
      }),
    );
    for (let index = 0; index < 10; index += 1) {
      await writePlugin(
        path.join(projectRoot, `plugin-${index}`),
        `fallback-${index}`,
      );
    }
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
    });
    await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete",
      projects: [{ projectKey: "u".repeat(32), sourcePath: unrelatedRoot }],
    });

    const fallback = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial",
      projects: [{ projectKey: "f".repeat(32), sourcePath: projectRoot }],
    });
    expect(fallback).toMatchObject({ state: "partial" });
    expect(fallback.projects[0]?.targets).toHaveLength(8);

    await fs.rm(projectRoot, { recursive: true });
    await fs.mkdir(projectRoot);
    await fs.writeFile(
      path.join(ancestorRoot, "package.json"),
      JSON.stringify({ name: "ancestor", private: true }),
    );
    await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial",
      projects: [{ projectKey: "a".repeat(32), sourcePath: ancestorRoot }],
    });

    expect((await controller.list(context())).targets).toHaveLength(128);
    catalog.close();
  });

  test("registers a nested project first seen in a partial inventory", async () => {
    const fixture = await makeFixture();
    const childRoot = path.join(fixture.sourceRoot, "child");
    await writePlugin(childRoot, "omitted-child");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("o".repeat(32)),
      clock: (() => {
        let value = 1_000;
        return () => (value += 1);
      })(),
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
    });
    await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial" as const,
      projects: [{ projectKey: "c".repeat(32), sourcePath: childRoot }],
    });
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({ name: "parent", private: true }),
    );

    const partial = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial" as const,
      projects: [
        { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });

    expect(partial.projects).toMatchObject([{ state: "ready", targets: [] }]);
    expect(
      (await controller.list(context())).targets.map(
        (target) => target.manifest.pluginId,
      ),
    ).toEqual(["omitted-child"]);
    catalog.close();
  });

  test("preserves targets discovered only through an omitted ancestor project", async () => {
    const fixture = await makeFixture();
    const childRoot = path.join(fixture.sourceRoot, "child");
    const pluginRoot = path.join(childRoot, "plugins", "parent-only");
    await fs.mkdir(childRoot, { recursive: true });
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({
        name: "parent",
        private: true,
        workspaces: ["child/plugins/*"],
      }),
    );
    await fs.writeFile(
      path.join(childRoot, "package.json"),
      JSON.stringify({ name: "child", private: true }),
    );
    await writePlugin(pluginRoot, "parent-only");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("a".repeat(32)),
      clock: (() => {
        let value = 1_000;
        return () => (value += 1);
      })(),
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
    });

    const initial = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete",
      projects: [
        { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
        { projectKey: "c".repeat(32), sourcePath: childRoot },
      ],
    });
    expect(
      initial.projects.map(({ targets }) =>
        targets.map((target) => target.manifest.pluginId),
      ),
    ).toEqual([["parent-only"], []]);

    const partial = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "partial",
      projects: [{ projectKey: "c".repeat(32), sourcePath: childRoot }],
    });

    expect(partial.projects).toMatchObject([{ state: "ready", targets: [] }]);
    expect(
      (await controller.list(context())).targets.map(
        (target) => target.manifest.pluginId,
      ),
    ).toEqual(["parent-only"]);
    catalog.close();
  });

  test("bounds duplicate-root fan-out by total serialized target entries", async () => {
    const fixture = await makeFixture();
    const workspaces = Array.from({ length: 65 }, (_, index) =>
      path.join("plugins", `plugin-${index}`),
    );
    await fs.mkdir(fixture.sourceRoot, { recursive: true });
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({ name: "fixture", private: true, workspaces }),
    );
    await Promise.all(
      workspaces.map((workspace, index) =>
        writePlugin(
          path.join(fixture.sourceRoot, workspace),
          `plugin-${index}`,
        ),
      ),
    );
    let objectIndex = 0;
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () =>
        ObjectIdSchema.parse((objectIndex++).toString(36).padStart(32, "0")),
      clock: () => 1_000,
    });
    const rootKeys = ["r".repeat(32), "q".repeat(32)];
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse(rootKeys.shift()),
      clock: () => 1_000,
    });

    const response = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "a".repeat(32), sourcePath: fixture.sourceRoot },
        { projectKey: "b".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });

    expect(response.state).toBe("partial");
    expect(
      response.projects.reduce(
        (count, project) => count + project.targets.length,
        0,
      ),
    ).toBe(TARGET_LIST_MAX_TARGETS);
    expect(response.projects.map(({ state }) => state)).toEqual([
      "ready",
      "partial",
    ]);
    expect(response.projects[0]?.targets).toHaveLength(65);
    expect(response.projects[1]?.targets).toHaveLength(63);
    catalog.close();
  });

  test("reports bounded discovery diagnostics without leaking them or skipping valid candidates", async () => {
    const fixture = await makeFixture();
    await writePlugin(fixture.sourceRoot, "valid");
    const manifestPath = path.join(fixture.sourceRoot, "package.json");
    const manifest = JSON.parse(
      await fs.readFile(manifestPath, "utf8"),
    ) as Record<string, unknown>;
    manifest.workspaces = 42;
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
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
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "v".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });

    expect(response).toMatchObject({ state: "partial" });
    expect(
      response.projects[0]?.targets.map((target) => target.manifest.pluginId),
    ).toEqual(["valid"]);
    expect(Object.keys(response).sort()).toEqual([
      "projects",
      "schemaVersion",
      "state",
    ]);
    expect(JSON.stringify(response)).not.toContain("broken");
    expect(JSON.stringify(response)).not.toContain(fixture.sourceRoot);
    catalog.close();
  });

  test("keeps one project's discovery failure isolated from its peers", async () => {
    const fixture = await makeFixture();
    const partialRoot = path.join(fixture.sourceRoot, "partial");
    const readyRoot = path.join(fixture.sourceRoot, "ready");
    await writePlugin(partialRoot, "partial-plugin");
    await writePlugin(readyRoot, "ready-plugin");
    const partialManifestPath = path.join(partialRoot, "package.json");
    const partialManifest = JSON.parse(
      await fs.readFile(partialManifestPath, "utf8"),
    ) as Record<string, unknown>;
    partialManifest.workspaces = { packages: "not-an-array" };
    await fs.writeFile(partialManifestPath, JSON.stringify(partialManifest));
    const ids = ["a".repeat(32), "b".repeat(32)];
    const keys = ["r".repeat(32), "q".repeat(32)];
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse(ids.shift()),
      clock: () => 1_000,
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse(keys.shift()),
      clock: () => 1_000,
    });

    const response = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "p".repeat(32), sourcePath: partialRoot },
        { projectKey: "v".repeat(32), sourcePath: readyRoot },
      ],
    });

    expect(response.state).toBe("partial");
    expect(
      response.projects.map(({ state, targets }) => ({
        state,
        plugins: targets.map((target) => target.manifest.pluginId),
      })),
    ).toEqual([
      { state: "partial", plugins: ["partial-plugin"] },
      { state: "ready", plugins: ["ready-plugin"] },
    ]);
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
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        {
          projectKey: "m".repeat(32),
          sourcePath: path.join(fixture.sourceRoot, "missing"),
        },
      ],
    });

    expect(response).toEqual({
      schemaVersion: 2,
      state: "partial",
      projects: [{ projectKey: "m".repeat(32), state: "partial", targets: [] }],
    });
    expect((await controller.list(context())).targets).toEqual([]);
    expect(JSON.stringify(response)).not.toContain("missing");
    catalog.close();
  });

  test("makes the batch partial without assigning a rootless diagnostic to a project", async () => {
    const fixture = await makeFixture();
    await writePlugin(fixture.sourceRoot, "unreached");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    const seed = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("r".repeat(32)),
    });
    await seed.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "s".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => "invalid" as OpaqueId,
    });

    const response = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "x".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });

    expect(response).toEqual({
      schemaVersion: 2,
      state: "partial",
      projects: [{ projectKey: "x".repeat(32), state: "ready", targets: [] }],
    });
    expect(
      (await controller.list(context())).targets.map(
        (target) => target.manifest.pluginId,
      ),
    ).toEqual(["unreached"]);
    catalog.close();
  });

  test("keeps successful refreshes when a later candidate fails", async () => {
    const fixture = await makeFixture();
    await writePlugin(path.join(fixture.sourceRoot, "a-first"), "first");
    await writePlugin(path.join(fixture.sourceRoot, "b-failing"), "failing");
    await writePlugin(path.join(fixture.sourceRoot, "c-last"), "last");
    await fs.writeFile(
      path.join(fixture.sourceRoot, "package.json"),
      JSON.stringify({
        name: "refresh-failure-workspace",
        private: true,
        workspaces: ["*"],
      }),
    );
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
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });

    expect(response.state).toBe("partial");
    expect(
      response.projects[0]?.targets.map((target) => target.manifest.pluginId),
    ).toEqual(["first", "last"]);
    expect(
      (await controller.list(context())).targets.map(
        (target) => target.manifest.pluginId,
      ),
    ).toEqual(["first", "last"]);
    catalog.close();
  });

  test("does not mutate the catalog after a batch is aborted", async () => {
    const fixture = await makeFixture();
    await writePlugin(fixture.sourceRoot, "cancelled");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("c".repeat(32)),
      clock: () => 1_000,
    });
    const cancellation = new AbortController();
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("r".repeat(32)),
      clock: () => 1_000,
      discoverCandidates: async (roots, options) => {
        const result = await discoverWorkspaceSourceCandidates(roots, options);
        cancellation.abort();
        return result;
      },
    });

    await expect(
      controller.admit(
        context(),
        {
          schemaVersion: 2,
          inventoryState: "complete" as const,
          projects: [
            { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
          ],
        },
        cancellation.signal,
      ),
    ).rejects.toHaveProperty("name", "AbortError");
    expect((await controller.list(context())).targets).toEqual([]);

    const retry = await controller.admit(context(), {
      schemaVersion: 2,
      inventoryState: "complete" as const,
      projects: [
        { projectKey: "r".repeat(32), sourcePath: fixture.sourceRoot },
      ],
    });
    expect(retry.projects[0]?.targets).toMatchObject([
      { revision: 1, manifest: { pluginId: "cancelled" } },
    ]);
    catalog.close();
  });

  test("settles an aborted batch when discovery never resolves", async () => {
    const fixture = await makeFixture();
    await writePlugin(fixture.sourceRoot, "stalled");
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    const cancellation = new AbortController();
    let markDiscoveryStarted: (() => void) | undefined;
    const discoveryStarted = new Promise<void>((resolve) => {
      markDiscoveryStarted = resolve;
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("r".repeat(32)),
      discoverCandidates: () => {
        markDiscoveryStarted?.();
        return new Promise(() => {});
      },
    });

    const admission = controller.admit(
      context(),
      {
        schemaVersion: 2,
        inventoryState: "complete" as const,
        projects: [
          { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
        ],
      },
      cancellation.signal,
    );
    await discoveryStarted;
    cancellation.abort();

    await expect(admission).rejects.toHaveProperty("name", "AbortError");
    expect((await controller.list(context())).targets).toEqual([]);
    catalog.close();
  });

  test("observes a late discovery rejection after cancellation", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    const cancellation = new AbortController();
    let markDiscoveryStarted: (() => void) | undefined;
    let rejectDiscovery: ((reason?: unknown) => void) | undefined;
    const discoveryStarted = new Promise<void>((resolve) => {
      markDiscoveryStarted = resolve;
    });
    const controller = createRuntimeTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: () => OpaqueIdSchema.parse("r".repeat(32)),
      discoverCandidates: () => {
        markDiscoveryStarted?.();
        return new Promise((_resolve, reject) => {
          rejectDiscovery = reject;
        });
      },
    });
    const admission = controller.admit(
      context(),
      {
        schemaVersion: 2,
        inventoryState: "complete" as const,
        projects: [
          { projectKey: "p".repeat(32), sourcePath: fixture.sourceRoot },
        ],
      },
      cancellation.signal,
    );
    await discoveryStarted;
    cancellation.abort();
    await expect(admission).rejects.toHaveProperty("name", "AbortError");

    rejectDiscovery?.(new Error("late discovery failure"));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect((await controller.list(context())).targets).toEqual([]);
    catalog.close();
  });
});
