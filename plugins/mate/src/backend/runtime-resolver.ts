import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

export interface RuntimeArtifactStamp {
  readonly schemaVersion: 1;
  readonly artifact: "bb-mate";
  readonly target: "bun-darwin-arm64";
  readonly platform: "darwin";
  readonly architecture: "arm64";
  readonly mode: "0755";
  readonly size: number;
  readonly sha256: string;
  readonly runtimeVersion: string;
  readonly expectedApiVersion: 1;
}

export type RuntimeArtifactUnavailableReason =
  | "unsupported-platform"
  | "invalid-stamp"
  | "artifact-unavailable"
  | "artifact-invalid";

export type RuntimeArtifactResolution =
  | {
      readonly kind: "available";
      readonly executablePath: string;
      readonly runtimeVersion: string;
      readonly apiVersion: 1;
      readonly size: number;
      readonly sha256: string;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: RuntimeArtifactUnavailableReason;
    };

const STAMP_KEYS = [
  "architecture",
  "artifact",
  "expectedApiVersion",
  "mode",
  "platform",
  "runtimeVersion",
  "schemaVersion",
  "sha256",
  "size",
  "target",
] as const;
const MAX_RUNTIME_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

interface RuntimeManifestAsset {
  readonly route: string;
  readonly size: number;
  readonly sha256: string;
}

function validAsset(value: RuntimeManifestAsset): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify(["route", "sha256", "size"]) &&
    typeof value.route === "string" &&
    value.route.length > 0 &&
    !value.route.startsWith("/") &&
    value.route.length <= 512 &&
    !/[\u0000-\u001f\u007f\\]/u.test(value.route) &&
    value.route
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== "..") &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0 &&
    value.size <= MAX_RUNTIME_BYTES &&
    /^[a-f0-9]{64}$/u.test(value.sha256)
  );
}

function validStamp(value: RuntimeArtifactStamp): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(STAMP_KEYS) &&
    value.schemaVersion === 1 &&
    value.artifact === "bb-mate" &&
    value.target === "bun-darwin-arm64" &&
    value.platform === "darwin" &&
    value.architecture === "arm64" &&
    value.mode === "0755" &&
    Number.isSafeInteger(value.size) &&
    value.size >= 16 &&
    value.size <= MAX_RUNTIME_BYTES &&
    /^[a-f0-9]{64}$/u.test(value.sha256) &&
    SEMVER.test(value.runtimeVersion) &&
    value.expectedApiVersion === 1
  );
}

function validManifest(value: Record<string, unknown>): boolean {
  const assets = Array.isArray(value.assets)
    ? (value.assets as RuntimeManifestAsset[])
    : [];
  return (
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([
        "architecture",
        "artifact",
        "assets",
        "bunVersion",
        "mode",
        "platform",
        "runtimeVersion",
        "schemaVersion",
        "sha256",
        "size",
        "storyCount",
        "target",
      ]) &&
    typeof value.bunVersion === "string" &&
    value.bunVersion.length >= 1 &&
    value.bunVersion.length <= 64 &&
    Number.isSafeInteger(value.storyCount) &&
    (value.storyCount as number) >= 0 &&
    (value.storyCount as number) <= 10_000 &&
    Array.isArray(value.assets) &&
    assets.length <= 10_000 &&
    assets.every(validAsset) &&
    assets.every(
      (asset, index) => index === 0 || assets[index - 1]!.route < asset.route,
    )
  );
}

function manifestStamp(
  manifest: Record<string, unknown>,
): RuntimeArtifactStamp {
  return {
    schemaVersion: manifest.schemaVersion as 1,
    artifact: manifest.artifact as "bb-mate",
    target: manifest.target as "bun-darwin-arm64",
    platform: manifest.platform as "darwin",
    architecture: manifest.architecture as "arm64",
    mode: manifest.mode as "0755",
    size: manifest.size as number,
    sha256: manifest.sha256 as string,
    runtimeVersion: manifest.runtimeVersion as string,
    expectedApiVersion: 1,
  };
}

function unavailable(
  reason: RuntimeArtifactUnavailableReason,
): RuntimeArtifactResolution {
  return { kind: "unavailable", reason };
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

function isMachOArm64Executable(bytes: Buffer): boolean {
  return (
    bytes.byteLength >= 16 &&
    bytes.readUInt32LE(0) === 0xfeedfacf &&
    bytes.readUInt32LE(4) === 0x0100000c &&
    bytes.readUInt32LE(12) === 2
  );
}

async function verifyManifest(
  manifestPath: string,
  stamp: RuntimeArtifactStamp,
): Promise<"valid" | "unavailable" | "invalid"> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  let bytes: Buffer;
  try {
    file = await open(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o7777) !== 0o644 ||
      stat.size < 2 ||
      stat.size > MAX_MANIFEST_BYTES
    ) {
      return "invalid";
    }
    bytes = await file.readFile();
    if (bytes.byteLength !== stat.size) return "invalid";
  } catch {
    return "unavailable";
  } finally {
    await file?.close();
  }

  try {
    const manifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as Record<string, unknown>;
    const candidate = manifestStamp(manifest);
    return validManifest(manifest) &&
      validStamp(candidate) &&
      isDeepStrictEqual(candidate, stamp)
      ? "valid"
      : "invalid";
  } catch {
    return "invalid";
  }
}

async function hasSafePackageComponents(
  packageRoot: string,
  modulePath: string,
  executablePath: string,
  manifestPath: string,
): Promise<boolean> {
  const paths = [
    packageRoot,
    path.dirname(modulePath),
    modulePath,
    path.join(packageRoot, "runtime"),
    path.join(packageRoot, "runtime", "darwin-arm64"),
    executablePath,
    manifestPath,
  ];
  try {
    const stats = await Promise.all(paths.map((candidate) => lstat(candidate)));
    return stats.every((stat, index) =>
      index === 0 || index === 1 || index === 3 || index === 4
        ? stat.isDirectory() && !stat.isSymbolicLink()
        : stat.isFile() && stat.nlink === 1 && !stat.isSymbolicLink(),
    );
  } catch {
    return false;
  }
}

export async function attestPackagedRuntime(
  artifact: Extract<RuntimeArtifactResolution, { kind: "available" }>,
): Promise<boolean> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(
      artifact.executablePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o7777) !== 0o755 ||
      stat.size !== artifact.size
    ) {
      return false;
    }
    const bytes = await file.readFile();
    return (
      bytes.byteLength === artifact.size &&
      isMachOArm64Executable(bytes) &&
      createHash("sha256").update(bytes).digest("hex") === artifact.sha256
    );
  } catch {
    return false;
  } finally {
    await file?.close();
  }
}

export async function resolvePackagedRuntime(options: {
  readonly stamp: RuntimeArtifactStamp;
  readonly moduleUrl?: string;
  readonly platform?: string;
  readonly architecture?: string;
}): Promise<RuntimeArtifactResolution> {
  if (!validStamp(options.stamp)) return unavailable("invalid-stamp");
  if (
    (options.platform ?? process.platform) !== options.stamp.platform ||
    (options.architecture ?? process.arch) !== options.stamp.architecture
  ) {
    return unavailable("unsupported-platform");
  }

  let packageRoot: string;
  let modulePath: string;
  let executablePath: string;
  let manifestPath: string;
  try {
    const moduleUrl = new URL(options.moduleUrl ?? import.meta.url);
    if (moduleUrl.protocol !== "file:") return unavailable("artifact-invalid");
    modulePath = fileURLToPath(moduleUrl);
    packageRoot = fileURLToPath(new URL("..", moduleUrl));
    executablePath = fileURLToPath(
      new URL("../runtime/darwin-arm64/bb-mate", moduleUrl),
    );
    manifestPath = fileURLToPath(
      new URL("../runtime/darwin-arm64/manifest.json", moduleUrl),
    );
    if (
      !(await hasSafePackageComponents(
        packageRoot,
        modulePath,
        executablePath,
        manifestPath,
      ))
    ) {
      return unavailable("artifact-invalid");
    }
    const [realRoot, realExecutable, realManifest] = await Promise.all([
      realpath(packageRoot),
      realpath(executablePath),
      realpath(manifestPath),
    ]);
    if (
      !isContained(realRoot, realExecutable) ||
      !isContained(realRoot, realManifest)
    ) {
      return unavailable("artifact-invalid");
    }
  } catch {
    return unavailable("artifact-unavailable");
  }

  const manifestState = await verifyManifest(manifestPath, options.stamp);
  if (manifestState !== "valid") {
    return unavailable(
      manifestState === "unavailable"
        ? "artifact-unavailable"
        : "artifact-invalid",
    );
  }

  const available = {
    kind: "available",
    executablePath,
    runtimeVersion: options.stamp.runtimeVersion,
    apiVersion: options.stamp.expectedApiVersion,
    size: options.stamp.size,
    sha256: options.stamp.sha256,
  } as const;
  return (await attestPackagedRuntime(available))
    ? available
    : unavailable("artifact-invalid");
}
