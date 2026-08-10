import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { z } from "zod";

import { createRequestContext, type RequestContext } from "../auth/context.ts";
import type { AuthenticatedPrincipal } from "../auth/principals.ts";
import {
  BbContextIdSchema,
  ObjectIdSchema,
  PrincipalIdSchema,
  TargetIdSchema,
} from "../contracts/ids.ts";
import {
  defineObjectCodec,
  ObjectCodecRegistry,
} from "../contracts/objects.ts";
import { openRuntimeStore } from "../persistence/store.ts";
import { createWorkbenchService } from "./workbench-service.ts";

const temporaryRoots: string[] = [];
const objectId = ObjectIdSchema.parse("o".repeat(32));
const principalId = PrincipalIdSchema.parse("p".repeat(32));
const bbContextId = BbContextIdSchema.parse("b".repeat(32));
const targetId = TargetIdSchema.parse("t".repeat(32));

async function makeDataRoot(): Promise<string> {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryRoot, "bb-mate-service-credentials-"),
  );
  temporaryRoots.push(parent);
  return path.join(parent, "data");
}

function context(
  overrides: Partial<AuthenticatedPrincipal> = {},
): RequestContext {
  return createRequestContext({
    id: principalId,
    kind: "browser-session",
    scopes: ["annotations:read", "annotations:write", "events:read"],
    revoked: false,
    bbContextId,
    targetId,
    ...overrides,
  });
}

async function openFixture() {
  const store = await openRuntimeStore({
    dataRoot: await makeDataRoot(),
    codecs: new ObjectCodecRegistry([
      defineObjectCodec("annotation", { body: z.string() }),
    ]),
    id: () => objectId,
  });
  return { store, service: createWorkbenchService(store) };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("WorkbenchService credentials", () => {
  test("requires a branded, active, target-bound credential", async () => {
    const { store, service } = await openFixture();
    const input = { kind: "annotation", payload: { body: "Private" } };

    try {
      const forged = {
        principal: context().principal,
      } as unknown as RequestContext;
      expect(() => service.createObject(forged, input)).toThrow(
        expect.objectContaining({ code: "unauthenticated" }),
      );
      expect(() =>
        service.createObject(context({ revoked: true }), input),
      ).toThrow(expect.objectContaining({ code: "unauthenticated" }));
      expect(() =>
        service.createObject(
          context({ targetId: undefined, sessionId: undefined }),
          input,
        ),
      ).toThrow(expect.objectContaining({ code: "forbidden" }));
      expect(() =>
        service.pullEvents(
          context({ targetId: undefined, sessionId: undefined }),
          {},
        ),
      ).toThrow(expect.objectContaining({ code: "forbidden" }));
    } finally {
      store.close();
    }
  });

  test("requires each operation's explicit scope and rejects revoked contexts", async () => {
    const { store, service } = await openFixture();
    const owner = context();
    const createInput = {
      kind: "annotation" as const,
      payload: { body: "Private" },
    };
    const getInput = { id: objectId, kind: "annotation" as const };
    const updateInput = {
      ...getInput,
      expectedRevision: 1,
      payload: { body: "Changed" },
    };

    try {
      service.createObject(owner, createInput);
      const unscopedOperations = [
        () =>
          service.createObject(
            context({ scopes: ["annotations:read"] }),
            createInput,
          ),
        () =>
          service.getObject(
            context({ scopes: ["annotations:write"] }),
            getInput,
          ),
        () =>
          service.updateObject(
            context({ scopes: ["annotations:read"] }),
            updateInput,
          ),
        () => service.pullEvents(context({ scopes: ["annotations:read"] }), {}),
      ];
      for (const operation of unscopedOperations) {
        expect(operation).toThrow(
          expect.objectContaining({ code: "forbidden" }),
        );
      }

      const revoked = context({ revoked: true });
      const revokedOperations = [
        () => service.createObject(revoked, createInput),
        () => service.getObject(revoked, getInput),
        () => service.updateObject(revoked, updateInput),
        () => service.pullEvents(revoked, {}),
      ];
      for (const operation of revokedOperations) {
        expect(operation).toThrow(
          expect.objectContaining({ code: "unauthenticated" }),
        );
      }
    } finally {
      store.close();
    }
  });

  test("does not grant supervisors implicit access to another principal's objects", async () => {
    const { store, service } = await openFixture();

    try {
      service.createObject(context(), {
        kind: "annotation",
        payload: { body: "Private" },
      });
      const supervisor = context({
        id: PrincipalIdSchema.parse("q".repeat(32)),
        kind: "supervisor",
        scopes: ["annotations:read"],
      });
      expect(() =>
        service.getObject(supervisor, { id: objectId, kind: "annotation" }),
      ).toThrow(expect.objectContaining({ code: "not_found" }));

      const unscopedSupervisor = context({
        kind: "supervisor",
        scopes: ["runtime:read"],
      });
      expect(() =>
        service.getObject(unscopedSupervisor, {
          id: objectId,
          kind: "annotation",
        }),
      ).toThrow(expect.objectContaining({ code: "forbidden" }));
    } finally {
      store.close();
    }
  });
});
