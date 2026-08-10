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
import { RuntimeError } from "../errors.ts";
import { openDevelopmentTargetCatalog } from "./catalog.ts";
import { inspectDevelopmentSourceIdentity } from "./source-identity.ts";
import {
  createInspectionDevelopmentTargetCandidateBridge,
  type InspectionSourceCandidateFacts,
} from "./trusted-candidate.ts";

const temporaryRoots: string[] = [];
const principalId = PrincipalIdSchema.parse("p".repeat(32));
const bbContextId = BbContextIdSchema.parse("b".repeat(32));

async function issueInspectionCandidate(value: InspectionSourceCandidateFacts) {
  const candidate = Object.freeze({ ...value });
  const transition = Object.freeze({ transition: true });
  const identity = await inspectDevelopmentSourceIdentity(value.canonicalRoot);
  let active = false;
  const bridge = createInspectionDevelopmentTargetCandidateBridge({
    clock: () => 1_000,
    async consumeIssuedSourceCandidate(input, consumer) {
      if (input !== candidate) throw new RuntimeError("invalid_request");
      active = true;
      try {
        return await consumer(transition);
      } finally {
        active = false;
      }
    },
    readSourceCandidateTransition(input) {
      if (input !== transition || !active) {
        throw new RuntimeError("invalid_request");
      }
      return {
        ...value,
        directoryIdentity: {
          canonicalRoot: identity.canonicalRoot,
          device: identity.device,
          inode: identity.inode,
        },
        manifestIdentity: identity.manifest,
      };
    },
  });
  return bridge.issue(candidate);
}

function candidate(canonicalRoot: string) {
  return {
    rootKey: OpaqueIdSchema.parse("r".repeat(32)),
    rootKind: "current-project" as const,
    canonicalRoot,
    displayName: "Notes",
    displayPath: "plugins/notes",
    packageName: "bb-plugin-notes",
    version: "1.2.3",
    pluginId: "notes",
    hasServer: true,
    hasApp: true,
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
      await fs.writeFile(
        path.join(pluginRoot, "package.json"),
        JSON.stringify({ name: "bb-plugin-notes", version: "1.2.3" }),
      );
      const dataRoot = path.join(parent, "data");
      const catalog = await openDevelopmentTargetCatalog({
        dataRoot,
        id: () => ObjectIdSchema.parse("t".repeat(32)),
        clock: () => 1_000,
      });
      await catalog.refresh({
        principalId,
        bbContextId,
        candidate: await issueInspectionCandidate(
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
