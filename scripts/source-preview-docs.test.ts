import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

describe("bb Plugin Studio source preview documentation", () => {
  test("presents source checkout as the supported first-contact path", async () => {
    const readme = await Bun.file(`${repositoryRoot}/README.md`).text();
    const preview = await Bun.file(
      `${repositoryRoot}/docs/source-preview.md`,
    ).text();
    const packageReadme = await Bun.file(
      `${repositoryRoot}/apps/cli/README.md`,
    ).text();
    const support = await Bun.file(`${repositoryRoot}/SUPPORT.md`).text();
    const authorGuide = await Bun.file(
      `${repositoryRoot}/docs/plugin-author-guide.md`,
    ).text();
    const packageProse = packageReadme.replace(/\s+/gu, " ");
    const authorProse = authorGuide.replace(/\s+/gu, " ");

    for (const firstContactSurface of [readme, packageReadme]) {
      expect(firstContactSurface).not.toContain(
        "npm install --global bb-mate@alpha",
      );
      expect(firstContactSurface).toContain(
        "`bb-mate` is the current compatibility command",
      );
    }

    expect(readme).not.toContain("img.shields.io/npm/v/bb-mate");
    expect(readme).toContain("## Try the source preview");
    expect(readme).toContain("[Source preview guide](docs/source-preview.md)");

    expect(preview).toContain(
      "git clone https://github.com/galligan/bb-plugin-studio.git\ncd bb-plugin-studio",
    );
    expect(preview).toContain("bun install --frozen-lockfile");
    expect(preview).toContain("bun run bb-mate --help");
    expect(preview).toContain("bun run dev");
    expect(preview).toContain(
      "bb Plugin Studio is not currently distributed as a public installable package",
    );
    expect(preview).toMatch(
      /`bb-mate` is a\s+compatibility identifier for the current CLI command/,
    );
    expect(preview).toMatch(
      /Live bb is the visual\s+and integration authority/,
    );

    expect(packageProse).toContain(
      "The CLI package contains the command and deterministic static plugin-surface lab",
    );
    expect(packageProse).not.toContain("The source workspace contains a CLI");
    expect(packageProse).toContain(
      "The source development server exposes a bounded inspection session",
    );
    expect(packageProse).toContain(
      "the packaged static lab does not serve inspection data over HTTP",
    );
    expect(packageProse).not.toContain(
      "it never serves inspection data over HTTP",
    );
    expect(authorProse).toContain(
      "native bb 0.36.0 or newer, verified through 0.37.0",
    );
    expect(authorProse).toContain(
      "Newer releases remain usable with a nonfatal audit notice",
    );
    expect(authorProse).not.toContain(
      "native bb 0.36.0, the currently recorded target",
    );
    for (const maintainedGuide of [support, authorGuide]) {
      expect(maintainedGuide).not.toContain("bb-mate@alpha");
      expect(maintainedGuide).toContain("source preview");
    }
  });
});
