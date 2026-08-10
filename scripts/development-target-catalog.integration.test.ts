import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { discoverSourceCandidates } from "../packages/inspection/src/discover-source-candidates.ts";
import { admitTrustedRoots } from "../packages/inspection/src/trusted-roots.ts";
import { createRequestContext } from "../packages/runtime/src/auth/context.ts";
import {
  BbContextIdSchema,
  ObjectIdSchema,
  PrincipalIdSchema,
} from "../packages/runtime/src/contracts/ids.ts";
import { openDevelopmentTargetCatalog } from "../packages/runtime/src/discovery/catalog.ts";
import { issueTrustedDevelopmentTargetCandidate } from "../packages/runtime/src/discovery/trusted-candidate.ts";
import { createDevelopmentTargetService } from "../packages/runtime/src/service/development-target-service.ts";

const ROOT_KEY = "r".repeat(32);
const PRINCIPAL_ID = PrincipalIdSchema.parse("p".repeat(32));
const BB_CONTEXT_ID = BbContextIdSchema.parse("b".repeat(32));
const TARGET_ID = ObjectIdSchema.parse("t".repeat(32));
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("source discovery to development-target catalog", () => {
  test("persists and reopens one passive source target without revealing or executing its root", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-mate-source-catalog-"),
    );
    temporaryRoots.push(parent);
    const workspaceRoot = path.join(parent, "workspace");
    const pluginRoot = path.join(workspaceRoot, "plugins", "example");
    const executionSentinel = path.join(parent, "target-executed");
    await fs.mkdir(path.join(pluginRoot, "dist"), { recursive: true });
    await fs.writeFile(
      path.join(pluginRoot, "package.json"),
      JSON.stringify({
        name: "bb-plugin-example",
        version: "1.2.3",
        scripts: {
          preinstall: `touch ${JSON.stringify(executionSentinel)}`,
        },
        bb: {
          name: "Example plugin",
          server: "dist/server.js",
        },
      }),
    );
    await fs.writeFile(
      path.join(pluginRoot, "dist", "server.js"),
      `await Bun.write(${JSON.stringify(executionSentinel)}, "executed");`,
    );

    const admission = await admitTrustedRoots([
      {
        rootKey: ROOT_KEY,
        kind: "current-project",
        path: workspaceRoot,
        displayName: "workspace",
      },
    ]);
    expect(admission.diagnostics).toEqual([]);
    const discovery = await discoverSourceCandidates(admission.roots);
    expect(discovery.diagnostics).toEqual([]);
    expect(discovery.candidates).toHaveLength(1);
    const candidate = discovery.candidates[0]!;
    expect(candidate.canonicalRoot).toBe(pluginRoot);

    const issued = await issueTrustedDevelopmentTargetCandidate({
      rootKey: candidate.rootKey,
      rootKind: "current-project",
      canonicalRoot: candidate.canonicalRoot,
      target: {
        displayName: candidate.displayName,
        displayPath: candidate.displayPath,
        sourceKind: "workspace-discovered",
        manifest: {
          pluginId: candidate.pluginId,
          packageName: candidate.packageName,
          version: candidate.version,
          hasServer: candidate.hasServer,
          hasApp: candidate.hasApp,
        },
        native: {
          status: "absent",
          observedAt: 1_000,
        },
        capabilities: {
          fixture: true,
          harness: false,
          live: false,
        },
      },
    });
    const context = createRequestContext({
      id: PRINCIPAL_ID,
      kind: "plugin-adapter",
      scopes: ["targets:read", "targets:write"],
      revoked: false,
      bbContextId: BB_CONTEXT_ID,
    });
    const dataRoot = path.join(parent, "runtime-data");
    let catalog = await openDevelopmentTargetCatalog({
      dataRoot,
      id: () => TARGET_ID,
      clock: () => 1_000,
    });
    let service = createDevelopmentTargetService(catalog);
    const created = await service.refreshFromTrustedCandidate(context, issued);
    expect(String(created.id)).toBe(String(TARGET_ID));
    expect(created.revision).toBe(1);
    expect(JSON.stringify(created)).not.toContain(parent);
    expect(JSON.stringify(created)).not.toContain(ROOT_KEY);
    expect(
      catalog.resolvePrivate({
        principalId: PRINCIPAL_ID,
        bbContextId: BB_CONTEXT_ID,
        id: TARGET_ID,
      }),
    ).toEqual({
      canonicalRoot: pluginRoot,
      rootKey: ROOT_KEY,
      rootKind: "current-project",
    });
    catalog.close();

    catalog = await openDevelopmentTargetCatalog({ dataRoot });
    service = createDevelopmentTargetService(catalog);
    expect(service.listTargets(context)).toEqual([created]);
    expect(service.getTarget(context, TARGET_ID)).toEqual(created);
    catalog.close();

    expect(
      await fs
        .stat(executionSentinel)
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
  });
});
