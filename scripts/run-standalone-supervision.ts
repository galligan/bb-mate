import path from "node:path";
import { verifyStandaloneSupervision } from "./standalone-supervision-clean-room.ts";

const MAX_ARGUMENT_BYTES = 4096;

export function parseStandaloneSupervisionArgs(args: string[]): {
  executable: string;
  cwd: string;
  runtimeVersion: string;
  temporaryRoot: string;
} {
  if (args.length !== 4) {
    throw new Error("Standalone supervision requires exactly four arguments.");
  }
  const [executable, cwd, runtimeVersion, temporaryRoot] = args;
  if (
    !executable ||
    !cwd ||
    !temporaryRoot ||
    ![executable, cwd, temporaryRoot].every(
      (value) =>
        path.isAbsolute(value) &&
        Buffer.byteLength(value, "utf8") <= MAX_ARGUMENT_BYTES,
    )
  ) {
    throw new Error(
      "Standalone supervision paths must be bounded and absolute.",
    );
  }
  if (
    !runtimeVersion ||
    Buffer.byteLength(runtimeVersion, "utf8") > 128 ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(runtimeVersion)
  ) {
    throw new Error("Standalone supervision runtime version is invalid.");
  }
  return { executable, cwd, runtimeVersion, temporaryRoot };
}

if (import.meta.main) {
  await verifyStandaloneSupervision({
    ...parseStandaloneSupervisionArgs(process.argv.slice(2)),
    env: process.env,
  });
}
