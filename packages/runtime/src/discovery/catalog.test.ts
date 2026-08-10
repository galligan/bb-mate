import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  BbContextIdSchema,
  ObjectIdSchema,
  OpaqueIdSchema,
  PrincipalIdSchema,
} from "../contracts/ids.ts";
import { openDevelopmentTargetCatalog } from "./catalog.ts";
import { issueTrustedDevelopmentTargetCandidate } from "./trusted-candidate.ts";

const temporaryRoots: string[] = [];
const principalId = PrincipalIdSchema.parse("p".repeat(32));
const bbContextId = BbContextIdSchema.parse("b".repeat(32));

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

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("DevelopmentTargetCatalog capability boundary", () => {
  test("rejects raw and cloned candidates before direct catalog mutation", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-mate-catalog-capability-"),
    );
    temporaryRoots.push(parent);
    const pluginRoot = path.join(parent, "plugin");
    await fs.mkdir(pluginRoot);
    const canonicalRoot = await fs.realpath(pluginRoot);
    const issued = await issueTrustedDevelopmentTargetCandidate(
      candidateInput(canonicalRoot),
    );
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: path.join(parent, "data"),
      id: () => ObjectIdSchema.parse("t".repeat(32)),
      clock: () => 1_000,
    });
    try {
      for (const forged of [
        candidateInput(canonicalRoot),
        { ...issued },
        Object.create(issued) as unknown,
        Object.fromEntries(Object.entries(issued)),
      ]) {
        await expect(
          Promise.resolve().then(() =>
            catalog.refresh({
              principalId,
              bbContextId,
              candidate: forged as never,
            }),
          ),
        ).rejects.toMatchObject({ code: "invalid_request" });
      }
      expect(catalog.list({ principalId, bbContextId })).toEqual([]);
    } finally {
      catalog.close();
    }
  });
});
