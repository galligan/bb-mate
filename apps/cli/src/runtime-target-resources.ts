import {
  loadOrCreateRuntimeIdentity,
  openDevelopmentTargetCatalog,
  type RuntimeIdentity,
  type RuntimeTargetController,
} from "@bb-mate/runtime";
import { createRuntimeTargetController } from "./runtime-target-controller.ts";

export interface RuntimeTargetResources {
  readonly identity: RuntimeIdentity;
  readonly controller: RuntimeTargetController;
  close(): void;
}

export async function openRuntimeTargetResources(
  dataRoot: string,
): Promise<RuntimeTargetResources> {
  const identity = await loadOrCreateRuntimeIdentity({ dataRoot });
  const catalog = await openDevelopmentTargetCatalog({ dataRoot });
  return {
    identity,
    controller: createRuntimeTargetController({ catalog, ...identity }),
    close: catalog.close,
  };
}
