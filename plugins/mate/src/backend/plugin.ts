import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";
import { RUNTIME_ARTIFACT_STAMP } from "../generated/runtime-artifact-stamp.ts";
import {
  createRuntimeSupervisor,
  type PluginWorkbenchSnapshot,
  type RuntimeSupervisor,
} from "./runtime-supervisor.ts";

const boundedUtf8 = (maximumBytes: number) =>
  z
    .string()
    .refine(
      (value) => new TextEncoder().encode(value).byteLength <= maximumBytes,
      `Must be at most ${maximumBytes} UTF-8 bytes.`,
    );
const projectIdSchema = boundedUtf8(128)
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/u);
const runtimeVersionSchema = boundedUtf8(64)
  .min(1)
  .regex(/^[0-9A-Za-z][0-9A-Za-z._+-]*$/u);

const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    runtimeState: z.enum([
      "idle",
      "starting",
      "ready",
      "stopping",
      "unavailable",
      "failed",
    ]),
    reason: z
      .enum([
        "unsupported_platform",
        "artifact_missing",
        "artifact_invalid",
        "runtime_incompatible",
        "startup_failed",
      ])
      .nullable(),
    runtimeVersion: runtimeVersionSchema.nullable(),
    apiVersion: z.literal(1).nullable(),
    canStart: z.boolean(),
    browserLaunch: z.literal("unavailable"),
    targets: z.literal("unavailable_pending_runtime_admission"),
  })
  .strict()
  .refine((snapshot) => {
    const hasRuntimeIdentity =
      snapshot.runtimeVersion !== null && snapshot.apiVersion === 1;
    if (
      (snapshot.runtimeState === "ready" ||
        snapshot.runtimeState === "stopping") !== hasRuntimeIdentity
    ) {
      return false;
    }
    if (snapshot.runtimeState === "idle") {
      return snapshot.canStart && snapshot.reason === null;
    }
    if (snapshot.runtimeState === "unavailable") {
      return !snapshot.canStart && snapshot.reason !== null;
    }
    if (snapshot.runtimeState === "failed") {
      return snapshot.canStart && snapshot.reason === "startup_failed";
    }
    return !snapshot.canStart && snapshot.reason === null;
  });

export const rpcContract = defineRpcContract({
  status: {
    input: z.object({ projectId: projectIdSchema.nullable() }).strict(),
    output: snapshotSchema,
  },
  ensure: {
    input: z.object({ projectId: projectIdSchema }).strict(),
    output: snapshotSchema,
  },
});

interface MateRuntimeSupervisor {
  status(): PluginWorkbenchSnapshot;
  ensure(): Promise<PluginWorkbenchSnapshot>;
  runService(signal: AbortSignal): Promise<void>;
  stop(): Promise<void>;
}

export function createMatePlugin(supervisor: MateRuntimeSupervisor) {
  return function matePlugin(bb: BbPluginApi): void {
    bb.rpc.register(rpcContract, {
      status: () => supervisor.status(),
      async ensure({ projectId }) {
        try {
          await bb.sdk.projects.get({ projectId });
        } catch {
          throw new Error("Project is unavailable.");
        }
        return supervisor.ensure();
      },
    });
    bb.background.service("runtime", {
      start: (signal) => supervisor.runService(signal),
    });
    bb.onDispose(() => supervisor.stop());
  };
}

export default function plugin(bb: BbPluginApi): void {
  const supervisor: RuntimeSupervisor = createRuntimeSupervisor({
    stamp: RUNTIME_ARTIFACT_STAMP,
  });
  createMatePlugin(supervisor)(bb);
}
