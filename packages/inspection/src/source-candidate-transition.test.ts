import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { discoverSourceCandidates } from "./discover-source-candidates.ts";
import {
  createDiscoveryTestHarness,
  WORKSPACE_ROOT_KEY,
} from "./discovery-test-helpers.ts";
import {
  consumeIssuedSourceCandidate,
  readSourceCandidateTransition,
} from "./source-candidate-transition.ts";
import { admitTrustedRoots } from "./trusted-roots.ts";

const harness = createDiscoveryTestHarness();

afterEach(() => harness.cleanup());

describe("source candidate transitions", () => {
  test("consumes only an exact issued candidate through a one-use transition", async () => {
    const rootPath = await harness.createRoot();
    await harness.writePlugin(rootPath, "issued");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "pinned", path: rootPath },
    ]);
    const result = await discoverSourceCandidates(admission.roots);
    const candidate = result.candidates[0]!;

    let capturedTransition: unknown;
    const first = await consumeIssuedSourceCandidate(
      candidate,
      async (transition) => {
        capturedTransition = transition;
        return readSourceCandidateTransition(transition);
      },
    );

    expect(first).toMatchObject({
      rootKey: WORKSPACE_ROOT_KEY,
      rootKind: "pinned",
      canonicalRoot: await fs.realpath(rootPath),
      displayPath: "workspace",
      packageName: "bb-plugin-issued",
      version: "1.2.3",
      pluginId: "issued",
      displayName: "issued",
      hasServer: true,
      hasApp: false,
      directoryIdentity: { canonicalRoot: await fs.realpath(rootPath) },
    });
    expect(first.manifestIdentity.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(first)).toBeTrue();
    expect(Object.isFrozen(first.directoryIdentity)).toBeTrue();
    expect(Object.isFrozen(first.manifestIdentity)).toBeTrue();
    expect(() => readSourceCandidateTransition(capturedTransition)).toThrow(
      "source candidate transition is not active",
    );
    await expect(
      consumeIssuedSourceCandidate(candidate, async () => null),
    ).rejects.toThrow("source candidate was not issued by discovery");
    for (const forged of [
      { ...candidate },
      Object.create(candidate) as unknown,
      null,
    ]) {
      await expect(
        consumeIssuedSourceCandidate(forged, async () => null),
      ).rejects.toThrow("source candidate was not issued by discovery");
    }
  });

  test("rejects a candidate directory replaced inside its transition", async () => {
    const rootPath = await harness.createRoot();
    const candidateRoot = path.join(rootPath, "plugin");
    const originalRoot = path.join(rootPath, "plugin-original");
    await fs.mkdir(candidateRoot);
    await harness.writePlugin(candidateRoot, "issued");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
    ]);
    const result = await discoverSourceCandidates(admission.roots);
    const candidate = result.candidates[0]!;

    await expect(
      consumeIssuedSourceCandidate(candidate, async (transition) => {
        readSourceCandidateTransition(transition);
        await fs.rename(candidateRoot, originalRoot);
        await fs.mkdir(candidateRoot);
        await harness.writePlugin(candidateRoot, "replacement");
      }),
    ).rejects.toThrow("source candidate was not issued by discovery");
  });

  test("rejects a bounded manifest changed inside its transition", async () => {
    const rootPath = await harness.createRoot();
    await harness.writePlugin(rootPath, "issued");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
    ]);
    const result = await discoverSourceCandidates(admission.roots);
    const candidate = result.candidates[0]!;

    await expect(
      consumeIssuedSourceCandidate(candidate, async (transition) => {
        readSourceCandidateTransition(transition);
        await fs.appendFile(path.join(rootPath, "package.json"), " \n");
      }),
    ).rejects.toThrow("source candidate was not issued by discovery");
  });

  test("rejects a bounded manifest inode replaced inside its transition", async () => {
    const rootPath = await harness.createRoot();
    await harness.writePlugin(rootPath, "issued");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
    ]);
    const result = await discoverSourceCandidates(admission.roots);
    const candidate = result.candidates[0]!;
    const packagePath = path.join(rootPath, "package.json");
    const replacementPath = path.join(rootPath, "replacement.json");
    await fs.copyFile(packagePath, replacementPath);

    await expect(
      consumeIssuedSourceCandidate(candidate, async (transition) => {
        const facts = readSourceCandidateTransition(transition);
        expect(() =>
          readSourceCandidateTransition(Object.assign({}, transition)),
        ).toThrow("source candidate transition is not active");
        await fs.rename(replacementPath, packagePath);
        return facts;
      }),
    ).rejects.toThrow("source candidate was not issued by discovery");
  });
});
