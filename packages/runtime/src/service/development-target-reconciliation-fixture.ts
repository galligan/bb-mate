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
import { createInspectionNativeInventoryBridge } from "../discovery/native-inventory.ts";
import { inspectDevelopmentSourceIdentity } from "../discovery/source-identity.ts";
import {
  createInspectionDevelopmentTargetCandidateBridge,
  type InspectionSourceCandidateFacts,
} from "../discovery/trusted-candidate.ts";
import { RuntimeError } from "../errors.ts";

const temporaryRoots: string[] = [];
export const objectId = ObjectIdSchema.parse("t".repeat(32));
export const targetId = TargetIdSchema.parse("t".repeat(32));
export const principalId = PrincipalIdSchema.parse("p".repeat(32));
export const bbContextId = BbContextIdSchema.parse("b".repeat(32));

async function issueInspectionCandidate(value: InspectionSourceCandidateFacts) {
  const source = Object.freeze({ ...value });
  const transition = Object.freeze({ transition: true });
  const identity = await inspectDevelopmentSourceIdentity(value.canonicalRoot);
  let active = false;
  return createInspectionDevelopmentTargetCandidateBridge({
    clock: () => 1_000,
    async consumeIssuedSourceCandidate(candidate, consumer) {
      if (candidate !== source) throw new RuntimeError("invalid_request");
      active = true;
      try {
        return await consumer(transition);
      } finally {
        active = false;
      }
    },
    readSourceCandidateTransition(candidate) {
      if (candidate !== transition || !active) {
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
  }).issue(source);
}

export async function issueNativeInventory(
  canonicalRoot: string,
  overrides: Record<string, unknown> = {},
) {
  const observation = Object.freeze({ observation: true });
  const transition = Object.freeze({ transition: true });
  let active = false;
  return createInspectionNativeInventoryBridge({
    async consumeIssuedNativeInventory(input, consumer) {
      if (input !== observation) throw new RuntimeError("invalid_request");
      active = true;
      try {
        return await consumer(transition);
      } finally {
        active = false;
      }
    },
    readNativeInventoryTransition(input) {
      if (input !== transition || !active) {
        throw new RuntimeError("invalid_request");
      }
      return {
        schemaVersion: 1,
        observedAt: 1_500,
        runtimeInstanceId: OpaqueIdSchema.parse("i".repeat(32)),
        hostname: "studio.local",
        topLevelStatus: "ok",
        entries: [
          {
            id: "notes",
            sourceKind: "path",
            canonicalRoot,
            version: "1.2.3",
            provenance: "direct",
            isOrphanedBuiltin: false,
            enabled: true,
            status: "running",
          },
        ],
        malformedRows: [],
        ...overrides,
      };
    },
  }).issue(observation);
}

export async function makeFixture() {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryRoot, "bb-plugin-studio-development-target-"),
  );
  temporaryRoots.push(parent);
  const pluginRoot = path.join(parent, "plugin");
  await fs.mkdir(pluginRoot);
  await fs.writeFile(
    path.join(pluginRoot, "package.json"),
    JSON.stringify({ name: "bb-plugin-notes", version: "1.2.3" }),
  );
  return {
    dataRoot: path.join(parent, "data"),
    pluginRoot: await fs.realpath(pluginRoot),
  };
}

export function context() {
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

export async function candidate(canonicalRoot: string) {
  const input = candidateInput(canonicalRoot);
  return issueInspectionCandidate({
    rootKey: input.rootKey,
    rootKind: input.rootKind,
    canonicalRoot: input.canonicalRoot,
    displayName: input.target.displayName,
    displayPath: input.target.displayPath,
    packageName: input.target.manifest.packageName,
    version: input.target.manifest.version,
    pluginId: input.target.manifest.pluginId,
    hasServer: input.target.manifest.hasServer,
    hasApp: input.target.manifest.hasApp,
  });
}

export async function cleanupDevelopmentTargetReconciliationFixtures() {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
}
