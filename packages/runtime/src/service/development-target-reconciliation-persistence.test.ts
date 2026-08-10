import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as path from "node:path";

import { ObjectIdSchema, OpaqueIdSchema } from "../contracts/ids.ts";
import { openDevelopmentTargetCatalog } from "../discovery/catalog.ts";
import {
  bbContextId,
  candidate,
  cleanupDevelopmentTargetReconciliationFixtures,
  context,
  issueNativeInventory,
  makeFixture,
  objectId,
  principalId,
} from "./development-target-reconciliation-fixture.ts";
import { createDevelopmentTargetService } from "./development-target-service.ts";

afterEach(cleanupDevelopmentTargetReconciliationFixtures);

describe("DevelopmentTargetService native reconciliation persistence", () => {
  test("rejects a future-dated observation without corrupting persisted state", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 2_000,
    });
    const service = createDevelopmentTargetService(catalog);
    const created = await service.refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );

    await expect(
      service.reconcileFromTrustedInventory(context(), {
        targetId: created.id,
        sourceCandidate: await candidate(fixture.pluginRoot),
        inventory: await issueNativeInventory(fixture.pluginRoot, {
          observedAt: 2_001,
        }),
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(service.getTarget(context(), created.id)).toEqual(created);
    expect(
      catalog.resolvePrivateHostObservation({
        principalId,
        bbContextId,
        id: objectId,
      }),
    ).toBeUndefined();
    catalog.close();

    const reopened = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    try {
      expect(
        createDevelopmentTargetService(reopened).getTarget(
          context(),
          created.id,
        ),
      ).toEqual(created);
    } finally {
      reopened.close();
    }
  });

  test("rejects equal and older observations without regressing persisted state", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 3_000,
    });
    const service = createDevelopmentTargetService(catalog);
    const created = await service.refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    const accepted = await service.reconcileFromTrustedInventory(context(), {
      targetId: created.id,
      sourceCandidate: await candidate(fixture.pluginRoot),
      inventory: await issueNativeInventory(fixture.pluginRoot, {
        observedAt: 2_500,
        runtimeInstanceId: OpaqueIdSchema.parse("j".repeat(32)),
        hostname: "newer.local",
      }),
      expectedRevision: 1,
    });
    const acceptedHost = {
      runtimeInstanceId: OpaqueIdSchema.parse("j".repeat(32)),
      hostname: "newer.local",
      observedAt: 2_500,
    };
    const database = new Database(
      path.join(fixture.dataRoot, "workbench.sqlite3"),
    );
    const events = database
      .query("SELECT * FROM runtime_events ORDER BY sequence")
      .all();

    try {
      for (const observedAt of [2_500, 1_500]) {
        await expect(
          service.reconcileFromTrustedInventory(context(), {
            targetId: created.id,
            sourceCandidate: await candidate(fixture.pluginRoot),
            inventory: await issueNativeInventory(fixture.pluginRoot, {
              observedAt,
              runtimeInstanceId: OpaqueIdSchema.parse("k".repeat(32)),
              hostname: "replayed.local",
            }),
            expectedRevision: 2,
          }),
        ).rejects.toMatchObject({ code: "invalid_request" });
        expect(service.getTarget(context(), created.id)).toEqual(accepted);
        expect(
          catalog.resolvePrivateHostObservation({
            principalId,
            bbContextId,
            id: objectId,
          }),
        ).toEqual(acceptedHost);
        expect(
          database
            .query("SELECT * FROM runtime_events ORDER BY sequence")
            .all(),
        ).toEqual(events);
      }
    } finally {
      database.close();
      catalog.close();
    }

    const reopened = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    try {
      expect(
        createDevelopmentTargetService(reopened).getTarget(
          context(),
          created.id,
        ),
      ).toEqual(accepted);
      expect(
        reopened.resolvePrivateHostObservation({
          principalId,
          bbContextId,
          id: objectId,
        }),
      ).toEqual(acceptedHost);
    } finally {
      reopened.close();
    }
  });

  test("rolls back the public target, private host row, and redacted event on either private or event failure", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 2_000,
    });
    const service = createDevelopmentTargetService(catalog);
    const created = await service.refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    const database = new Database(
      path.join(fixture.dataRoot, "workbench.sqlite3"),
    );
    const reconcile = async () =>
      service.reconcileFromTrustedInventory(context(), {
        targetId: created.id,
        sourceCandidate: await candidate(fixture.pluginRoot),
        inventory: await issueNativeInventory(fixture.pluginRoot),
        expectedRevision: 1,
      });
    try {
      database.exec(`
        CREATE TRIGGER test_fail_private_host
        BEFORE INSERT ON development_target_host_observations
        BEGIN
          SELECT RAISE(ABORT, 'injected private host failure');
        END
      `);
      await expect(reconcile()).rejects.toMatchObject({ code: "internal" });
      database.exec("DROP TRIGGER test_fail_private_host");
      expect(service.getTarget(context(), created.id)).toEqual(created);
      expect(
        database
          .query(
            "SELECT COUNT(*) AS count FROM development_target_host_observations",
          )
          .get(),
      ).toEqual({ count: 0 });
      expect(
        database
          .query("SELECT event_type FROM runtime_events ORDER BY sequence")
          .all(),
      ).toEqual([{ event_type: "object.created" }]);

      database.exec(`
        CREATE TRIGGER test_fail_native_event
        BEFORE INSERT ON runtime_events
        WHEN NEW.event_type = 'target.native-reconciled'
        BEGIN
          SELECT RAISE(ABORT, 'injected native event failure');
        END
      `);
      await expect(reconcile()).rejects.toMatchObject({ code: "internal" });
      database.exec("DROP TRIGGER test_fail_native_event");
      expect(service.getTarget(context(), created.id)).toEqual(created);
      expect(
        database
          .query(
            "SELECT COUNT(*) AS count FROM development_target_host_observations",
          )
          .get(),
      ).toEqual({ count: 0 });
      expect(
        database
          .query("SELECT event_type FROM runtime_events ORDER BY sequence")
          .all(),
      ).toEqual([{ event_type: "object.created" }]);
    } finally {
      database.close();
      catalog.close();
    }
  });

  test("reopens and reconciles again without changing the server-issued target id", async () => {
    const fixture = await makeFixture();
    let now = 2_000;
    const first = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => now,
    });
    const firstService = createDevelopmentTargetService(first);
    const created = await firstService.refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    const reconciled = await firstService.reconcileFromTrustedInventory(
      context(),
      {
        targetId: created.id,
        sourceCandidate: await candidate(fixture.pluginRoot),
        inventory: await issueNativeInventory(fixture.pluginRoot),
        expectedRevision: 1,
      },
    );
    first.close();

    now = 3_000;
    const reopened = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("u".repeat(32)),
      clock: () => now,
    });
    try {
      const service = createDevelopmentTargetService(reopened);
      expect(service.getTarget(context(), created.id)).toEqual(reconciled);
      const refreshed = await service.reconcileFromTrustedInventory(context(), {
        targetId: created.id,
        sourceCandidate: await candidate(fixture.pluginRoot),
        inventory: await issueNativeInventory(fixture.pluginRoot, {
          observedAt: 2_500,
          runtimeInstanceId: OpaqueIdSchema.parse("j".repeat(32)),
          hostname: "second.local",
        }),
        expectedRevision: 2,
      });
      expect(refreshed).toMatchObject({
        id: created.id,
        revision: 3,
        updatedAt: 3_000,
        native: { status: "exact-path", observedAt: 2_500 },
      });
      expect(
        reopened.resolvePrivateHostObservation({
          principalId,
          bbContextId,
          id: objectId,
        }),
      ).toEqual({
        runtimeInstanceId: OpaqueIdSchema.parse("j".repeat(32)),
        hostname: "second.local",
        observedAt: 2_500,
      });
    } finally {
      reopened.close();
    }
  });

  test("preserves the attested native observation across a later source refresh", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 2_000,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      const created = await service.refreshFromTrustedCandidate(
        context(),
        await candidate(fixture.pluginRoot),
      );
      const reconciled = await service.reconcileFromTrustedInventory(
        context(),
        {
          targetId: created.id,
          sourceCandidate: await candidate(fixture.pluginRoot),
          inventory: await issueNativeInventory(fixture.pluginRoot),
          expectedRevision: 1,
        },
      );
      const refreshed = await service.refreshFromTrustedCandidate(
        context(),
        await candidate(fixture.pluginRoot),
        { expectedRevision: 2 },
      );
      expect(refreshed).toMatchObject({
        id: created.id,
        revision: 3,
        native: reconciled.native,
      });
      expect(service.getTarget(context(), created.id)).toEqual(refreshed);
      expect(
        catalog.resolvePrivateHostObservation({
          principalId,
          bbContextId,
          id: objectId,
        })?.observedAt,
      ).toBe(refreshed.native.observedAt);
    } finally {
      catalog.close();
    }
  });

  test("fails closed without repairing corrupt private host evidence", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 2_000,
    });
    const service = createDevelopmentTargetService(catalog);
    const created = await service.refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    await service.reconcileFromTrustedInventory(context(), {
      targetId: created.id,
      sourceCandidate: await candidate(fixture.pluginRoot),
      inventory: await issueNativeInventory(fixture.pluginRoot),
      expectedRevision: 1,
    });
    catalog.close();

    const databasePath = path.join(fixture.dataRoot, "workbench.sqlite3");
    const tamper = new Database(databasePath);
    tamper.exec("PRAGMA ignore_check_constraints = ON");
    tamper
      .query("UPDATE development_target_host_observations SET hostname = ?")
      .run("https://mate.local:8080");
    tamper.close();

    await expect(
      openDevelopmentTargetCatalog({ dataRoot: fixture.dataRoot }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    const inspect = new Database(databasePath, { readonly: true });
    try {
      expect(
        inspect
          .query<{ hostname: string }, []>(
            "SELECT hostname FROM development_target_host_observations",
          )
          .get(),
      ).toEqual({ hostname: "https://mate.local:8080" });
    } finally {
      inspect.close();
    }
  });

  test("rejects a valid-looking private timestamp that diverges from the canonical public native observation", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 2_000,
    });
    const service = createDevelopmentTargetService(catalog);
    const created = await service.refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    await service.reconcileFromTrustedInventory(context(), {
      targetId: created.id,
      sourceCandidate: await candidate(fixture.pluginRoot),
      inventory: await issueNativeInventory(fixture.pluginRoot),
      expectedRevision: 1,
    });
    catalog.close();

    const databasePath = path.join(fixture.dataRoot, "workbench.sqlite3");
    const tamper = new Database(databasePath);
    tamper.exec(
      "UPDATE development_target_host_observations SET observed_at = 1400",
    );
    tamper.close();

    await expect(
      openDevelopmentTargetCatalog({ dataRoot: fixture.dataRoot }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    const inspect = new Database(databasePath, { readonly: true });
    try {
      expect(
        inspect
          .query<{ observed_at: number }, []>(
            "SELECT observed_at FROM development_target_host_observations",
          )
          .get(),
      ).toEqual({ observed_at: 1_400 });
      expect(
        inspect
          .query<{ payload_json: string }, []>(
            "SELECT payload_json FROM runtime_objects",
          )
          .get()!.payload_json,
      ).toContain('"observedAt":1500');
    } finally {
      inspect.close();
    }
  });
});
