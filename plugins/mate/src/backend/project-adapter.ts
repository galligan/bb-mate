import path from "node:path";
import { promises as fs } from "node:fs";
import { CurrentProjectTargetAdmissionRequestSchema } from "@bb-mate/runtime/supervision";

import {
  projectCatalogSchema,
  projectIdSchema,
  projectOptionSchema,
  type ProjectCatalog,
} from "./workbench-contract.ts";

interface ProjectSourceLike {
  readonly id?: unknown;
  readonly projectId?: unknown;
  readonly updatedAt?: unknown;
  readonly type?: unknown;
  readonly hostId?: unknown;
  readonly path?: unknown;
}

interface ProjectLike {
  readonly id: string;
  readonly name: string;
  readonly sources: readonly ProjectSourceLike[];
}

export interface ReleasedProjectSdk {
  readonly system: {
    config(): Promise<{
      readonly primaryHostId: string | null;
      readonly dataDir: string;
    }>;
  };
  readonly projects: {
    list(): Promise<readonly ProjectLike[]>;
    get(input: { readonly projectId: string }): Promise<ProjectLike>;
  };
}

export interface ResolvedProjectSource {
  readonly projectId: string;
  readonly sourceId: string;
  readonly updatedAt: number;
  readonly hostId: string;
  readonly path: string;
}

function sourceFor(project: ProjectLike, primaryHostId: string | null) {
  if (!primaryHostId) return null;
  const matches = project.sources.filter(
    (source) =>
      source.type === "local_path" &&
      source.projectId === project.id &&
      source.hostId === primaryHostId,
  );
  const source = matches.length === 1 ? matches[0]! : null;
  if (!(
    source &&
    typeof source.id === "string" &&
    typeof source.updatedAt === "number" &&
    Number.isSafeInteger(source.updatedAt) &&
    typeof source.path === "string"
  ))
    return null;
  const admission = CurrentProjectTargetAdmissionRequestSchema.safeParse({
    schemaVersion: 1,
    sourcePath: source.path,
  });
  return admission.success
    ? {
        id: source.id,
        updatedAt: source.updatedAt,
        hostId: primaryHostId,
        path: admission.data.sourcePath,
      }
    : null;
}

export async function listProjectOptions(
  sdk: ReleasedProjectSdk,
): Promise<ProjectCatalog> {
  try {
    const [{ primaryHostId }, projects] = await Promise.all([
      sdk.system.config(),
      sdk.projects.list(),
    ]);
    const items = projects
      .flatMap((project) => {
        if (!projectIdSchema.safeParse(project.id).success) return [];
        if (!sourceFor(project, primaryHostId)) return [];
        const option = projectOptionSchema.safeParse({
          id: project.id,
          label: project.name,
          admission: "available",
        });
        return option.success ? [option.data] : [];
      })
      .sort(
        (left, right) =>
          left.label.localeCompare(right.label) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, 128);
    return projectCatalogSchema.parse({ state: "ready", items });
  } catch {
    return { state: "unavailable", items: [] };
  }
}

export async function resolveProjectSource(
  sdk: ReleasedProjectSdk,
  inputProjectId: unknown,
): Promise<ResolvedProjectSource> {
  try {
    const projectId = projectIdSchema.parse(inputProjectId);
    const [{ primaryHostId }, project] = await Promise.all([
      sdk.system.config(),
      sdk.projects.get({ projectId }),
    ]);
    if (project.id !== projectId) throw new Error();
    const source = sourceFor(project, primaryHostId);
    if (!source) throw new Error();
    return Object.freeze({
      projectId,
      sourceId: source.id,
      updatedAt: source.updatedAt,
      hostId: source.hostId,
      path: source.path,
    });
  } catch {
    throw new Error("Project source unavailable.");
  }
}

export function sameProjectSource(
  left: ResolvedProjectSource,
  right: ResolvedProjectSource,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.sourceId === right.sourceId &&
    left.updatedAt === right.updatedAt &&
    left.hostId === right.hostId &&
    left.path === right.path
  );
}

export async function deriveRuntimeDataRoot(dataDir: unknown): Promise<string> {
  if (
    typeof dataDir !== "string" ||
    !path.isAbsolute(dataDir) ||
    path.normalize(dataDir) !== dataDir ||
    dataDir.endsWith(path.sep) ||
    dataDir === path.parse(dataDir).root ||
    Buffer.byteLength(dataDir, "utf8") > 4_096 ||
    /[\u0000-\u001f\u007f]/u.test(dataDir)
  )
    throw new Error("Runtime data directory unavailable.");
  let canonicalDataDir: string;
  try {
    canonicalDataDir = await fs.realpath(dataDir);
    const stat = await fs.lstat(canonicalDataDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
  } catch {
    throw new Error("Runtime data directory unavailable.");
  }
  const runtimeRoot = path.join(canonicalDataDir, "plugins", "mate", "runtime");
  const relative = path.relative(canonicalDataDir, runtimeRoot);
  if (
    Buffer.byteLength(runtimeRoot, "utf8") > 1_024 ||
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error("Runtime data directory unavailable.");
  for (const segment of ["plugins", "mate", "runtime"] as const) {
    const candidate =
      segment === "plugins"
        ? path.join(canonicalDataDir, segment)
        : segment === "mate"
          ? path.join(canonicalDataDir, "plugins", segment)
          : runtimeRoot;
    const stat = await fs.lstat(candidate).catch((error: unknown) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return null;
      throw error;
    });
    if (!stat) break;
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Runtime data directory unavailable.");
    const physical = await fs.realpath(candidate);
    const physicalRelative = path.relative(canonicalDataDir, physical);
    if (
      physicalRelative === ".." ||
      physicalRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(physicalRelative)
    )
      throw new Error("Runtime data directory unavailable.");
  }
  return runtimeRoot;
}
