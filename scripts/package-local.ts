import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateThirdPartyLicenses } from "./third-party-licenses.ts";

interface PackFile {
  path: string;
}

interface PackResult {
  filename: string;
  files: PackFile[];
  integrity: string;
  shasum: string;
}

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const artifactRoot = path.join(repositoryRoot, "artifacts");
const stagingRoot = path.join(artifactRoot, "package");
const cliRoot = path.join(repositoryRoot, "apps", "cli");
const dryRun = process.argv.includes("--dry-run");

async function runCapture(args: readonly string[]): Promise<string> {
  const child = Bun.spawn([...args], {
    cwd: repositoryRoot,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `${args.join(" ")} exited with code ${exitCode}: ${stderr.trim()}`,
    );
  }
  if (stderr.trim()) process.stderr.write(stderr);
  return stdout;
}

await runCapture([process.execPath, "scripts/build-local-package.ts"]);
await fs.mkdir(artifactRoot, { recursive: true });
await fs.rm(stagingRoot, { recursive: true, force: true });
await fs.mkdir(stagingRoot, { recursive: true });

const sourceManifest = JSON.parse(
  await fs.readFile(path.join(cliRoot, "package.json"), "utf8"),
) as Record<string, unknown>;
const stagedManifest = Object.fromEntries(
  [
    "name",
    "version",
    "description",
    "license",
    "keywords",
    "type",
    "bin",
    "files",
    "engines",
    "bbMate",
    "publishConfig",
  ].map((key) => [key, sourceManifest[key]]),
);
await Promise.all([
  fs.writeFile(
    path.join(stagingRoot, "package.json"),
    `${JSON.stringify(stagedManifest, null, 2)}\n`,
  ),
  fs.copyFile(
    path.join(repositoryRoot, "LICENSE"),
    path.join(stagingRoot, "LICENSE"),
  ),
  fs.copyFile(
    path.join(cliRoot, "README.md"),
    path.join(stagingRoot, "README.md"),
  ),
  fs.copyFile(
    path.join(cliRoot, "THIRD_PARTY_NOTICES.md"),
    path.join(stagingRoot, "THIRD_PARTY_NOTICES.md"),
  ),
  generateThirdPartyLicenses().then((licenses) =>
    fs.writeFile(path.join(stagingRoot, "THIRD_PARTY_LICENSES.md"), licenses),
  ),
  fs.cp(path.join(cliRoot, "dist"), path.join(stagingRoot, "dist"), {
    recursive: true,
  }),
]);

const output = await runCapture([
  "npm",
  "pack",
  stagingRoot,
  "--pack-destination",
  artifactRoot,
  "--json",
  "--ignore-scripts",
  ...(dryRun ? ["--dry-run"] : []),
]);
const parsed = JSON.parse(output) as PackResult[];
const result = parsed[0];
if (!result || parsed.length !== 1) {
  throw new Error("npm pack did not return exactly one artifact.");
}

const paths = result.files.map((file) => file.path);
const unexpected = paths.filter(
  (file) =>
    file !== "package.json" &&
    file !== "LICENSE" &&
    file !== "README.md" &&
    file !== "THIRD_PARTY_NOTICES.md" &&
    file !== "THIRD_PARTY_LICENSES.md" &&
    file !== "dist/cli.js" &&
    !file.startsWith("dist/lab/"),
);
if (unexpected.length > 0) {
  throw new Error(`Package allowlist violation: ${unexpected.join(", ")}`);
}
for (const required of [
  "package.json",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "THIRD_PARTY_LICENSES.md",
  "dist/cli.js",
  "dist/lab/index.html",
  "dist/lab/meta.json",
]) {
  if (!paths.includes(required)) {
    throw new Error(`Package is missing required file: ${required}`);
  }
}

console.log(
  JSON.stringify(
    {
      artifact: path.join("artifacts", result.filename),
      dryRun,
      files: paths.length,
      integrity: result.integrity,
      shasum: result.shasum,
    },
    null,
    2,
  ),
);
