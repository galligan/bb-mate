import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { z } from "zod";

import { createRequestContext } from "../auth/context.ts";
import type { Scope } from "../auth/principals.ts";
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
const scopeCases = [
  ["session", "sessions:read", "sessions:write"],
  ["surface", "surfaces:read", "surfaces:write"],
  ["annotation", "annotations:read", "annotations:write"],
  ["capture", "captures:read", "captures:write"],
  ["comparison", "comparisons:read", "comparisons:write"],
  ["plugin-brief", "plugin-briefs:read", "plugin-briefs:write"],
  ["review", "reviews:read", "reviews:write"],
] as const;

async function makeDataRoot(): Promise<string> {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryRoot, "bb-plugin-studio-service-scopes-"),
  );
  temporaryRoots.push(parent);
  return path.join(parent, "data");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("WorkbenchService scope mapping", () => {
  test("uses the least-privilege write scope for every generic object kind", async () => {
    let nextId = 0;
    const store = await openRuntimeStore({
      dataRoot: await makeDataRoot(),
      codecs: new ObjectCodecRegistry(
        scopeCases.map(([kind]) =>
          defineObjectCodec(kind, { label: z.string() }),
        ),
      ),
      id: () => ObjectIdSchema.parse(String(nextId++).repeat(32)),
    });
    const service = createWorkbenchService(store);

    try {
      for (const [kind, , scope] of scopeCases) {
        const context = createRequestContext({
          id: PrincipalIdSchema.parse("p".repeat(32)),
          kind: "plugin-adapter",
          scopes: [scope] satisfies Scope[],
          revoked: false,
          bbContextId: BbContextIdSchema.parse("b".repeat(32)),
          targetId: TargetIdSchema.parse("t".repeat(32)),
        });
        expect(
          service.createObject(context, { kind, payload: { label: kind } })
            .kind,
        ).toBe(kind);
      }
    } finally {
      store.close();
    }
  });

  test("uses the least-privilege read scope for every generic object kind", async () => {
    const ids = scopeCases.map((_, index) =>
      ObjectIdSchema.parse(String(index).repeat(32)),
    );
    let nextId = 0;
    const store = await openRuntimeStore({
      dataRoot: await makeDataRoot(),
      codecs: new ObjectCodecRegistry(
        scopeCases.map(([kind]) =>
          defineObjectCodec(kind, { label: z.string() }),
        ),
      ),
      id: () => ids[nextId++]!,
    });
    const service = createWorkbenchService(store);
    const basePrincipal = {
      id: PrincipalIdSchema.parse("p".repeat(32)),
      kind: "plugin-adapter" as const,
      revoked: false,
      bbContextId: BbContextIdSchema.parse("b".repeat(32)),
      targetId: TargetIdSchema.parse("t".repeat(32)),
    };

    try {
      const writer = createRequestContext({
        ...basePrincipal,
        scopes: scopeCases.map(([, , scope]) => scope) satisfies Scope[],
      });
      for (const [kind] of scopeCases) {
        service.createObject(writer, { kind, payload: { label: kind } });
      }
      for (const [[kind, scope], id] of scopeCases.map(
        ([kind, scope], index) => [[kind, scope], ids[index]!] as const,
      )) {
        const reader = createRequestContext({
          ...basePrincipal,
          scopes: [scope] satisfies Scope[],
        });
        expect(service.getObject(reader, { id, kind }).kind).toBe(kind);
      }
    } finally {
      store.close();
    }
  });
});
