import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
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
import { issueTrustedDevelopmentTargetCandidateFromInspection } from "./trusted-candidate.ts";

const temporaryRoots: string[] = [];
const principalId = PrincipalIdSchema.parse("p".repeat(32));
const bbContextId = BbContextIdSchema.parse("b".repeat(32));

function candidate(canonicalRoot: string) {
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

describe("development-target private-source integrity", () => {
  test("rejects invalid private field encodings without repairing them", async () => {
    for (const [column, corruptValue] of [
      ["root_key", "configured-label"],
      ["root_kind", "unknown"],
      ["canonical_root", "relative/plugin"],
    ] as const) {
      const temporaryRoot = await fs.realpath(os.tmpdir());
      const parent = await fs.mkdtemp(
        path.join(temporaryRoot, "bb-mate-private-integrity-"),
      );
      temporaryRoots.push(parent);
      const pluginRoot = path.join(parent, "plugin");
      await fs.mkdir(pluginRoot);
      const dataRoot = path.join(parent, "data");
      const catalog = await openDevelopmentTargetCatalog({
        dataRoot,
        id: () => ObjectIdSchema.parse("t".repeat(32)),
        clock: () => 1_000,
      });
      await catalog.refresh({
        principalId,
        bbContextId,
        candidate: await issueTrustedDevelopmentTargetCandidateFromInspection(
          candidate(await fs.realpath(pluginRoot)),
        ),
      });
      catalog.close();

      const databasePath = path.join(dataRoot, "workbench.sqlite3");
      const tamper = new Database(databasePath);
      tamper.exec("PRAGMA ignore_check_constraints = ON");
      tamper
        .query(`UPDATE development_target_sources SET ${column} = ?`)
        .run(corruptValue);
      tamper.close();

      await expect(
        openDevelopmentTargetCatalog({ dataRoot }),
      ).rejects.toMatchObject({ code: "corrupt_data" });
      const inspect = new Database(databasePath, { readonly: true });
      try {
        expect(
          inspect
            .query<{ value: string }, []>(
              `SELECT ${column} AS value FROM development_target_sources`,
            )
            .get(),
        ).toEqual({ value: corruptValue });
      } finally {
        inspect.close();
      }
    }
  });
});
