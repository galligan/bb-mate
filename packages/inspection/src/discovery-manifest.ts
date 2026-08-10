import path from "node:path";
import type {
  IssuedSourceCandidateFacts,
  SourceCandidate,
  TrustedRoot,
} from "./discovery-types.ts";
import { readBoundedPluginIcon } from "./discovery-asset-reader.ts";
import { DiscoveryFailure } from "./discovery-errors.ts";
import {
  readBoundedManifestSnapshot,
  type BoundedManifestSnapshot,
} from "./discovery-manifest-reader.ts";
import {
  attestScanDirectory,
  displayPathFor,
  isContained,
  validateDeclaredPath,
} from "./discovery-path-safety.ts";
import { assertValidCompactSvg } from "./svg.ts";
import { trustedRootDetails } from "./trusted-roots.ts";

const MAX_MANIFEST_STRING_CHARACTERS = 8192;
const MAX_DISPLAY_NAME_CHARACTERS = 128;
const MAX_PACKAGE_NAME_CHARACTERS = 214;
const MAX_VERSION_CHARACTERS = 64;
const MAX_PLUGIN_ID_CHARACTERS = 64;

const issuedCandidates = new WeakMap<
  object,
  {
    readonly root: TrustedRoot;
    readonly facts: IssuedSourceCandidateFacts;
    readonly directoryIdentity: CandidateDirectoryIdentity;
    readonly manifestIdentity: BoundedManifestSnapshot;
  }
>();

interface CandidateDirectoryIdentity {
  readonly canonicalPath: string;
  readonly device: number;
  readonly inode: number;
}

export async function candidateAtRoot(
  root: TrustedRoot,
  candidateRoot: string,
  relativeRoot: string,
): Promise<SourceCandidate | null> {
  const manifest = await readBoundedManifestSnapshot(
    path.join(candidateRoot, "package.json"),
  );
  if (manifest === null) return null;
  const packageJson = record(JSON.parse(manifest.source) as unknown);
  if (!packageJson) throw invalid("package.json must contain an object");
  const bb = record(packageJson.bb);
  if (!bb) return null;
  validateEngines(packageJson.engines);
  rejectUnknownKeys(
    bb,
    ["name", "description", "branding", "server", "app", "skills", "themes"],
    "bb",
  );
  const packageName = requiredString(
    packageJson.name,
    "name",
    MAX_PACKAGE_NAME_CHARACTERS,
  );
  const version = requiredString(
    packageJson.version,
    "version",
    MAX_VERSION_CHARACTERS,
  );
  const displayName = requiredString(
    bb.name,
    "bb.name",
    MAX_DISPLAY_NAME_CHARACTERS,
  );
  requiredString(bb.description, "bb.description");
  await validateDeclaredPath(
    candidateRoot,
    requiredString(bb.server, "bb.server"),
    "bb.server",
    "file",
  );
  const app =
    bb.app === undefined ? undefined : requiredString(bb.app, "bb.app");
  if (app) await validateDeclaredPath(candidateRoot, app, "bb.app", "file");
  await validateSkills(candidateRoot, bb.skills);
  await validateBranding(candidateRoot, bb.branding);
  await validateThemes(candidateRoot, bb.themes);

  const pluginId = derivePluginId(packageName);
  const candidate: SourceCandidate = {
    rootKey: root.rootKey,
    canonicalRoot: candidateRoot,
    displayPath: displayPathFor(root, relativeRoot),
    packageName,
    version,
    pluginId,
    displayName,
    hasServer: true,
    hasApp: app !== undefined,
  };
  Object.defineProperty(candidate, "toJSON", {
    enumerable: false,
    value: () => {
      throw new TypeError("source candidates are server-private");
    },
  });
  Object.freeze(candidate);
  const directoryIdentity = await captureCandidateDirectoryIdentity(
    root,
    candidateRoot,
  );
  issuedCandidates.set(candidate, {
    root,
    facts: Object.freeze({
      ...candidate,
      rootKind: root.kind,
    }),
    directoryIdentity,
    manifestIdentity: manifest,
  });
  return candidate;
}

export async function readIssuedSourceCandidate(
  candidate: unknown,
): Promise<Readonly<IssuedSourceCandidateFacts>> {
  try {
    if (typeof candidate !== "object" || candidate === null) throw notIssued();
    const issued = issuedCandidates.get(candidate);
    if (!issued) throw notIssued();
    const rootDetails = trustedRootDetails(issued.root);
    if (
      issued.facts.rootKey !== issued.root.rootKey ||
      issued.facts.rootKind !== issued.root.kind ||
      !isContained(rootDetails.canonicalRoot, issued.facts.canonicalRoot)
    ) {
      throw notIssued();
    }
    const before = await captureCandidateDirectoryIdentity(
      issued.root,
      issued.facts.canonicalRoot,
    );
    if (!sameDirectoryIdentity(before, issued.directoryIdentity)) {
      throw notIssued();
    }
    const manifest = await readBoundedManifestSnapshot(
      path.join(issued.facts.canonicalRoot, "package.json"),
    );
    if (
      manifest === null ||
      manifest.device !== issued.manifestIdentity.device ||
      manifest.inode !== issued.manifestIdentity.inode ||
      manifest.sha256 !== issued.manifestIdentity.sha256
    ) {
      throw notIssued();
    }
    const after = await captureCandidateDirectoryIdentity(
      issued.root,
      issued.facts.canonicalRoot,
    );
    if (!sameDirectoryIdentity(after, issued.directoryIdentity)) {
      throw notIssued();
    }
    return Object.freeze({ ...issued.facts });
  } catch {
    throw notIssued();
  }
}

async function captureCandidateDirectoryIdentity(
  root: TrustedRoot,
  candidateRoot: string,
): Promise<CandidateDirectoryIdentity> {
  const attestation = await attestScanDirectory(
    candidateRoot,
    trustedRootDetails(root).canonicalRoot,
  );
  if (attestation.canonicalPath !== candidateRoot) throw notIssued();
  return {
    canonicalPath: attestation.canonicalPath,
    device: attestation.dev,
    inode: attestation.ino,
  };
}

function sameDirectoryIdentity(
  left: CandidateDirectoryIdentity,
  right: CandidateDirectoryIdentity,
): boolean {
  return (
    left.canonicalPath === right.canonicalPath &&
    left.device === right.device &&
    left.inode === right.inode
  );
}

async function validateSkills(
  candidateRoot: string,
  value: unknown,
): Promise<void> {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw invalid("bb.skills must be an array");
  for (const [index, entry] of value.entries()) {
    const skillRoot = requiredString(entry, `bb.skills.${index}`).replace(
      /[\\/]\*$/u,
      "",
    );
    await validateDeclaredPath(
      candidateRoot,
      skillRoot,
      `bb.skills.${index}`,
      "directory",
    );
  }
}

async function validateBranding(
  candidateRoot: string,
  value: unknown,
): Promise<void> {
  const branding = record(value);
  if (!branding) throw invalid("bb.branding must be an object");
  rejectUnknownKeys(branding, ["icon", "logo"], "bb.branding");
  const icon =
    branding.icon === undefined
      ? undefined
      : requiredString(branding.icon, "bb.branding.icon");
  const logo = branding.logo === undefined ? null : record(branding.logo);
  if (branding.logo !== undefined && !logo) {
    throw invalid("bb.branding.logo must be an object");
  }
  if (icon === undefined && logo === null) {
    throw invalid("bb.branding must declare an icon or light logo");
  }
  if (icon !== undefined && isPluginOwnedIconPath(icon)) {
    if (!icon.toLowerCase().endsWith(".svg")) {
      throw invalid("plugin-owned bb.branding.icon must be an SVG path");
    }
    await validateDeclaredPath(candidateRoot, icon, "bb.branding.icon", "file");
    assertValidCompactSvg(
      await readBoundedPluginIcon(resolveDeclaredPath(candidateRoot, icon)),
    );
  }
  if (logo !== null) {
    rejectUnknownKeys(logo, ["light", "dark"], "bb.branding.logo");
    const light = requiredString(logo.light, "bb.branding.logo.light");
    validateLogoExtension(light, "bb.branding.logo.light");
    await validateDeclaredPath(
      candidateRoot,
      light,
      "bb.branding.logo.light",
      "file",
    );
    if (logo.dark !== undefined) {
      const dark = requiredString(logo.dark, "bb.branding.logo.dark");
      validateLogoExtension(dark, "bb.branding.logo.dark");
      await validateDeclaredPath(
        candidateRoot,
        dark,
        "bb.branding.logo.dark",
        "file",
      );
    }
  }
}

function validateEngines(value: unknown): void {
  if (value === undefined) return;
  const engines = record(value);
  if (!engines) throw invalid("engines must be an object");
  if (engines.bb !== undefined) requiredString(engines.bb, "engines.bb");
  if (engines.bbPluginSdk !== undefined) {
    requiredString(engines.bbPluginSdk, "engines.bbPluginSdk");
  }
}

function resolveDeclaredPath(
  candidateRoot: string,
  declaredPath: string,
): string {
  const segments = declaredPath
    .split(/[\\/]/u)
    .filter((segment) => segment.length > 0 && segment !== ".");
  return path.join(candidateRoot, ...segments);
}

async function validateThemes(
  candidateRoot: string,
  value: unknown,
): Promise<void> {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw invalid("bb.themes must be an array");
  const ids = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const theme = record(entry);
    if (!theme) throw invalid(`bb.themes.${index} must be an object`);
    rejectUnknownKeys(
      theme,
      ["id", "name", "description", "css"],
      `bb.themes.${index}`,
    );
    const id = requiredString(theme.id, `bb.themes.${index}.id`, 64);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(id)) {
      throw invalid(`bb.themes.${index}.id is invalid`);
    }
    if (ids.has(id)) throw invalid(`bb.themes contains duplicate id ${id}`);
    ids.add(id);
    requiredString(theme.name, `bb.themes.${index}.name`);
    if (theme.description !== undefined) {
      requiredString(theme.description, `bb.themes.${index}.description`);
    }
    const css = requiredString(theme.css, `bb.themes.${index}.css`);
    if (!css.toLowerCase().endsWith(".css")) {
      throw invalid(`bb.themes.${index}.css must be a CSS path`);
    }
    await validateDeclaredPath(
      candidateRoot,
      css,
      `bb.themes.${index}.css`,
      "file",
    );
  }
}

function isPluginOwnedIconPath(icon: string): boolean {
  return icon.startsWith("./") || icon.startsWith(".\\");
}

function validateLogoExtension(value: string, label: string): void {
  if (!/\.(?:svg|png|webp)$/iu.test(value)) {
    throw invalid(`${label} must be an SVG, PNG, or WebP path`);
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined)
    throw invalid(`${label}.${unknown} is not supported`);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(
  value: unknown,
  label: string,
  maxCharacters = MAX_MANIFEST_STRING_CHARACTERS,
): string {
  if (typeof value !== "string") {
    throw invalid(`${label} must be a bounded non-empty string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxCharacters) {
    throw invalid(`${label} must be a bounded non-empty string`);
  }
  return normalized;
}

function derivePluginId(packageName: string): string {
  const base = packageName.split("/").at(-1) ?? packageName;
  const pluginId = base
    .replace(/^bb-plugin-/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
  if (
    pluginId.length === 0 ||
    pluginId.length > MAX_PLUGIN_ID_CHARACTERS ||
    !/^[a-z0-9][a-z0-9-]*$/u.test(pluginId)
  ) {
    throw invalid("package name cannot produce a bounded plugin id");
  }
  return pluginId;
}

function invalid(message: string): DiscoveryFailure {
  return new DiscoveryFailure("manifest-invalid", message);
}

function notIssued(): TypeError {
  return new TypeError("source candidate was not issued by discovery");
}
