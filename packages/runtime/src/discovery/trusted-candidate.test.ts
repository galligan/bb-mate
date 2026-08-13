import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { OpaqueIdSchema } from "../contracts/ids.ts";
import { RuntimeError } from "../errors.ts";
import {
  inspectDevelopmentSourceIdentity,
  sameDevelopmentSourceIdentity,
} from "./source-identity.ts";
import {
  createInspectionDevelopmentTargetCandidateBridge,
  validateTrustedDevelopmentTargetCandidate,
  type InspectionSourceCandidateFacts,
} from "./trusted-candidate.ts";

const temporaryRoots: string[] = [];

async function writeManifest(root: string, version = "1.2.3") {
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "bb-plugin-notes", version }),
  );
}

function createInspectionHarness(clock = () => 1_000) {
  const issuedFacts = new WeakMap<object, InspectionSourceCandidateFacts>();
  const consumedCandidates = new WeakSet<object>();
  const activeTransitions = new WeakMap<object, unknown>();
  const bridge = createInspectionDevelopmentTargetCandidateBridge({
    clock,
    async consumeIssuedSourceCandidate(candidate, consumer) {
      if (typeof candidate !== "object" || candidate === null) {
        throw new RuntimeError("invalid_request");
      }
      const value = issuedFacts.get(candidate);
      if (!value || consumedCandidates.has(candidate)) {
        throw new RuntimeError("invalid_request");
      }
      consumedCandidates.add(candidate);
      const before = await inspectDevelopmentSourceIdentity(
        value.canonicalRoot,
      );
      const transition = Object.freeze({ transition: true });
      activeTransitions.set(
        transition,
        Object.freeze({
          ...value,
          directoryIdentity: Object.freeze({
            canonicalRoot: before.canonicalRoot,
            device: before.device,
            inode: before.inode,
          }),
          manifestIdentity: Object.freeze({ ...before.manifest }),
        }),
      );
      try {
        const result = await consumer(transition);
        const after = await inspectDevelopmentSourceIdentity(
          value.canonicalRoot,
        );
        if (!sameDevelopmentSourceIdentity(before, after)) {
          throw new RuntimeError("invalid_request");
        }
        return result;
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

describe("trusted development-target candidates", () => {
  test("issues only through an active inspection transition", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-plugin-studio-root-"),
    );
    temporaryRoots.push(parent);
    const pluginRoot = path.join(parent, "plugin");
    await fs.mkdir(pluginRoot);
    await writeManifest(pluginRoot);
    const harness = createInspectionHarness();
    const source = harness.issueSourceCandidate(
      facts(await fs.realpath(pluginRoot)),
    );

    const issued = await harness.bridge.issue(source);

    expect(issued.canonicalRoot).toBe(await fs.realpath(pluginRoot));
    await expect(harness.bridge.issue(source)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  test("derives conservative target state only from an issued inspection candidate", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-plugin-studio-root-"),
    );
    temporaryRoots.push(parent);
    const pluginRoot = path.join(parent, "plugin");
    await fs.mkdir(pluginRoot);
    await writeManifest(pluginRoot);
    const canonicalRoot = await fs.realpath(pluginRoot);
    const harness = createInspectionHarness();
    const source = harness.issueSourceCandidate(facts(canonicalRoot), {
      native: { status: "exact-path" },
      capabilities: { fixture: true, harness: true, live: true },
    });

    const issued = await harness.bridge.issue(source);

    expect(issued.target).toMatchObject({
      displayName: "Notes",
      displayPath: "plugins/notes",
      sourceKind: "workspace-discovered",
      native: { status: "absent", observedAt: 1_000 },
      capabilities: { fixture: false, harness: false, live: false },
    });
    await expect(
      harness.bridge.issue(facts(canonicalRoot)),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(harness.bridge.issue({ ...source })).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  test("rejects missing roots, symlink aliases, and invalid discovery facts", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-plugin-studio-root-"),
    );
    temporaryRoots.push(parent);
    const pluginRoot = path.join(parent, "plugin");
    const alias = path.join(parent, "alias");
    await fs.mkdir(pluginRoot);
    await fs.symlink(pluginRoot, alias);
    const harness = createInspectionHarness();

    for (const invalidFacts of [
      facts(alias),
      facts(path.join(parent, "missing")),
      { ...facts(await fs.realpath(pluginRoot)), rootKind: "unknown" },
    ]) {
      const source = harness.issueSourceCandidate(invalidFacts as never);
      await expect(harness.bridge.issue(source)).rejects.toMatchObject({
        code: "invalid_request",
      });
    }
  });

  test("rejects filesystem-wide, home, and ignored source roots", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-plugin-studio-root-"),
    );
    temporaryRoots.push(parent);
    const ignoredRoot = path.join(parent, "node_modules", "plugin");
    await fs.mkdir(ignoredRoot, { recursive: true });
    const canonicalHome = await fs.realpath(os.homedir());
    const harness = createInspectionHarness();

    for (const forbidden of [
      await fs.realpath(path.parse(parent).root),
      canonicalHome,
      path.dirname(canonicalHome),
      await fs.realpath(ignoredRoot),
    ]) {
      const source = harness.issueSourceCandidate(facts(forbidden));
      await expect(harness.bridge.issue(source)).rejects.toMatchObject({
        code: "invalid_request",
      });
    }
  });

  test("recognizes only the exact runtime capability and its source identity", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-plugin-studio-root-"),
    );
    temporaryRoots.push(parent);
    const pluginRoot = path.join(parent, "plugin");
    await fs.mkdir(pluginRoot);
    await writeManifest(pluginRoot);
    const harness = createInspectionHarness();
    const issued = await harness.bridge.issue(
      harness.issueSourceCandidate(facts(await fs.realpath(pluginRoot))),
    );

    await expect(
      validateTrustedDevelopmentTargetCandidate(issued),
    ).resolves.toBe(issued);
    for (const forged of [
      { ...issued },
      Object.create(issued) as unknown,
      Object.fromEntries(Object.entries(issued)),
    ]) {
      await expect(
        validateTrustedDevelopmentTargetCandidate(forged),
      ).rejects.toMatchObject({ code: "invalid_request" });
    }
    const originalRoot = path.join(parent, "original-plugin");
    await fs.rename(pluginRoot, originalRoot);
    await fs.mkdir(pluginRoot);
    await expect(
      validateTrustedDevelopmentTargetCandidate(issued),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  test("rejects manifest mutation after runtime issuance and before persistence", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-plugin-studio-root-"),
    );
    temporaryRoots.push(parent);
    const pluginRoot = path.join(parent, "plugin");
    await fs.mkdir(pluginRoot);
    await writeManifest(pluginRoot);
    const harness = createInspectionHarness();
    const issued = await harness.bridge.issue(
      harness.issueSourceCandidate(facts(await fs.realpath(pluginRoot))),
    );
    await writeManifest(pluginRoot, "9.9.9");

    await expect(
      validateTrustedDevelopmentTargetCandidate(issued),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});
