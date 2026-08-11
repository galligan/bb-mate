import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  assertMatePackagePaths,
  assertMateRuntimeStampEmbedded,
  createMateRuntimeStamp,
  createMateThirdPartyNotices,
  MATE_PACKAGE_ALLOWLIST,
  pinnedBunLicenseBytes,
  PINNED_BUN_LICENSE_SHA256,
} from "./mate-package-artifact.ts";
import { inspectStandalone } from "./inspect-standalone.ts";
import { generateThirdPartyLicenses } from "./third-party-licenses.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const expectedPackageName = "bb-plugin-mate";
const expectedPackageVersion = "0.1.0-alpha.2";
const expectedBbVersion = "0.36.0";
const expectedSdkVersion = "0.4.1";
const MAX_COMPRESSED_PACKAGE_BYTES = 128 * 1024 * 1024;
const MAX_EXPANDED_PACKAGE_BYTES = 256 * 1024 * 1024;
const MAX_NON_RUNTIME_FILE_BYTES = 16 * 1024 * 1024;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  assert(
    JSON.stringify(actual) === JSON.stringify(sortedExpected),
    `${label} keys differ: ${actual.join(", ")}.`,
  );
}

interface PackagedManifest {
  readonly [key: string]: unknown;
  name?: unknown;
  version?: unknown;
  private?: unknown;
  type?: unknown;
  license?: unknown;
  engines?: Record<string, unknown>;
  bb?: Record<string, unknown>;
  files?: unknown;
  scripts?: unknown;
  devDependencies?: unknown;
}

interface BuildMetadata {
  sdkMajor?: unknown;
  sdkVersion?: unknown;
  artifactFormatVersion?: unknown;
  pluginId?: unknown;
  pluginVersion?: unknown;
  builtWith?: Record<string, unknown>;
}

export function assertMatePackageMetadata(
  manifest: PackagedManifest,
  serverMetadata: BuildMetadata,
  appMetadata: BuildMetadata,
): void {
  assertExactKeys(
    manifest as Record<string, unknown>,
    ["bb", "engines", "files", "license", "name", "private", "type", "version"],
    "Mate package manifest",
  );
  assert(
    manifest.name === expectedPackageName &&
      manifest.version === expectedPackageVersion &&
      manifest.private === true &&
      manifest.type === "module" &&
      manifest.license === "MIT",
    "Unexpected Mate package identity or local-only publication guard.",
  );
  assertExactKeys(manifest.engines!, ["bb", "bbPluginSdk"], "Mate engines");
  assertExactKeys(
    manifest.bb!,
    ["app", "branding", "description", "name", "server", "skills"],
    "Mate bb manifest",
  );
  assert(
    JSON.stringify(manifest.files) ===
      JSON.stringify(
        MATE_PACKAGE_ALLOWLIST.filter((file) => file !== "package.json"),
      ),
    "Mate package files manifest differs from the exact payload allowlist.",
  );
  assert(
    manifest.engines?.bb === ">=0.36" &&
      manifest.engines?.bbPluginSdk === "^0.4.1",
    "Unexpected Mate engine requirements.",
  );
  assert(
    manifest.bb?.server === "./dist/server.js" &&
      manifest.bb?.app === "./dist/app.js",
    "Mate package entrypoints must reference built dist files.",
  );
  assert(
    manifest.bb?.name === "Plugin Studio" &&
      manifest.bb?.description === "Build, inspect, and preview bb plugins.",
    "Mate package plugin identity differs from the approved metadata.",
  );
  assert(
    JSON.stringify(manifest.bb?.branding) ===
      JSON.stringify({ icon: "Toolbox" }),
    "Mate package branding differs from the approved Toolbox icon.",
  );
  assert(
    JSON.stringify(manifest.bb?.skills) ===
      JSON.stringify(["./skills/plugin-workbench"]),
    "Mate package skill paths differ from the approved payload.",
  );
  assert(
    manifest.scripts === undefined && manifest.devDependencies === undefined,
    "Mate package may not contain private build configuration.",
  );
  for (const metadata of [serverMetadata, appMetadata]) {
    assert(
      metadata.sdkMajor === 0 &&
        metadata.sdkVersion === expectedSdkVersion &&
        metadata.artifactFormatVersion === 1 &&
        metadata.pluginId === "mate" &&
        metadata.pluginVersion === expectedPackageVersion &&
        metadata.builtWith?.bbVersion === expectedBbVersion &&
        metadata.builtWith?.pluginSdkVersion === expectedSdkVersion,
      "Unexpected Mate plugin build metadata.",
    );
  }
}

export function assertMateThirdPartyCoverage(
  notices: string,
  licenses: string,
  bunVersion: string,
): void {
  assert(
    notices.includes("Radix Slot") &&
      notices.includes("Radix Tooltip") &&
      notices.includes("bundled Zod protocol implementation") &&
      notices.includes(
        `compiled with and embeds the Bun ${bunVersion} runtime`,
      ) &&
      notices.includes("Bun itself is MIT-licensed") &&
      notices.includes("JavaScriptCore and WebKit under LGPL-2") &&
      notices.includes("local verification only") &&
      notices.includes("BUN_LICENSE.md") &&
      /^## @radix-ui\/react-slot@/mu.test(licenses) &&
      /^## @radix-ui\/react-tooltip@/mu.test(licenses) &&
      /^## zod@/mu.test(licenses),
    "Mate third-party notices do not cover the native component dependencies, bundled Zod, and the compiled runtime.",
  );
}

async function collectPackageFiles(
  root: string,
  directory = root,
): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPackageFiles(root, absolute)));
      continue;
    }
    assert(entry.isFile(), `Mate package contains a non-file: ${entry.name}`);
    const stat = await fs.lstat(absolute);
    assert(
      stat.isFile() && stat.nlink === 1,
      `Mate package contains a linked file: ${entry.name}`,
    );
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    assertMatePackageFileSize(relative, stat.size);
    files.push(relative);
  }
  return files.sort(compareText);
}

export function assertMatePackageFileSize(
  relative: string,
  size: number,
): void {
  if (relative !== "runtime/darwin-arm64/bb-mate") {
    assert(
      Number.isSafeInteger(size) &&
        size >= 0 &&
        size <= MAX_NON_RUNTIME_FILE_BYTES,
      `Mate package file is oversized: ${relative}.`,
    );
  }
}

export interface MatePackageInspection {
  runtimeSha256: string;
  runtimeSize: number;
  runtimeVersion: string;
  files: number;
}

export async function inspectMatePackageDirectory(
  packageRoot: string,
  canonicalStandaloneRoot?: string,
): Promise<MatePackageInspection> {
  const resolvedRoot = path.resolve(packageRoot);
  const paths = await collectPackageFiles(resolvedRoot);
  assertMatePackagePaths(paths);

  const runtimeRoot = path.join(resolvedRoot, "runtime", "darwin-arm64");
  const [
    packagedRuntime,
    canonicalRuntime,
    manifest,
    serverMetadata,
    appMetadata,
  ] = await Promise.all([
    inspectStandalone(runtimeRoot),
    inspectStandalone(canonicalStandaloneRoot),
    fs
      .readFile(path.join(resolvedRoot, "package.json"), "utf8")
      .then((value) => JSON.parse(value) as PackagedManifest),
    fs
      .readFile(path.join(resolvedRoot, "dist", "server.meta.json"), "utf8")
      .then((value) => JSON.parse(value) as BuildMetadata),
    fs
      .readFile(path.join(resolvedRoot, "dist", "app.meta.json"), "utf8")
      .then((value) => JSON.parse(value) as BuildMetadata),
  ]);
  assertMatePackageMetadata(manifest, serverMetadata, appMetadata);
  assert(
    JSON.stringify(packagedRuntime.manifest) ===
      JSON.stringify(canonicalRuntime.manifest),
    "Packaged runtime manifest differs from the canonical standalone manifest.",
  );
  const executableHeader = Buffer.alloc(16);
  const executable = await fs.open(packagedRuntime.executablePath, "r");
  try {
    await executable.read(executableHeader, 0, executableHeader.length, 0);
  } finally {
    await executable.close();
  }
  assert(
    executableHeader.readUInt32LE(12) === 2,
    "Packaged runtime Mach-O is not an executable file.",
  );
  const serverBundle = await fs.readFile(
    path.join(resolvedRoot, "dist", "server.js"),
    "utf8",
  );
  assertMateRuntimeStampEmbedded(
    serverBundle,
    createMateRuntimeStamp(
      packagedRuntime.manifest,
      packagedRuntime.manifestBytes,
    ),
  );
  const appBundle = await fs.readFile(
    path.join(resolvedRoot, "dist", "app.js"),
    "utf8",
  );
  for (const [name, bundle] of [
    ["server.js", serverBundle],
    ["app.js", appBundle],
  ] as const) {
    assert(
      !bundle.includes("sourcesContent") &&
        !bundle.includes("sourceMappingURL") &&
        !/^\/\/ (?:src\/|\.\.\/\.\.\/packages\/)/mu.test(bundle),
      `Mate package exposes workspace source names in dist/${name}.`,
    );
  }
  const [
    notices,
    licenses,
    sourceNotices,
    expectedLicenses,
    approvedLicense,
    approvedBunLicense,
    approvedSkill,
    approvedReadme,
    packagedLicense,
    packagedBunLicense,
    packagedSkill,
    packagedReadme,
  ] = await Promise.all([
    fs.readFile(path.join(resolvedRoot, "THIRD_PARTY_NOTICES.md"), "utf8"),
    fs.readFile(path.join(resolvedRoot, "THIRD_PARTY_LICENSES.md"), "utf8"),
    fs.readFile(
      path.join(repositoryRoot, "apps", "cli", "THIRD_PARTY_NOTICES.md"),
      "utf8",
    ),
    generateThirdPartyLicenses(),
    fs.readFile(path.join(repositoryRoot, "plugins", "mate", "LICENSE")),
    fs.readFile(path.join(repositoryRoot, "plugins", "mate", "BUN_LICENSE.md")),
    fs.readFile(
      path.join(
        repositoryRoot,
        "plugins",
        "mate",
        "skills",
        "plugin-workbench",
        "SKILL.md",
      ),
    ),
    fs.readFile(path.join(repositoryRoot, "plugins", "mate", "README.md")),
    fs.readFile(path.join(resolvedRoot, "LICENSE")),
    fs.readFile(path.join(resolvedRoot, "BUN_LICENSE.md")),
    fs.readFile(
      path.join(resolvedRoot, "skills", "plugin-workbench", "SKILL.md"),
    ),
    fs.readFile(path.join(resolvedRoot, "README.md")),
  ]);
  assertMateThirdPartyCoverage(
    notices,
    licenses,
    packagedRuntime.manifest.bunVersion,
  );
  assert(
    notices ===
      createMateThirdPartyNotices(
        sourceNotices,
        packagedRuntime.manifest.bunVersion,
      ) && licenses === expectedLicenses,
    "Mate third-party notice bytes differ from their generated sources.",
  );
  assert(
    createHash("sha256").update(packagedReadme).digest("hex") ===
      "dae96e1eb1edc711861b4f8354f16f27d1039c4ff193f8e73b8ad67f56c17cbe" &&
      Buffer.compare(packagedReadme, approvedReadme) === 0,
    "Mate packaged README differs from the approved usage document.",
  );
  assert(
    createHash("sha256").update(packagedLicense).digest("hex") ===
      "e417aaf9e252bd066a2d03c54789efa73f757a62daea00a8b1edba7efd453760" &&
      Buffer.compare(packagedLicense, approvedLicense) === 0,
    "Mate package LICENSE differs from the approved MIT license.",
  );
  assert(
    createHash("sha256").update(packagedBunLicense).digest("hex") ===
      PINNED_BUN_LICENSE_SHA256 &&
      Buffer.compare(
        packagedBunLicense,
        pinnedBunLicenseBytes(approvedBunLicense),
      ) === 0,
    "Mate package Bun license differs from the pinned Bun 1.3.14 license.",
  );
  const skillText = packagedSkill.toString("utf8");
  assert(
    createHash("sha256").update(packagedSkill).digest("hex") ===
      "f7c6d9e713b5cab3db697a37b011b468f8e8aa1fcf1e992adf5320a347858d66" &&
      Buffer.compare(packagedSkill, approvedSkill) === 0 &&
      skillText.startsWith("---\nname: plugin-workbench\ndescription:") &&
      skillText.includes("# Plugin Studio"),
    "Mate packaged skill identity differs from the approved plugin-workbench skill.",
  );
  for (const file of paths.filter((file) => !file.endsWith("/bb-mate"))) {
    const contents = await fs.readFile(path.join(resolvedRoot, file));
    assert(
      !contents.includes(Buffer.from(repositoryRoot)) &&
        !contents.includes(Buffer.from("/Users/mg/")),
      `Mate package leaks a checkout path in ${file}.`,
    );
  }
  return {
    runtimeSha256: packagedRuntime.manifest.sha256,
    runtimeSize: packagedRuntime.manifest.size,
    runtimeVersion: packagedRuntime.manifest.runtimeVersion,
    files: paths.length,
  };
}

async function runTar(
  tarExecutable: string,
  args: readonly string[],
  cwd: string,
): Promise<string> {
  const child = Bun.spawn([tarExecutable, ...args], {
    cwd,
    env: {},
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert(exitCode === 0, `tar failed: ${stderr.trim()}`);
  return stdout;
}

function readTarText(block: Uint8Array, start: number, length: number): string {
  const bytes = block.subarray(start, start + length);
  const nul = bytes.indexOf(0);
  return Buffer.from(nul === -1 ? bytes : bytes.subarray(0, nul)).toString(
    "utf8",
  );
}

export function gunzipMateTar(
  compressed: Uint8Array,
  maxOutputLength = MAX_EXPANDED_PACKAGE_BYTES,
): Buffer {
  return gunzipSync(Buffer.from(compressed), { maxOutputLength });
}

export function preflightMateTarBytes(compressed: Uint8Array): string[] {
  const archive = gunzipMateTar(compressed);
  const entries: string[] = [];
  let offset = 0;
  while (offset + 512 <= archive.byteLength) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarText(header, 0, 100);
    const prefix = readTarText(header, 345, 155);
    const entry = prefix ? `${prefix}/${name}` : name;
    assert(
      entry.length > 0 &&
        !/[\u0000-\u001f\u007f\\]/u.test(entry) &&
        !entry.startsWith("/") &&
        !entry.split("/").some((part) => part === ".." || part === ""),
      `Mate archive contains an unsafe raw header: ${JSON.stringify(entry)}.`,
    );
    const type = header[156];
    assert(
      type === 0 || type === 0x30,
      `Mate archive contains unsupported raw header type ${type} for ${entry}.`,
    );
    const sizeText = readTarText(header, 124, 12).trim();
    assert(
      /^[0-7]+$/u.test(sizeText),
      `Mate archive has invalid size for ${entry}.`,
    );
    const size = Number.parseInt(sizeText, 8);
    assert(
      Number.isSafeInteger(size) && size >= 0,
      `Mate archive has invalid size for ${entry}.`,
    );
    entries.push(entry);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const canonicalEnd = archive.subarray(offset);
  assert(
    canonicalEnd.byteLength === 1024 &&
      canonicalEnd.every((byte) => byte === 0),
    "Mate archive does not have one canonical end or contains trailing decompressed data.",
  );
  const expected = MATE_PACKAGE_ALLOWLIST.map((file) => `package/${file}`).sort(
    compareText,
  );
  assert(
    JSON.stringify([...entries].sort(compareText)) === JSON.stringify(expected),
    `Mate archive raw header allowlist mismatch: ${entries.join(", ")}`,
  );
  return entries;
}

export function assertSafeMateTarHeaders(
  paths: readonly string[],
  verboseLines: readonly string[],
): void {
  assert(
    paths.length === verboseLines.length,
    "Mate archive header listing is inconsistent.",
  );
  assert(
    new Set(paths).size === paths.length,
    "Mate archive has duplicate entries.",
  );
  for (let index = 0; index < paths.length; index += 1) {
    const entry = paths[index]!;
    const pathWithoutTrailingSlash = entry.endsWith("/")
      ? entry.slice(0, -1)
      : entry;
    const type = verboseLines[index]?.[0];
    assert(
      type === "-" || type === "d",
      `Mate archive contains a non-file archive entry: ${entry}`,
    );
    assert(
      !entry.includes("\\") &&
        (entry === "package/" ||
          (entry.startsWith("package/") &&
            !pathWithoutTrailingSlash
              .split("/")
              .some((part) => part === ".." || part === ""))),
      `Mate archive contains an unsafe entry: ${entry}`,
    );
  }
}

export async function inspectMatePackageArchive(
  archivePath: string,
  tarExecutable: string,
  canonicalStandaloneRoot?: string,
): Promise<MatePackageInspection> {
  assert(path.isAbsolute(tarExecutable), "tarExecutable must be absolute.");
  const resolvedArchive = path.resolve(archivePath);
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "bb-plugin-mate-inspect-"),
  );
  try {
    const archiveStat = await fs.lstat(resolvedArchive);
    assert(
      archiveStat.isFile() &&
        archiveStat.nlink === 1 &&
        archiveStat.size > 0 &&
        archiveStat.size <= MAX_COMPRESSED_PACKAGE_BYTES,
      "Mate archive must be one bounded regular file.",
    );
    preflightMateTarBytes(await fs.readFile(resolvedArchive));
    const listed = (
      await runTar(tarExecutable, ["-tzf", resolvedArchive], temporaryRoot)
    )
      .split("\n")
      .filter(Boolean);
    const verbose = (
      await runTar(tarExecutable, ["-tvzf", resolvedArchive], temporaryRoot)
    )
      .split("\n")
      .filter(Boolean);
    assertSafeMateTarHeaders(listed, verbose);
    await runTar(
      tarExecutable,
      ["-xzf", resolvedArchive, "--no-same-owner"],
      temporaryRoot,
    );
    return await inspectMatePackageDirectory(
      path.join(temporaryRoot, "package"),
      canonicalStandaloneRoot,
    );
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const archivePath = process.argv[2];
  const tarExecutable = process.env.BB_MATE_TAR_EXECUTABLE;
  if (!archivePath || !tarExecutable) {
    throw new Error(
      "Usage: BB_MATE_TAR_EXECUTABLE=/absolute/tar bun scripts/inspect-mate-package.ts <artifact.tgz>",
    );
  }
  console.log(
    JSON.stringify(
      await inspectMatePackageArchive(archivePath, tarExecutable),
      null,
      2,
    ),
  );
}
