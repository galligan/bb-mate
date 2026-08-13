import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { discoverSourceCandidates } from "../packages/inspection/src/discover-source-candidates.ts";
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
import { openDevelopmentTargetCatalog } from "../packages/runtime/src/discovery/catalog.ts";
import { createInspectionDevelopmentTargetCandidateBridge } from "../packages/runtime/src/discovery/trusted-candidate.ts";
import { createDevelopmentTargetService } from "../packages/runtime/src/service/development-target-service.ts";

const ROOT_KEY = OpaqueIdSchema.parse("r".repeat(32));
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

async function createDiscoveredFixture() {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryRoot, "bb-plugin-studio-source-transition-"),
  );
  temporaryRoots.push(parent);
  const workspaceRoot = path.join(parent, "workspace");
  const pluginRoot = path.join(workspaceRoot, "plugins", "example");
  await fs.mkdir(path.join(pluginRoot, "dist"), { recursive: true });
  const manifest = JSON.stringify({
    name: "bb-plugin-example",
    version: "1.2.3",
    bb: {
      name: "Example plugin",
      description: "A passive source transition fixture.",
      branding: { icon: "extension" },
      server: "dist/server.js",
    },
  });
  await fs.writeFile(path.join(pluginRoot, "package.json"), manifest);
  await fs.writeFile(path.join(pluginRoot, "dist", "server.js"), "");
  const admission = await admitTrustedRoots([
    {
      rootKey: ROOT_KEY,
      kind: "current-project",
      path: workspaceRoot,
      displayName: "workspace",
    },
  ]);
  const discovery = await discoverSourceCandidates(admission.roots);
  expect(discovery.diagnostics).toEqual([]);
  expect(discovery.candidates).toHaveLength(1);
  return {
    parent,
    pluginRoot,
    manifest,
    candidate: discovery.candidates[0]!,
  };
}

describe("source discovery to development-target catalog", () => {
  test("rejects in-place manifest mutation during inspection-to-runtime transition", async () => {
    const fixture = await createDiscoveredFixture();
    const bridge = createInspectionDevelopmentTargetCandidateBridge({
      consumeIssuedSourceCandidate: (candidate, consumer) =>
        consumeIssuedSourceCandidate(candidate, async (transition) => {
          await fs.writeFile(
            path.join(fixture.pluginRoot, "package.json"),
            fixture.manifest.replace('"1.2.3"', '"9.9.9"'),
          );
          return await consumer(transition);
        }),
      readSourceCandidateTransition,
    });

    await expect(bridge.issue(fixture.candidate)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  test("rejects package inode replacement during inspection-to-runtime transition", async () => {
    const fixture = await createDiscoveredFixture();
    const packagePath = path.join(fixture.pluginRoot, "package.json");
    const bridge = createInspectionDevelopmentTargetCandidateBridge({
      consumeIssuedSourceCandidate: (candidate, consumer) =>
        consumeIssuedSourceCandidate(candidate, async (transition) => {
          await fs.rename(packagePath, `${packagePath}.original`);
          await fs.writeFile(packagePath, fixture.manifest);
          return await consumer(transition);
        }),
      readSourceCandidateTransition,
    });

    await expect(bridge.issue(fixture.candidate)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  test("rejects directory replacement during inspection-to-runtime transition", async () => {
    const fixture = await createDiscoveredFixture();
    const originalRoot = `${fixture.pluginRoot}.original`;
    const bridge = createInspectionDevelopmentTargetCandidateBridge({
      consumeIssuedSourceCandidate: (candidate, consumer) =>
        consumeIssuedSourceCandidate(candidate, async (transition) => {
          await fs.rename(fixture.pluginRoot, originalRoot);
          await fs.mkdir(path.join(fixture.pluginRoot, "dist"), {
            recursive: true,
          });
          await fs.writeFile(
            path.join(fixture.pluginRoot, "package.json"),
            fixture.manifest,
          );
          await fs.writeFile(
            path.join(fixture.pluginRoot, "dist", "server.js"),
            "",
          );
          return await consumer(transition);
        }),
      readSourceCandidateTransition,
    });

    await expect(bridge.issue(fixture.candidate)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  test("rejects manifest mutation after runtime issuance and before catalog persistence", async () => {
    const fixture = await createDiscoveredFixture();
    const bridge = createInspectionDevelopmentTargetCandidateBridge({
      consumeIssuedSourceCandidate,
      readSourceCandidateTransition,
    });
    const issued = await bridge.issue(fixture.candidate);
    await fs.writeFile(
      path.join(fixture.pluginRoot, "package.json"),
      fixture.manifest.replace('"1.2.3"', '"9.9.9"'),
    );
    const context = createRequestContext({
      id: PRINCIPAL_ID,
      kind: "plugin-adapter",
      scopes: ["targets:read", "targets:write"],
      revoked: false,
      bbContextId: BB_CONTEXT_ID,
    });
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: path.join(fixture.parent, "runtime-data"),
    });
    const service = createDevelopmentTargetService(catalog);

    await expect(
      service.refreshFromTrustedCandidate(context, issued),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(service.listTargets(context)).toEqual([]);
    catalog.close();
  });

  test("rejects a discovered candidate whose directory is replaced before runtime admission", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-plugin-studio-source-catalog-"),
    );
    temporaryRoots.push(parent);
    const workspaceRoot = path.join(parent, "workspace");
    const pluginRoot = path.join(workspaceRoot, "plugins", "example");
    const originalRoot = path.join(workspaceRoot, "plugins", "example-old");
    await fs.mkdir(path.join(pluginRoot, "dist"), { recursive: true });
    const manifest = JSON.stringify({
      name: "bb-plugin-example",
      version: "1.2.3",
      bb: {
        name: "Example plugin",
        description: "A passive source-catalog integration fixture.",
        branding: { icon: "extension" },
        server: "dist/server.js",
      },
    });
    await fs.writeFile(path.join(pluginRoot, "package.json"), manifest);
    await fs.writeFile(path.join(pluginRoot, "dist", "server.js"), "");
    const admission = await admitTrustedRoots([
      {
        rootKey: ROOT_KEY,
        kind: "current-project",
        path: workspaceRoot,
        displayName: "workspace",
      },
    ]);
    const discovery = await discoverSourceCandidates(admission.roots);
    const candidate = discovery.candidates[0]!;
    await fs.rename(pluginRoot, originalRoot);
    await fs.mkdir(path.join(pluginRoot, "dist"), { recursive: true });
    await fs.writeFile(path.join(pluginRoot, "package.json"), manifest);
    await fs.writeFile(path.join(pluginRoot, "dist", "server.js"), "");

    const bridge = createInspectionDevelopmentTargetCandidateBridge({
      consumeIssuedSourceCandidate,
      readSourceCandidateTransition,
    });

    await expect(bridge.issue(candidate)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  test("persists and reopens one passive source target without revealing or executing its root", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-plugin-studio-source-catalog-"),
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
          description: "A passive source-catalog integration fixture.",
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
    const discovery = await discoverSourceCandidates(admission.roots);
    expect(discovery.diagnostics).toEqual([]);
    expect(discovery.candidates).toHaveLength(1);
    const candidate = discovery.candidates[0]!;
    expect(candidate.canonicalRoot).toBe(pluginRoot);

    const bridge = createInspectionDevelopmentTargetCandidateBridge({
      consumeIssuedSourceCandidate,
      readSourceCandidateTransition,
      clock: () => 1_000,
    });
    for (const forged of [
      { ...candidate },
      {
        ...candidate,
        native: { status: "exact-path", pluginId: "spoofed" },
        capabilities: { fixture: true, harness: true, live: true },
      },
    ]) {
      await expect(bridge.issue(forged)).rejects.toMatchObject({
        code: "invalid_request",
      });
    }
    const issued = await bridge.issue(candidate);
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
    expect(service.listTargets(context)).toEqual([]);
    await expect(
      service.refreshFromTrustedCandidate(context, {
        ...candidate,
        native: { status: "exact-path" },
        capabilities: { fixture: true, harness: true, live: true },
      } as never),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(service.listTargets(context)).toEqual([]);
    const created = await service.refreshFromTrustedCandidate(context, issued);
    expect(String(created.id)).toBe(String(TARGET_ID));
    expect(created.revision).toBe(1);
    expect(created.native).toEqual({ status: "absent", observedAt: 1_000 });
    expect(created.capabilities).toEqual({
      fixture: false,
      harness: false,
      live: false,
    });
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
