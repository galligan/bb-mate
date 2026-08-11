import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

const currentProductSurfaces = [
  "AGENTS.md",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  ".bb/skills/update-bb-mate-compatibility/SKILL.md",
  ".bb/skills/update-bb-mate-compatibility/agents/openai.yaml",
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
  "apps/workbench/src/components/MateOverlay.tsx",
  "apps/workbench/src/components/PreviewCanvas.tsx",
  "apps/workbench/src/preview-mode.ts",
  "apps/workbench/src/surface-lab/SurfaceLab.tsx",
  "docs/architecture.md",
  "docs/compatibility-target.md",
  "docs/local-package.md",
  "docs/native-plugin-design-system.md",
  "docs/plugin-author-guide.md",
  "docs/plugin-publishing.md",
  "docs/plugin-workbench-capabilities.md",
  "docs/release-handoff.md",
  "docs/trust-model.md",
  "docs/visual-regression.md",
  "plugins/mate/README.md",
  "plugins/mate/package.json",
  "plugins/mate/skills/plugin-workbench/SKILL.md",
  "plugins/mate/src/frontend/plugin-app.tsx",
  "plugins/mate/src/frontend/workbench-boundary.tsx",
  "plugins/mate/src/frontend/workbench-snapshot.ts",
  "plugins/mate/visual/index.html",
  "plugins/mate/visual/main.tsx",
  "packages/inspection/src/native.ts",
  "packages/inspection/src/report.ts",
  "scripts/build-local-package.ts",
  "scripts/check-latest-bb.ts",
  "scripts/compatibility-check.ts",
  "scripts/mate-package-managed-clean-room.ts",
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

  test("keeps installed and published compatibility identities stable", async () => {
    const cliManifest = await Bun.file(
      `${repositoryRoot}/apps/cli/package.json`,
    ).json();
    expect(cliManifest.name).toBe("bb-mate");
    expect(cliManifest.description).toBe(
      "Build, inspect, and preview bb plugins.",
    );

    const manifest = await Bun.file(
      `${repositoryRoot}/plugins/mate/package.json`,
    ).json();
    expect(manifest.name).toBe("bb-plugin-mate");
    expect(manifest.bb.name).toBe("Plugin Studio");
    expect(manifest.bb.description).toBe(
      "Build, inspect, and preview bb plugins.",
    );
    expect(manifest.bb.skills).toEqual(["./skills/plugin-workbench"]);
    expect(manifest.files).toContain("runtime/darwin-arm64/bb-mate");

    const namingGuide = await Bun.file(
      `${repositoryRoot}/docs/product-naming.md`,
    ).text();
    expect(namingGuide).toContain("The product is **bb Plugin Studio**");
    expect(namingGuide).toContain("`bb-plugin-mate`");
    expect(namingGuide).toContain("`mate`, `plugins/mate`");
    expect(namingGuide).toContain(
      "A remove-and-reinstall migration is not acceptable",
    );

    const changelog = await Bun.file(`${repositoryRoot}/CHANGELOG.md`).text();
    expect(changelog).toContain("## Unreleased");
    expect(changelog).toContain("Rename the product to **bb Plugin Studio**");
    expect(changelog).toContain("Historical release notes below retain");
  });
});
