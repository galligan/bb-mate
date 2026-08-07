import { promises as fs } from "node:fs";
import path from "node:path";
import { major, valid } from "semver";
import type { InspectionCheck, NativeBuildMetadata } from "./types.ts";

export interface ArtifactRead {
  state: "valid" | "missing" | "malformed";
  metadata: NativeBuildMetadata | null;
  detail: string | null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseBuildMetadata(value: unknown): {
  metadata: NativeBuildMetadata | null;
  error: string | null;
} {
  const metadata = recordOrNull(value);
  if (!metadata)
    return { metadata: null, error: "metadata must be a JSON object" };
  if (metadata.artifactFormatVersion !== 1) {
    return {
      metadata: null,
      error: `artifactFormatVersion must be 1, got ${JSON.stringify(metadata.artifactFormatVersion)}`,
    };
  }
  const sdkVersion = nonEmptyString(metadata.sdkVersion);
  const sdkMajor = metadata.sdkMajor;
  if (
    !sdkVersion ||
    valid(sdkVersion) === null ||
    typeof sdkMajor !== "number" ||
    !Number.isSafeInteger(sdkMajor) ||
    sdkMajor < 0 ||
    major(sdkVersion) !== sdkMajor
  ) {
    return {
      metadata: null,
      error:
        "sdkMajor must be a non-negative integer matching the valid semver sdkVersion",
    };
  }
  const pluginId = nonEmptyString(metadata.pluginId);
  const pluginVersion = nonEmptyString(metadata.pluginVersion);
  const builtWith = recordOrNull(metadata.builtWith);
  const bbVersion = nonEmptyString(builtWith?.bbVersion);
  const pluginSdkVersion = nonEmptyString(builtWith?.pluginSdkVersion);
  if (!pluginId || !pluginVersion) {
    return {
      metadata: null,
      error: "pluginId and pluginVersion must be non-empty strings",
    };
  }
  if (!bbVersion || !pluginSdkVersion || valid(pluginSdkVersion) === null) {
    return {
      metadata: null,
      error:
        "builtWith.bbVersion must be non-empty and builtWith.pluginSdkVersion must be valid semver",
    };
  }
  if (pluginSdkVersion !== sdkVersion) {
    return {
      metadata: null,
      error: `builtWith.pluginSdkVersion ${pluginSdkVersion} does not match sdkVersion ${sdkVersion}`,
    };
  }
  return {
    metadata: {
      artifactFormatVersion: 1,
      sdkMajor,
      sdkVersion,
      pluginId,
      pluginVersion,
      bbVersion,
      pluginSdkVersion,
    },
    error: null,
  };
}

export async function readBuildMetadata(
  pluginRoot: string,
  name: "server" | "app",
): Promise<ArtifactRead> {
  const filePath = path.join(pluginRoot, "dist", `${name}.meta.json`);
  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : null;
    if (code === "ENOENT") {
      return { state: "missing", metadata: null, detail: null };
    }
    return {
      state: "malformed",
      metadata: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const parsed = parseBuildMetadata(value);
  return parsed.metadata
    ? { state: "valid", metadata: parsed.metadata, detail: null }
    : { state: "malformed", metadata: null, detail: parsed.error };
}

export function artifactCheck(
  kind: "server" | "app",
  entry: string | null,
  artifact: ArtifactRead,
  expectedPluginId: string,
  packageVersion: string,
): InspectionCheck {
  if (!entry) {
    return {
      id: `artifact.${kind}`,
      status: "info",
      summary: `No ${kind} artifact is expected because no ${kind} entry is declared.`,
    };
  }
  if (artifact.state === "missing") {
    return {
      id: `artifact.${kind}`,
      status: "warning",
      summary: `Native ${kind} build metadata is missing.`,
      nextAction: "Run `bb plugin build` in the selected plugin directory.",
    };
  }
  if (artifact.state === "malformed" || !artifact.metadata) {
    return {
      id: `artifact.${kind}`,
      status: "fail",
      summary: `Native ${kind} build metadata is malformed.`,
      detail: artifact.detail ?? undefined,
      nextAction:
        "Rebuild with native `bb plugin build` and inspect the generated metadata.",
    };
  }
  if (artifact.metadata.pluginId !== expectedPluginId) {
    return {
      id: `artifact.${kind}`,
      status: "fail",
      summary: `Native ${kind} metadata belongs to plugin ${artifact.metadata.pluginId}, not ${expectedPluginId}.`,
      nextAction: "Run `bb plugin build` to replace copied or stale metadata.",
    };
  }
  if (artifact.metadata.pluginVersion !== packageVersion) {
    return {
      id: `artifact.${kind}`,
      status: "warning",
      summary: `Native ${kind} metadata was built for plugin ${artifact.metadata.pluginVersion}, not ${packageVersion}.`,
      nextAction: "Run `bb plugin build` to refresh stale native metadata.",
    };
  }
  return {
    id: `artifact.${kind}`,
    status: "pass",
    summary: `Native ${kind} metadata is valid for SDK ${artifact.metadata.sdkVersion}.`,
  };
}

export function artifactConsistencyCheck(
  server: NativeBuildMetadata | null,
  app: NativeBuildMetadata | null,
): InspectionCheck {
  if (!server || !app) {
    return {
      id: "artifact.consistency",
      status: "info",
      summary: "Cross-artifact consistency is not applicable.",
    };
  }
  const fields = [
    "artifactFormatVersion",
    "sdkMajor",
    "sdkVersion",
    "pluginId",
    "pluginVersion",
    "bbVersion",
    "pluginSdkVersion",
  ] as const;
  const mismatch = fields.find((field) => server[field] !== app[field]);
  if (mismatch) {
    return {
      id: "artifact.consistency",
      status: "fail",
      summary: `Native server and app metadata disagree on ${mismatch}.`,
      detail: `server=${String(server[mismatch])}; app=${String(app[mismatch])}`,
      nextAction:
        "Run one native `bb plugin build` to rebuild both artifacts together.",
    };
  }
  return {
    id: "artifact.consistency",
    status: "pass",
    summary: "Native server and app metadata are consistent.",
  };
}
