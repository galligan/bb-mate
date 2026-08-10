import * as os from "node:os";
import * as path from "node:path";

export const MAX_CANONICAL_SOURCE_PATH_CHARACTERS = 4_096;

const IGNORED_SOURCE_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "cache",
  "caches",
]);

export function isCanonicalSourcePathFormat(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_CANONICAL_SOURCE_PATH_CHARACTERS ||
    !path.isAbsolute(value) ||
    path.resolve(value) !== value
  ) {
    return false;
  }
  const root = path.parse(value).root;
  const home = path.resolve(os.homedir());
  if (
    value === root ||
    value === home ||
    home.startsWith(`${value}${path.sep}`)
  ) {
    return false;
  }
  return !path
    .relative(root, value)
    .split(path.sep)
    .some(
      (segment) =>
        segment.startsWith(".") || IGNORED_SOURCE_DIRECTORIES.has(segment),
    );
}
