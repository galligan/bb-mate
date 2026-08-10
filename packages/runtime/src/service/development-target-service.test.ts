import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { createRequestContext } from "../auth/context.ts";
import {
  BbContextIdSchema,
  ObjectIdSchema,
  OpaqueIdSchema,
  PrincipalIdSchema,
  TargetIdSchema,
} from "../contracts/ids.ts";
import { ObjectCodecRegistry } from "../contracts/objects.ts";
import { openDevelopmentTargetCatalog } from "../discovery/catalog.ts";
import { DevelopmentTargetCodec } from "../discovery/development-target.ts";
import { issueTrustedDevelopmentTargetCandidate } from "../discovery/trusted-candidate.ts";
import { RuntimeError } from "../errors.ts";
import { openRuntimeStore } from "../persistence/store.ts";
import { createWorkbenchService } from "./workbench-service.ts";
import { createDevelopmentTargetService } from "./development-target-service.ts";

const temporaryRoots: string[] = [];
const objectId = ObjectIdSchema.parse("t".repeat(32));
const targetId = TargetIdSchema.parse("t".repeat(32));
const principalId = PrincipalIdSchema.parse("p".repeat(32));
const bbContextId = BbContextIdSchema.parse("b".repeat(32));

async function makeFixture() {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryRoot, "bb-mate-development-target-"),
  );
  temporaryRoots.push(parent);
  const pluginRoot = path.join(parent, "plugin");
  await fs.mkdir(pluginRoot);
  return {
    dataRoot: path.join(parent, "data"),
    pluginRoot: await fs.realpath(pluginRoot),
  };
}

function context() {
  return createRequestContext({
    id: principalId,
    kind: "supervisor",
    scopes: ["targets:read", "targets:write"],
    revoked: false,
    bbContextId,
  });
}

function candidateInput(canonicalRoot: string) {
  return {
    rootKey: OpaqueIdSchema.parse("r".repeat(32)),
    rootKind: "current-project" as const,
    canonicalRoot,
    target: {
      displayName: "Notes",
      displayPath: "plugins/notes",
      sourceKind: "workspace-discovered" as const,
      manifest: {
        pluginId: "notes",
        packageName: "bb-plugin-notes",
        version: "1.2.3",
        hasServer: true,
        hasApp: true,
      },
      native: { status: "absent" as const, observedAt: 1_000 },
      capabilities: { fixture: true, harness: false, live: false },
    },
  };
}

async function candidate(canonicalRoot: string) {
  return issueTrustedDevelopmentTargetCandidate(candidateInput(canonicalRoot));
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("DevelopmentTargetService", () => {
  test("persists and reopens one self-bound target while keeping its root private", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    const service = createDevelopmentTargetService(catalog);

    const created = await service.refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    expect(created.id).toBe(targetId);
    expect(created.revision).toBe(1);
    expect(service.listTargets(context())).toEqual([created]);
    expect(
      catalog.resolvePrivate({
        principalId,
        bbContextId,
        id: ObjectIdSchema.parse(created.id),
      }),
    ).toEqual({
      canonicalRoot: fixture.pluginRoot,
      rootKey: "r".repeat(32),
      rootKind: "current-project",
    });
    expect(JSON.stringify(created)).not.toContain(fixture.pluginRoot);
    expect(JSON.stringify(created)).not.toContain("r".repeat(32));
    expect(JSON.stringify(created)).not.toContain(principalId);
    expect(JSON.stringify(created)).not.toContain(bbContextId);
    catalog.close();

    const reopened = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("u".repeat(32)),
      clock: () => 2_000,
    });
    try {
      const refreshed = await createDevelopmentTargetService(
        reopened,
      ).refreshFromTrustedCandidate(
        context(),
        await candidate(fixture.pluginRoot),
      );
      expect(refreshed.id).toBe(targetId);
      expect(refreshed.revision).toBe(2);
      expect(refreshed.updatedAt).toBe(2_000);
    } finally {
      reopened.close();
    }
  });

  test("default-denies unscoped and target-bound credentials and does not enumerate across subjects", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      const created = await service.refreshFromTrustedCandidate(
        context(),
        await candidate(fixture.pluginRoot),
      );
      expect(service.getTarget(context(), created.id)).toEqual(created);

      const unscoped = createRequestContext({
        id: principalId,
        kind: "mcp-client",
        scopes: [],
        revoked: false,
        bbContextId,
      });
      expect(() => service.listTargets(unscoped)).toThrow(
        new RuntimeError("forbidden"),
      );

      const targetBound = createRequestContext({
        id: principalId,
        kind: "plugin-adapter",
        scopes: ["targets:read"],
        revoked: false,
        bbContextId,
        targetId: TargetIdSchema.parse(objectId),
      });
      expect(() => service.listTargets(targetBound)).toThrow(
        new RuntimeError("forbidden"),
      );

      const revoked = createRequestContext({
        id: principalId,
        kind: "browser-session",
        scopes: ["targets:read"],
        revoked: true,
        bbContextId,
      });
      expect(() => service.listTargets(revoked)).toThrow(
        new RuntimeError("unauthenticated"),
      );

      const otherSubject = createRequestContext({
        id: PrincipalIdSchema.parse("q".repeat(32)),
        kind: "supervisor",
        scopes: ["targets:read"],
        revoked: false,
        bbContextId,
      });
      expect(service.listTargets(otherSubject)).toEqual([]);
      expect(() => service.getTarget(otherSubject, created.id)).toThrow(
        new RuntimeError("not_found"),
      );
    } finally {
      catalog.close();
    }
  });

  test("rejects raw path DTOs and cloned capabilities before catalog mutation", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      const issued = await candidate(fixture.pluginRoot);
      for (const forged of [
        candidateInput(fixture.pluginRoot),
        { ...issued },
        Object.create(issued) as unknown,
        Object.fromEntries(Object.entries(issued)),
      ]) {
        await expect(
          service.refreshFromTrustedCandidate(context(), forged as never),
        ).rejects.toMatchObject({ code: "invalid_request" });
      }
      await fs.rm(fixture.pluginRoot, { recursive: true });
      await expect(
        service.refreshFromTrustedCandidate(context(), issued),
      ).rejects.toMatchObject({ code: "invalid_request" });
      expect(service.listTargets(context())).toEqual([]);
    } finally {
      catalog.close();
    }
  });

  test("uses optimistic revisions when refreshing a known source root", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      await service.refreshFromTrustedCandidate(
        context(),
        await candidate(fixture.pluginRoot),
      );
      const refreshed = await service.refreshFromTrustedCandidate(
        context(),
        await issueTrustedDevelopmentTargetCandidate({
          ...candidateInput(fixture.pluginRoot),
          target: {
            ...candidateInput(fixture.pluginRoot).target,
            displayName: "Notes refreshed",
          },
        }),
        { expectedRevision: 1 },
      );
      expect(refreshed.revision).toBe(2);
      await expect(
        service.refreshFromTrustedCandidate(
          context(),
          await candidate(fixture.pluginRoot),
          { expectedRevision: 1 },
        ),
      ).rejects.toEqual(new RuntimeError("conflict"));
      expect(service.getTarget(context(), objectId)).toEqual(refreshed);
    } finally {
      catalog.close();
    }
  });

  test("rolls back public, private, and event writes atomically", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    const database = new Database(
      path.join(fixture.dataRoot, "workbench.sqlite3"),
    );
    try {
      database.exec(`
        CREATE TRIGGER test_fail_target_event
        BEFORE INSERT ON runtime_events
        BEGIN
          SELECT RAISE(ABORT, 'injected failure');
        END
      `);
      await expect(
        createDevelopmentTargetService(catalog).refreshFromTrustedCandidate(
          context(),
          await candidate(fixture.pluginRoot),
        ),
      ).rejects.toMatchObject({ code: "internal" });
      expect(catalog.list({ principalId, bbContextId })).toEqual([]);
      expect(database.query("SELECT * FROM runtime_objects").all()).toEqual([]);
      expect(
        database.query("SELECT * FROM development_target_sources").all(),
      ).toEqual([]);
      expect(database.query("SELECT * FROM runtime_events").all()).toEqual([]);
      database.exec("DROP TRIGGER test_fail_target_event");
    } finally {
      database.close();
      catalog.close();
    }
  });

  test("stores the canonical root privately and emits only a redacted event", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    await createDevelopmentTargetService(catalog).refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    catalog.close();

    const database = new Database(
      path.join(fixture.dataRoot, "workbench.sqlite3"),
      { readonly: true },
    );
    try {
      const publicRow = database
        .query<{ payload_json: string }, []>(
          "SELECT payload_json FROM runtime_objects",
        )
        .get()!;
      const privateRow = database
        .query<
          { canonical_root: string; root_key: string; root_kind: string },
          []
        >(
          "SELECT canonical_root, root_key, root_kind FROM development_target_sources",
        )
        .get()!;
      const eventRow = database.query("SELECT * FROM runtime_events").get()!;

      expect(privateRow).toEqual({
        canonical_root: fixture.pluginRoot,
        root_key: "r".repeat(32),
        root_kind: "current-project",
      });
      expect(publicRow.payload_json).not.toContain(fixture.pluginRoot);
      expect(publicRow.payload_json).not.toContain("r".repeat(32));
      expect(JSON.stringify(eventRow)).not.toContain(fixture.pluginRoot);
      expect(JSON.stringify(eventRow)).not.toContain("r".repeat(32));
    } finally {
      database.close();
    }
  });

  test("fails closed without repairing a target whose private source row is missing", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    await createDevelopmentTargetService(catalog).refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    catalog.close();

    const databasePath = path.join(fixture.dataRoot, "workbench.sqlite3");
    const tamper = new Database(databasePath);
    tamper.exec("DELETE FROM development_target_sources");
    tamper.close();

    await expect(
      openDevelopmentTargetCatalog({
        dataRoot: fixture.dataRoot,
        id: () => ObjectIdSchema.parse("u".repeat(32)),
        clock: () => 2_000,
      }),
    ).rejects.toMatchObject({ code: "corrupt_data" });

    const inspect = new Database(databasePath, { readonly: true });
    try {
      expect(
        inspect.query("SELECT COUNT(*) AS count FROM runtime_objects").get(),
      ).toEqual({ count: 1 });
      expect(
        inspect
          .query("SELECT COUNT(*) AS count FROM development_target_sources")
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      inspect.close();
    }
  });

  test("leaves the generic object service target-bound", async () => {
    const fixture = await makeFixture();
    const store = await openRuntimeStore({
      dataRoot: fixture.dataRoot,
      codecs: new ObjectCodecRegistry([DevelopmentTargetCodec]),
      id: () => objectId,
      clock: () => 1_000,
    });
    try {
      const targetBound = createRequestContext({
        id: principalId,
        kind: "plugin-adapter",
        scopes: ["targets:read", "targets:write"],
        revoked: false,
        bbContextId,
        targetId: TargetIdSchema.parse("z".repeat(32)),
      });
      expect(() =>
        createWorkbenchService(store).createObject(targetBound, {
          kind: "development-target",
          payload: candidateInput(fixture.pluginRoot).target,
        }),
      ).toThrow(new RuntimeError("invalid_request"));
      expect(() =>
        createWorkbenchService(store).getObject(targetBound, {
          id: objectId,
          kind: "development-target",
        }),
      ).toThrow(new RuntimeError("invalid_request"));
      expect(() =>
        createWorkbenchService(store).updateObject(targetBound, {
          id: objectId,
          kind: "development-target",
          expectedRevision: 1,
          payload: candidateInput(fixture.pluginRoot).target,
        }),
      ).toThrow(new RuntimeError("invalid_request"));
    } finally {
      store.close();
    }
  });
});
