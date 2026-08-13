import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { createRequestContext } from "./auth/context.ts";
import { BbContextIdSchema, PrincipalIdSchema } from "./contracts/ids.ts";
import type { DevelopmentTargetCatalog } from "./discovery/catalog.ts";
import { createProjectTargetController } from "./project-target-controller.ts";

const temporaryRoots: string[] = [];
const principalId = PrincipalIdSchema.parse("p".repeat(32));
const bbContextId = BbContextIdSchema.parse("b".repeat(32));

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("project target controller catalog authorization", () => {
  test("propagates a failed first authorization check without writing", async () => {
    const parent = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "studio-controller-race-"),
    );
    temporaryRoots.push(parent);
    const projectRoot = path.join(parent, "project");
    await fs.mkdir(projectRoot);

    let mutations = 0;
    const catalog = catalogFixture(() => {
      mutations += 1;
    });
    const controller = createController(catalog, async () => {
      throw new SourceAuthorizationChanged();
    });

    await expect(
      controller.admit(context(), {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [{ projectKey: "project", sourcePath: projectRoot }],
      }),
    ).rejects.toBeInstanceOf(SourceAuthorizationChanged);
    expect(mutations).toBe(0);
  });

  test("revalidates authorization before every partial-inventory mutation", async () => {
    const parent = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "studio-controller-race-"),
    );
    temporaryRoots.push(parent);
    const firstRoot = path.join(parent, "first");
    const secondRoot = path.join(parent, "second");
    await Promise.all([fs.mkdir(firstRoot), fs.mkdir(secondRoot)]);

    let authorized = true;
    const mutations: string[] = [];
    const catalog: DevelopmentTargetCatalog = {
      async registerProjectScopes() {
        mutations.push("register-scopes");
      },
      async refreshCompleteSnapshot({ authoritativeSourceRoots }) {
        mutations.push(authoritativeSourceRoots?.[0] ?? "complete");
        authorized = false;
        return [];
      },
      async refresh() {
        throw new Error("unexpected candidate refresh");
      },
      async reconcileNative() {
        throw new Error("unexpected native reconciliation");
      },
      list: () => [],
      get: () => undefined,
      resolvePrivate: () => undefined,
      resolvePrivateHostObservation: () => undefined,
      close() {},
    };
    const controller = createProjectTargetController({
      catalog,
      principalId,
      bbContextId,
      createRootKey: (() => {
        let key = 0;
        return () => String(++key).padStart(32, "0") as never;
      })(),
      discoverCandidates: async () => ({ candidates: [], diagnostics: [] }),
      beforeCatalogMutation: async () => {
        if (!authorized) throw new Error("source authorization changed");
      },
    });
    const context = createRequestContext({
      id: principalId,
      kind: "plugin-adapter",
      scopes: ["targets:read", "targets:write"],
      revoked: false,
      bbContextId,
    });

    await expect(
      controller.admit(context, {
        schemaVersion: 2,
        inventoryState: "partial",
        projects: [
          { projectKey: "first", sourcePath: firstRoot },
          { projectKey: "second", sourcePath: secondRoot },
        ],
      }),
    ).rejects.toThrow("source authorization changed");

    expect(mutations).toHaveLength(1);
  });
});

class SourceAuthorizationChanged extends Error {}

function context() {
  return createRequestContext({
    id: principalId,
    kind: "plugin-adapter",
    scopes: ["targets:read", "targets:write"],
    revoked: false,
    bbContextId,
  });
}

function catalogFixture(onMutation: () => void): DevelopmentTargetCatalog {
  return {
    async registerProjectScopes() {
      onMutation();
    },
    async refreshCompleteSnapshot() {
      onMutation();
      return [];
    },
    async refresh() {
      throw new Error("unexpected candidate refresh");
    },
    async reconcileNative() {
      throw new Error("unexpected native reconciliation");
    },
    list: () => [],
    get: () => undefined,
    resolvePrivate: () => undefined,
    resolvePrivateHostObservation: () => undefined,
    close() {},
  };
}

function createController(
  catalog: DevelopmentTargetCatalog,
  beforeCatalogMutation: () => Promise<void>,
) {
  return createProjectTargetController({
    catalog,
    principalId,
    bbContextId,
    createRootKey: (() => {
      let key = 0;
      return () => String(++key).padStart(32, "0") as never;
    })(),
    discoverCandidates: async () => ({ candidates: [], diagnostics: [] }),
    beforeCatalogMutation,
  });
}
