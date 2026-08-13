import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { discoverSourceCandidates } from "../packages/inspection/src/discover-source-candidates.ts";
import {
  consumeIssuedNativeInventory,
  observeNativePluginInventoryForTest,
  readNativeInventoryTransition,
} from "../packages/inspection/src/native-inventory.ts";
import {
  consumeIssuedSourceCandidate,
  readSourceCandidateTransition,
} from "../packages/inspection/src/source-candidate-transition.ts";
import { admitTrustedRoots } from "../packages/inspection/src/trusted-roots.ts";
import { createRequestContext } from "../packages/runtime/src/auth/context.ts";
import {
  BbContextIdSchema,
  ObjectIdSchema,
  OpaqueIdSchema,
  PrincipalIdSchema,
} from "../packages/runtime/src/contracts/ids.ts";
import { openDevelopmentTargetCatalog } from "../packages/runtime/src/discovery/open-catalog.ts";
import { createInspectionNativeInventoryBridge } from "../packages/runtime/src/discovery/native-inventory.ts";
import { createInspectionDevelopmentTargetCandidateBridge } from "../packages/runtime/src/discovery/trusted-candidate.ts";
import { createDevelopmentTargetService } from "../packages/runtime/src/service/development-target-service.ts";

const ROOT_KEY = OpaqueIdSchema.parse("r".repeat(32));
const PRINCIPAL_ID = PrincipalIdSchema.parse("p".repeat(32));
const BB_CONTEXT_ID = BbContextIdSchema.parse("b".repeat(32));
const TARGET_ID = ObjectIdSchema.parse("t".repeat(32));
const RUNTIME_INSTANCE_ID = OpaqueIdSchema.parse("i".repeat(32));
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("native development-target reconciliation", () => {
  test("reconciles released managed inventory into one source target and reopens it", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-plugin-studio-native-target-"),
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
        scripts: { preinstall: `touch ${JSON.stringify(executionSentinel)}` },
        bb: {
          name: "Example plugin",
          description: "A passive native-reconciliation fixture.",
          branding: { icon: "extension" },
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
    const discover = async () => {
      const result = await discoverSourceCandidates(admission.roots);
      expect(result.diagnostics).toEqual([]);
      expect(result.candidates).toHaveLength(1);
      return result.candidates[0]!;
    };

    const sourceBridge = createInspectionDevelopmentTargetCandidateBridge({
      consumeIssuedSourceCandidate,
      readSourceCandidateTransition,
      clock: () => 1_000,
    });
    const nativeBridge = createInspectionNativeInventoryBridge({
      consumeIssuedNativeInventory,
      readNativeInventoryTransition,
    });
    const nativeCommands: string[][] = [];
    const observation = await observeNativePluginInventoryForTest({
      runtimeInstanceId: RUNTIME_INSTANCE_ID,
      now: () => 2_000,
      hostname: () => "devbox.local",
      runBb: async (args) => {
        nativeCommands.push([...args]);
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            plugins: [
              {
                id: "example",
                source: "npm:bb-plugin-example@1.2.3",
                rootDir: "/managed/bb-plugin-example",
                version: "1.2.3",
                provenance: "direct",
                isOrphanedBuiltin: false,
                enabled: true,
                status: "running",
              },
            ],
          }),
          stderr: "",
        };
      },
    });
    const inventory = await nativeBridge.issue(observation);
    const context = createRequestContext({
      id: PRINCIPAL_ID,
      kind: "plugin-adapter",
      scopes: ["targets:read", "targets:write"],
      revoked: false,
      bbContextId: BB_CONTEXT_ID,
    });
    const dataRoot = path.join(parent, "runtime-data");
    let clock = 1_000;
    let catalog = await openDevelopmentTargetCatalog({
      dataRoot,
      id: () => TARGET_ID,
      clock: () => clock,
    });
    let service = createDevelopmentTargetService(catalog);

    expect(service.listTargets(context)).toEqual([]);
    const created = await service.refreshFromTrustedCandidate(
      context,
      await sourceBridge.issue(await discover()),
    );
    clock = 2_000;
    const reconciled = await service.reconcileFromTrustedInventory(context, {
      targetId: created.id,
      sourceCandidate: await sourceBridge.issue(await discover()),
      inventory,
      expectedRevision: created.revision,
    });

    expect(nativeCommands).toEqual([["plugin", "list", "--json"]]);
    expect(reconciled.id).toBe(created.id);
    expect(reconciled.revision).toBe(2);
    expect(reconciled.native).toEqual({
      status: "managed",
      pluginId: "example",
      observedAt: 2_000,
    });
    expect(service.listTargets(context)).toEqual([reconciled]);
    expect(JSON.stringify(reconciled)).not.toContain(parent);
    expect(JSON.stringify(reconciled)).not.toContain("devbox.local");
    expect(
      catalog.resolvePrivateHostObservation({
        principalId: PRINCIPAL_ID,
        bbContextId: BB_CONTEXT_ID,
        id: TARGET_ID,
      }),
    ).toEqual({
      runtimeInstanceId: RUNTIME_INSTANCE_ID,
      hostname: "devbox.local",
      observedAt: 2_000,
    });
    catalog.close();

    catalog = await openDevelopmentTargetCatalog({ dataRoot });
    service = createDevelopmentTargetService(catalog);
    expect(service.listTargets(context)).toEqual([reconciled]);
    expect(service.getTarget(context, TARGET_ID)).toEqual(reconciled);
    catalog.close();
    expect(
      await fs
        .stat(executionSentinel)
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
  });
});
