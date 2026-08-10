import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { createRequestContext } from "../auth/context.ts";
import {
  BbContextIdSchema,
  ObjectIdSchema,
  OpaqueIdSchema,
  PrincipalIdSchema,
} from "../contracts/ids.ts";
import { openDevelopmentTargetCatalog } from "../discovery/catalog.ts";
import { RuntimeError } from "../errors.ts";
import { createEventFeed } from "../events/feed.ts";
import {
  bbContextId,
  candidate,
  cleanupDevelopmentTargetReconciliationFixtures,
  context,
  issueNativeInventory,
  makeFixture,
  objectId,
  principalId,
  targetId,
} from "./development-target-reconciliation-fixture.ts";
import { createDevelopmentTargetService } from "./development-target-service.ts";

afterEach(cleanupDevelopmentTargetReconciliationFixtures);

describe("DevelopmentTargetService native reconciliation authorization", () => {
  test("atomically reconciles a catalog target and keeps native host evidence private", async () => {
    const fixture = await makeFixture();
    let now = 1_000;
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => now,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      const created = await service.refreshFromTrustedCandidate(
        context(),
        await candidate(fixture.pluginRoot),
      );
      now = 2_000;
      const reconciled = await service.reconcileFromTrustedInventory(
        context(),
        {
          targetId: created.id,
          sourceCandidate: await candidate(fixture.pluginRoot),
          inventory: await issueNativeInventory(fixture.pluginRoot),
          expectedRevision: 1,
        },
      );

      expect(reconciled).toMatchObject({
        id: created.id,
        revision: 2,
        updatedAt: 2_000,
        native: {
          status: "exact-path",
          pluginId: "notes",
          observedAt: 1_500,
        },
      });
      expect(
        catalog.resolvePrivateHostObservation({
          principalId,
          bbContextId,
          id: objectId,
        }),
      ).toEqual({
        runtimeInstanceId: OpaqueIdSchema.parse("i".repeat(32)),
        hostname: "mate.local",
        observedAt: 1_500,
      });
      const serialized = JSON.stringify(reconciled);
      expect(serialized).not.toContain(fixture.pluginRoot);
      expect(serialized).not.toContain("mate.local");
      expect(serialized).not.toContain("i".repeat(32));

      const database = new Database(
        path.join(fixture.dataRoot, "workbench.sqlite3"),
      );
      try {
        const event = database
          .query("SELECT * FROM runtime_events ORDER BY sequence DESC LIMIT 1")
          .get()!;
        expect(event).toMatchObject({
          event_type: "target.native-reconciled",
          object_id: objectId,
          revision: 2,
          occurred_at: 2_000,
        });
        expect(JSON.stringify(event)).not.toContain(fixture.pluginRoot);
        expect(JSON.stringify(event)).not.toContain("mate.local");
        expect(JSON.stringify(event)).not.toContain("i".repeat(32));
        const page = createEventFeed(database).pull({
          bindings: {
            principalId,
            bbContextId,
            targetId,
          },
        });
        expect(page.events.at(-1)).toEqual({
          cursor: expect.stringMatching(/^v1_[0-9a-z]+$/u),
          type: "target.native-reconciled",
          objectId,
          objectKind: "development-target",
          revision: 2,
          occurredAt: 2_000,
        });
        expect(JSON.stringify(page)).not.toContain(fixture.pluginRoot);
        expect(JSON.stringify(page)).not.toContain("mate.local");
        expect(JSON.stringify(page)).not.toContain("i".repeat(32));
      } finally {
        database.close();
      }
    } finally {
      catalog.close();
    }
  });

  test("default-denies reconciliation across scopes, bindings, and target identities", async () => {
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
      const reconcile = async (requestContext: ReturnType<typeof context>) =>
        service.reconcileFromTrustedInventory(requestContext, {
          targetId: created.id,
          sourceCandidate: await candidate(fixture.pluginRoot),
          inventory: await issueNativeInventory(fixture.pluginRoot),
          expectedRevision: 1,
        });

      const unscoped = createRequestContext({
        id: principalId,
        kind: "mcp-client",
        scopes: ["targets:read"],
        revoked: false,
        bbContextId,
      });
      await expect(reconcile(unscoped)).rejects.toMatchObject({
        code: "forbidden",
      });
      const targetBound = createRequestContext({
        id: principalId,
        kind: "plugin-adapter",
        scopes: ["targets:write"],
        revoked: false,
        bbContextId,
        targetId,
      });
      await expect(reconcile(targetBound)).rejects.toMatchObject({
        code: "forbidden",
      });

      for (const foreign of [
        createRequestContext({
          id: PrincipalIdSchema.parse("q".repeat(32)),
          kind: "supervisor",
          scopes: ["targets:write"],
          revoked: false,
          bbContextId,
        }),
        createRequestContext({
          id: principalId,
          kind: "supervisor",
          scopes: ["targets:write"],
          revoked: false,
          bbContextId: BbContextIdSchema.parse("c".repeat(32)),
        }),
      ]) {
        await expect(
          service.reconcileFromTrustedInventory(foreign, {
            targetId: created.id,
            sourceCandidate: await candidate(fixture.pluginRoot),
            inventory: await issueNativeInventory(fixture.pluginRoot),
            expectedRevision: 1,
          }),
        ).rejects.toMatchObject({ code: "not_found" });
      }
      await expect(
        service.reconcileFromTrustedInventory(context(), {
          targetId: ObjectIdSchema.parse("u".repeat(32)),
          sourceCandidate: await candidate(fixture.pluginRoot),
          inventory: await issueNativeInventory(fixture.pluginRoot),
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ code: "not_found" });
      expect(service.getTarget(context(), created.id)).toEqual(created);
    } finally {
      catalog.close();
    }
  });

  test("requires the current same-root source capability, exact inventory capability, and revision", async () => {
    const fixture = await makeFixture();
    const otherRoot = path.join(
      path.dirname(fixture.pluginRoot),
      "other-plugin",
    );
    await fs.mkdir(otherRoot);
    await fs.writeFile(
      path.join(otherRoot, "package.json"),
      JSON.stringify({ name: "bb-plugin-notes", version: "1.2.3" }),
    );
    const canonicalOtherRoot = await fs.realpath(otherRoot);
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
      const validSource = await candidate(fixture.pluginRoot);
      const validInventory = await issueNativeInventory(fixture.pluginRoot);

      await expect(
        service.reconcileFromTrustedInventory(context(), {
          targetId: created.id,
          sourceCandidate: validSource,
          inventory: validInventory,
          expectedRevision: 2,
        }),
      ).rejects.toEqual(new RuntimeError("conflict"));
      await expect(
        service.reconcileFromTrustedInventory(context(), {
          targetId: created.id,
          sourceCandidate: await candidate(canonicalOtherRoot),
          inventory: validInventory,
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ code: "invalid_request" });
      await expect(
        service.reconcileFromTrustedInventory(context(), null as never),
      ).rejects.toMatchObject({ code: "invalid_request" });
      for (const [sourceCandidate, inventory] of [
        [{ ...validSource }, validInventory],
        [validSource, { ...validInventory }],
        [Object.create(validSource), validInventory],
        [validSource, Object.create(validInventory)],
      ] as const) {
        await expect(
          service.reconcileFromTrustedInventory(context(), {
            targetId: created.id,
            sourceCandidate: sourceCandidate as never,
            inventory: inventory as never,
            expectedRevision: 1,
          }),
        ).rejects.toMatchObject({ code: "invalid_request" });
      }
      await expect(
        service.reconcileFromTrustedInventory(context(), {
          targetId: created.id,
          sourceCandidate: validSource,
          inventory: validInventory,
          expectedRevision: 1,
          canonicalRoot: fixture.pluginRoot,
        } as never),
      ).rejects.toMatchObject({ code: "invalid_request" });
      expect(service.getTarget(context(), created.id)).toEqual(created);
      expect(
        catalog.resolvePrivateHostObservation({
          principalId,
          bbContextId,
          id: objectId,
        }),
      ).toBeUndefined();
    } finally {
      catalog.close();
    }
  });
});
