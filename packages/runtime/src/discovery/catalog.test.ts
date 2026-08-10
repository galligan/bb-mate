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

function createInspectionHarness() {
  const issuedFacts = new WeakMap<object, InspectionSourceCandidateFacts>();
  const activeTransitions = new WeakMap<object, unknown>();
  const bridge = createInspectionDevelopmentTargetCandidateBridge({
    clock: () => 1_000,
    async consumeIssuedSourceCandidate(candidate, consumer) {
      if (typeof candidate !== "object" || candidate === null) {
        throw new RuntimeError("invalid_request");
      }
      const value = issuedFacts.get(candidate);
      if (!value) throw new RuntimeError("invalid_request");
      issuedFacts.delete(candidate);
      const identity = await inspectDevelopmentSourceIdentity(
        value.canonicalRoot,
      );
      const transition = Object.freeze({ transition: true });
      activeTransitions.set(transition, {
        ...value,
        directoryIdentity: {
          canonicalRoot: identity.canonicalRoot,
          device: identity.device,
          inode: identity.inode,
        },
        manifestIdentity: identity.manifest,
      });
      try {
        return await consumer(transition);
      } finally {
        activeTransitions.delete(transition);
      }
    },
    readSourceCandidateTransition(transition) {
      if (typeof transition !== "object" || transition === null) {
        throw new RuntimeError("invalid_request");
      }
      const value = activeTransitions.get(transition);
      if (!value) throw new RuntimeError("invalid_request");
      return value;
    },
  });
  return {
    bridge,
    issueSourceCandidate(
      value: InspectionSourceCandidateFacts,
      claims: object = {},
    ) {
      const candidate = Object.freeze({ ...value, ...claims });
      issuedFacts.set(candidate, Object.freeze({ ...value }));
      return candidate;
    },
  };
}

function facts(canonicalRoot: string) {
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

describe("DevelopmentTargetCatalog capability boundary", () => {
  test("persists only derived facts from an exact inspection and runtime capability", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-mate-catalog-capability-"),
    );
    temporaryRoots.push(parent);
    const pluginRoot = path.join(parent, "plugin");
    await fs.mkdir(pluginRoot);
    await fs.writeFile(
      path.join(pluginRoot, "package.json"),
      JSON.stringify({ name: "bb-plugin-notes", version: "1.2.3" }),
    );
    const canonicalRoot = await fs.realpath(pluginRoot);
    const harness = createInspectionHarness();
    const source = harness.issueSourceCandidate(facts(canonicalRoot), {
      native: { status: "exact-path", pluginId: "spoofed" },
      capabilities: { fixture: true, harness: true, live: true },
      target: { displayName: "Spoofed target", live: true },
    });
    const issued = await harness.bridge.issue(source);
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: path.join(parent, "data"),
      id: () => ObjectIdSchema.parse("t".repeat(32)),
      clock: () => 1_000,
    });
    try {
      await expect(
        harness.bridge.issue(facts(canonicalRoot)),
      ).rejects.toMatchObject({ code: "invalid_request" });
      await expect(harness.bridge.issue({ ...source })).rejects.toMatchObject({
        code: "invalid_request",
      });
      for (const forged of [
        { ...issued },
        Object.create(issued) as unknown,
        Object.fromEntries(Object.entries(issued)),
      ]) {
        await expect(
          catalog.refresh({
            principalId,
            bbContextId,
            candidate: forged as never,
          }),
        ).rejects.toMatchObject({ code: "invalid_request" });
      }
      expect(catalog.list({ principalId, bbContextId })).toEqual([]);

      const persisted = await catalog.refresh({
        principalId,
        bbContextId,
        candidate: issued,
      });
      expect(persisted.payload).toMatchObject({
        native: { status: "absent", observedAt: 1_000 },
        capabilities: { fixture: false, harness: false, live: false },
      });
      expect(JSON.stringify(persisted)).not.toContain("spoofed");
      expect(JSON.stringify(persisted)).not.toContain("Spoofed target");
    } finally {
      catalog.close();
    }
  });
});
