import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

const currentProductSurfaces = [
  "AGENTS.md",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  ".bb/skills/update-plugin-studio-compatibility/SKILL.md",
  ".bb/skills/update-plugin-studio-compatibility/agents/openai.yaml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/workflows/bb-compatibility-watch.yml",
  "compatibility/bb-target.schema.json",
  "apps/cli/package.json",
  "apps/cli/README.md",
  "apps/cli/THIRD_PARTY_NOTICES.md",
  "apps/cli/src/commands.ts",
  "apps/workbench/e2e/accessibility.spec.ts",
  "apps/workbench/e2e/harness/index.html",
  "apps/workbench/e2e/visual-regression.spec.ts",
  "apps/workbench/index.html",
  "apps/workbench/server/http-policy.ts",
  "apps/workbench/server/public-session.ts",
  "apps/workbench/src/components/BbShell.tsx",
  "apps/workbench/src/components/StudioOverlay.tsx",
  "apps/workbench/src/components/PreviewCanvas.tsx",
  "apps/workbench/src/preview-mode.ts",
  "apps/workbench/src/surface-lab/SurfaceLab.tsx",
  "docs/architecture.md",
  "docs/compatibility-target.md",
  "docs/local-package.md",
  "docs/native-plugin-design-system.md",
  "docs/plugin-author-guide.md",
  "docs/plugin-publishing.md",
  "docs/plugin-studio-capabilities.md",
  "docs/trust-model.md",
  "docs/visual-regression.md",
  "plugins/studio/README.md",
  "plugins/studio/package.json",
  "plugins/studio/skills/plugin-studio/SKILL.md",
  "plugins/studio/src/frontend/plugin-app.tsx",
  "plugins/studio/src/frontend/workbench-boundary.tsx",
  "plugins/studio/src/frontend/workbench-snapshot.ts",
  "plugins/studio/visual/index.html",
  "plugins/studio/visual/main.tsx",
  "packages/inspection/src/native.ts",
  "packages/inspection/src/report.ts",
  "scripts/build-local-package.ts",
  "scripts/check-latest-bb.ts",
  "scripts/compatibility-check.ts",
  "scripts/plugin-studio-package-managed-clean-room.ts",
  "scripts/package-clean-room.ts",
  "scripts/third-party-licenses.ts",
] as const;

describe("bb Plugin Studio product naming", () => {
  test("uses the final product name on every current product surface", async () => {
    const stale: string[] = [];
    for (const relative of currentProductSurfaces) {
      const text = await Bun.file(`${repositoryRoot}/${relative}`).text();
      if (
        text.includes("BB Mate") ||
        text.includes("Plugin Workbench") ||
        text.includes("galligan/bb-mate")
      ) {
        stale.push(relative);
      }
    }
    expect(stale).toEqual([]);
  });

  test("uses the canonical repository URL for the compatibility schema identity", async () => {
    const schema = await Bun.file(
      `${repositoryRoot}/compatibility/bb-target.schema.json`,
    ).json();
    expect(schema.$id).toBe(
      "https://raw.githubusercontent.com/galligan/bb-plugin-studio/main/compatibility/bb-target.schema.json",
    );
  });

  test("uses the renamed repository directory after fresh clone commands", async () => {
    for (const relative of ["CONTRIBUTING.md", "docs/plugin-author-guide.md"]) {
      const text = await Bun.file(`${repositoryRoot}/${relative}`).text();
      expect(text).toContain(
        "git clone https://github.com/galligan/bb-plugin-studio.git\ncd bb-plugin-studio",
      );
      expect(text).not.toContain("\ncd bb-mate\n");
    }
  });

  test("uses one canonical Studio package and command identity", async () => {
    const cliManifest = await Bun.file(
      `${repositoryRoot}/apps/cli/package.json`,
    ).json();
    expect(cliManifest.name).toBe("@bb-plugin-studio/cli");
    expect(cliManifest.description).toBe(
      "Build, inspect, and preview bb plugins.",
    );

    const manifest = await Bun.file(
      `${repositoryRoot}/plugins/studio/package.json`,
    ).json();
    expect(manifest.name).toBe("bb-plugin-studio");
    expect(manifest.bin).toEqual({
      "bb-plugin-studio": "./dist/cli.js",
    });
    expect(manifest.bb.name).toBe("Plugin Studio");
    expect(manifest.bb.description).toBe(
      "Build, inspect, and preview bb plugins.",
    );
    expect(manifest.bb.skills).toEqual(["./skills/plugin-studio"]);
    expect(manifest.files).toContain(
      "runtime/darwin-arm64/bb-plugin-studio-runtime",
    );

    const namingGuide = await Bun.file(
      `${repositoryRoot}/docs/product-naming.md`,
    ).text();
    expect(namingGuide).toContain("The product is **bb Plugin Studio**");
    expect(namingGuide).toContain("`bb-plugin-studio`");
    expect(namingGuide).not.toContain("`bb-plugin-mate`");

    const changelog = await Bun.file(`${repositoryRoot}/CHANGELOG.md`).text();
    expect(changelog).toContain("## Unreleased");
    expect(changelog).toContain("Rename the product to **bb Plugin Studio**");
    expect(changelog).toContain("Historical release notes below retain");
  });

  test("keeps the compatibility skill ID while using current Studio guidance", async () => {
    const [skill, agent] = await Promise.all([
      Bun.file(
        `${repositoryRoot}/.bb/skills/update-plugin-studio-compatibility/SKILL.md`,
      ).text(),
      Bun.file(
        `${repositoryRoot}/.bb/skills/update-plugin-studio-compatibility/agents/openai.yaml`,
      ).text(),
    ]);

    expect(skill).toContain("name: update-plugin-studio-compatibility");
    expect(agent).toContain("$update-plugin-studio-compatibility");
    expect(skill).toContain("bb plugin types --check plugins/studio");
    expect(skill).not.toContain("plugins/linear");
    expect(skill).toContain("Plugin Studio compatibility");
  });

  test("invokes the canonical package verification script from workflows", async () => {
    for (const relative of [
      ".github/workflows/ci.yml",
      ".github/workflows/bb-compatibility-watch.yml",
    ]) {
      const workflow = await Bun.file(`${repositoryRoot}/${relative}`).text();
      expect(workflow).toContain("bun run plugin-studio:package:test");
      expect(workflow).not.toContain("bun run studio:package:test");
      expect(workflow).not.toContain("bun run mate:package:test");
    }
  });

  test("keeps cross-platform tests separate from the macOS plugin artifact proof", async () => {
    const workspace = JSON.parse(
      await Bun.file(`${repositoryRoot}/package.json`).text(),
    ) as { scripts?: Record<string, string> };

    expect(workspace.scripts?.test).toBe("bun run test:unit");
    expect(workspace.scripts?.["test:unit"]).toBe(
      "bun --filter '*' test && bun test scripts",
    );
    expect(workspace.scripts?.["package:artifact"]).toBe(
      "bun scripts/build-plugin-studio-package.ts",
    );
    expect(workspace.scripts?.["package:inspect"]).toBe(
      "bun scripts/plugin-studio-package-clean-room.ts",
    );
    expect(workspace.scripts?.["package:test"]).toBe(
      "bun scripts/plugin-studio-package-clean-room.ts",
    );
    expect(workspace.scripts?.["plugin-studio:package:test"]).toBe(
      "bun scripts/plugin-studio-package-clean-room.ts",
    );
  });

  test("uses canonical active fixtures and keeps the real legacy issue marker", async () => {
    const [rpcFixture, workflow] = await Promise.all([
      Bun.file(
        `${repositoryRoot}/scripts/plugin-studio-managed-rpc.test.ts`,
      ).text(),
      Bun.file(
        `${repositoryRoot}/.github/workflows/bb-compatibility-watch.yml`,
      ).text(),
    ]);

    expect(rpcFixture).toContain('id: "bb_plugin_studio"');
    expect(rpcFixture).not.toContain("bb_mate");
    expect(workflow).toContain(
      'const marker = "<!-- bb-plugin-studio-compatibility-watch -->"',
    );
    expect(workflow).toContain(
      'const legacyMarker = "<!-- bb-mate-compatibility-watch -->"',
    );
  });
});
