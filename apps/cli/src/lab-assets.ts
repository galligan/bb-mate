import { promises as fs } from "node:fs";
import path from "node:path";

export type LabAssetBody = Blob | Uint8Array | string;

export interface LabAsset {
  body: LabAssetBody;
  contentType: string;
}

export interface LabAssetProvider {
  get(route: string): Promise<LabAsset | null>;
}

export type EmbeddedLabAssetMap = Readonly<Record<string, string>>;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
  [".woff2", "font/woff2"],
]);

export function labAssetContentType(route: string): string {
  return contentTypes.get(path.extname(route)) ?? "application/octet-stream";
}

export function createInMemoryLabAssets(
  assets: Readonly<Record<string, LabAssetBody>>,
): LabAssetProvider {
  return {
    async get(route) {
      const body = assets[route];
      return body === undefined
        ? null
        : { body, contentType: labAssetContentType(route) };
    },
  };
}

export function createEmbeddedLabAssets(
  assets: EmbeddedLabAssetMap,
): LabAssetProvider {
  return {
    async get(route) {
      const filePath = assets[route];
      if (filePath === undefined) return null;
      const file = Bun.file(filePath);
      if (!(await file.exists())) return null;
      return { body: file, contentType: labAssetContentType(route) };
    },
  };
}

function contained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function createFileSystemLabAssets(root: string): LabAssetProvider {
  const resolvedRoot = fs.realpath(path.resolve(root));
  return {
    async get(route) {
      if (!route.startsWith("/") || route.includes("\0")) return null;
      try {
        const labRoot = await resolvedRoot;
        const candidate = path.resolve(labRoot, route.slice(1));
        if (!contained(labRoot, candidate)) return null;
        const filePath = await fs.realpath(candidate);
        const stat = await fs.stat(filePath);
        if (!stat.isFile() || !contained(labRoot, filePath)) return null;
        return {
          body: Bun.file(filePath),
          contentType: labAssetContentType(route),
        };
      } catch {
        return null;
      }
    },
  };
}
