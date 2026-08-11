import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PackageManifest {
  name: string;
  version: string;
  license?: string;
  dependencies?: Record<string, string>;
}

interface PackageRecord {
  manifest: PackageManifest;
  manifestPath: string;
}

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const workbenchManifest = path.join(
  repositoryRoot,
  "apps",
  "workbench",
  "package.json",
);
const inspectionManifest = path.join(
  repositoryRoot,
  "packages",
  "inspection",
  "package.json",
);
const runtimeManifest = path.join(
  repositoryRoot,
  "packages",
  "runtime",
  "package.json",
);
const mateManifest = path.join(
  repositoryRoot,
  "plugins",
  "mate",
  "package.json",
);

async function packageManifest(
  packageName: string,
  fromManifest: string,
): Promise<string> {
  const base = await fs.realpath(fromManifest);
  return fs.realpath(
    createRequire(base).resolve(`${packageName}/package.json`),
  );
}

async function addPackageTree(
  packageName: string,
  fromManifest: string,
  records: Map<string, PackageRecord>,
  recurse = true,
): Promise<string> {
  const manifestPath = await packageManifest(packageName, fromManifest);
  if (records.has(manifestPath)) return manifestPath;
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8"),
  ) as PackageManifest;
  records.set(manifestPath, { manifest, manifestPath });
  if (recurse) {
    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
      await addPackageTree(dependency, manifestPath, records);
    }
  }
  return manifestPath;
}

async function licenseFiles(record: PackageRecord): Promise<string[]> {
  const packageRoot = path.dirname(record.manifestPath);
  const files = (await fs.readdir(packageRoot))
    .filter((name) => /^(licen[cs]e|notice|copyright)/i.test(name))
    .sort();
  if (files.length > 0)
    return files.map((name) => path.join(packageRoot, name));

  if (record.manifest.name === "saxes") {
    return [
      path.join(
        repositoryRoot,
        "apps",
        "cli",
        "third-party",
        "saxes-LICENSE.txt",
      ),
    ];
  }
  if (record.manifest.name === "@hugeicons/core-free-icons") {
    const manifestPath = await packageManifest(
      "@hugeicons/react",
      workbenchManifest,
    );
    return [path.join(path.dirname(manifestPath), "LICENSE.md")];
  }
  throw new Error(
    `No license or notice file found for ${record.manifest.name}@${record.manifest.version}.`,
  );
}

export async function generateThirdPartyLicenses(): Promise<string> {
  const records = new Map<string, PackageRecord>();
  for (const name of [
    "@base-ui/react",
    "@fontsource-variable/geist",
    "@fontsource-variable/inter",
    "@hugeicons/core-free-icons",
    "@hugeicons/react",
    "class-variance-authority",
    "clsx",
    "lucide-react",
    "react",
    "react-dom",
    "tailwind-merge",
    "tw-animate-css",
  ]) {
    await addPackageTree(name, workbenchManifest, records);
  }

  const ladleManifest = await addPackageTree(
    "@ladle/react",
    workbenchManifest,
    records,
    false,
  );
  for (const name of [
    "@ladle/react-context",
    "@mdx-js/react",
    "classnames",
    "debug",
    "history",
    "lodash.merge",
    "prism-react-renderer",
    "prop-types",
    "query-string",
    "react-hotkeys-hook",
    "react-inspector",
    "scheduler",
    "tslib",
  ]) {
    await addPackageTree(name, ladleManifest, records);
  }

  for (const name of ["saxes", "semver"]) {
    await addPackageTree(name, inspectionManifest, records);
  }
  await addPackageTree("zod", runtimeManifest, records);
  for (const name of ["@radix-ui/react-slot", "@radix-ui/react-tooltip"]) {
    await addPackageTree(name, mateManifest, records);
  }

  const sections = [
    "# Third-party licenses and copyright notices",
    "",
    "This generated file accompanies the flattened BB Mate CLI, surface-lab, and Plugin Workbench output. It reproduces the complete license and copyright files shipped by the exact installed runtime packages, followed by notices for code embedded in Ladle's distributed client. It does not license BB Mate itself.",
    "",
  ];
  const sorted = [...records.values()].sort((left, right) =>
    `${left.manifest.name}@${left.manifest.version}`.localeCompare(
      `${right.manifest.name}@${right.manifest.version}`,
    ),
  );
  for (const record of sorted) {
    sections.push(
      `## ${record.manifest.name}@${record.manifest.version}`,
      "",
      `Declared license: ${record.manifest.license ?? "not declared"}`,
      "",
    );
    for (const file of await licenseFiles(record)) {
      sections.push(
        `### ${path.basename(file)}`,
        "",
        (await fs.readFile(file, "utf8")).replaceAll("\r\n", "\n").trim(),
        "",
      );
    }
  }

  sections.push(
    (
      await fs.readFile(
        path.join(
          repositoryRoot,
          "apps",
          "cli",
          "third-party",
          "embedded-ladle-notices.md",
        ),
        "utf8",
      )
    ).trim(),
    "",
  );
  return `${sections.join("\n")}\n`;
}
