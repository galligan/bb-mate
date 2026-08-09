import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const targetPath = path.join(repositoryRoot, "compatibility/bb-target.json");
const registryUrl = "https://registry.npmjs.org/bb-app/latest";

export type BbReleaseStatus = "current" | "update-available" | "target-ahead";

export interface BbReleaseReport {
  schemaVersion: 1;
  package: "bb-app";
  targetVersion: string;
  latestVersion: string;
  status: BbReleaseStatus;
  registryUrl: string;
}

function stableParts(version: string): [number, number, number] {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match)
    throw new Error(`Expected a stable semantic version, got ${version}.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareStableVersions(left: string, right: string): number {
  const leftParts = stableParts(left);
  const rightParts = stableParts(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function evaluateBbRelease(
  targetVersion: string,
  latestVersion: string,
): BbReleaseReport {
  const comparison = compareStableVersions(latestVersion, targetVersion);
  return {
    schemaVersion: 1,
    package: "bb-app",
    targetVersion,
    latestVersion,
    status:
      comparison > 0
        ? "update-available"
        : comparison < 0
          ? "target-ahead"
          : "current",
    registryUrl,
  };
}

export async function checkLatestBbRelease(
  fetcher: typeof fetch = fetch,
): Promise<BbReleaseReport> {
  const target = JSON.parse(await readFile(targetPath, "utf8")) as {
    target?: { bbVersion?: unknown };
  };
  if (typeof target.target?.bbVersion !== "string") {
    throw new Error("compatibility/bb-target.json has no target.bbVersion.");
  }
  const response = await fetcher(registryUrl, {
    headers: { "user-agent": "bb-mate-release-check" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      `npm registry returned ${response.status} ${response.statusText}.`,
    );
  }
  const latest = (await response.json()) as { version?: unknown };
  if (typeof latest.version !== "string") {
    throw new Error("npm registry response has no version.");
  }
  return evaluateBbRelease(target.target.bbVersion, latest.version);
}

function formatReport(report: BbReleaseReport): string {
  if (report.status === "current") return "";
  if (report.status === "update-available") {
    return `bb-app ${report.latestVersion} is available; BB Mate targets ${report.targetVersion}.\n`;
  }
  return `BB Mate targets ${report.targetVersion}, ahead of npm latest ${report.latestVersion}.\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--json")) {
    throw new Error("Usage: bun scripts/check-latest-bb.ts [--json]");
  }
  const report = await checkLatestBbRelease();
  process.stdout.write(
    args.includes("--json")
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatReport(report),
  );
  if (report.status === "update-available") process.exitCode = 10;
  if (report.status === "target-ahead") process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
