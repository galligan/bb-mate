import type { NativeInventoryTransitionFacts } from "./native-inventory-types.ts";
import {
  consumeIssuedNativeInventory,
  readNativeInventoryTransition,
} from "./native-inventory-transition.ts";
import type { CommandResult } from "./types.ts";

export const runtimeInstanceId = "r".repeat(32);

export function command(stdout: string): CommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}

export async function readObservation(
  observation: Parameters<typeof consumeIssuedNativeInventory>[0],
): Promise<NativeInventoryTransitionFacts> {
  return consumeIssuedNativeInventory(
    observation,
    readNativeInventoryTransition,
  );
}
