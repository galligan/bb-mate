import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { OpaqueIdSchema } from "../contracts/ids.ts";
import {
  issueTrustedDevelopmentTargetCandidate,
  validateTrustedDevelopmentTargetCandidate,
} from "./trusted-candidate.ts";

const temporaryRoots: string[] = [];

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

describe("trusted development-target candidates", () => {
  test("accepts only an existing canonical directory with no caller identity fields", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(path.join(temporaryRoot, "bb-mate-root-"));
    temporaryRoots.push(parent);
    const pluginRoot = path.join(parent, "plugin");
    await fs.mkdir(pluginRoot);
    const canonicalRoot = await fs.realpath(pluginRoot);

    const issued = await issueTrustedDevelopmentTargetCandidate(
      candidate(canonicalRoot),
    );
    expect(Object.fromEntries(Object.entries(issued))).toEqual(
      candidate(canonicalRoot),
    );
    await expect(
      issueTrustedDevelopmentTargetCandidate({
        ...candidate(canonicalRoot),
        id: "x".repeat(32),
        bindings: {},
        path: canonicalRoot,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  test("rejects missing roots, symlink aliases, and mismatched admission kinds", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(path.join(temporaryRoot, "bb-mate-root-"));
    temporaryRoots.push(parent);
    const pluginRoot = path.join(parent, "plugin");
    const alias = path.join(parent, "alias");
    await fs.mkdir(pluginRoot);
    await fs.symlink(pluginRoot, alias);

    await expect(
      issueTrustedDevelopmentTargetCandidate(candidate(alias)),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      issueTrustedDevelopmentTargetCandidate(
        candidate(path.join(parent, "missing")),
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      issueTrustedDevelopmentTargetCandidate({
        ...candidate(await fs.realpath(pluginRoot)),
        rootKind: "explicit",
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  test("recognizes only the exact issued capability and rejects structural clones", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(path.join(temporaryRoot, "bb-mate-root-"));
    temporaryRoots.push(parent);
    const pluginRoot = path.join(parent, "plugin");
    await fs.mkdir(pluginRoot);
    const issued = await issueTrustedDevelopmentTargetCandidate(
      candidate(await fs.realpath(pluginRoot)),
    );

    await expect(
      validateTrustedDevelopmentTargetCandidate(issued),
    ).resolves.toBe(issued);
    for (const forged of [
      candidate(await fs.realpath(pluginRoot)),
      { ...issued },
      Object.create(issued) as unknown,
      Object.fromEntries(Object.entries(issued)),
    ]) {
      await expect(
        validateTrustedDevelopmentTargetCandidate(forged),
      ).rejects.toMatchObject({ code: "invalid_request" });
    }
    await fs.rm(pluginRoot, { recursive: true });
    await expect(
      validateTrustedDevelopmentTargetCandidate(issued),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});
