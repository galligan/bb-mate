import { OpaqueIdSchema } from "../contracts/ids.ts";
import { RUNTIME_CAPABILITIES } from "../supervision/protocol.ts";
import {
  createRuntimeHttpHandler as createHandler,
  type RuntimeHttpHandler,
  type RuntimeHttpHandlerOptions,
} from "./handler.ts";

const TEST_IDENTITY = {
  runtimeVersion: "0.1.0",
  instanceId: OpaqueIdSchema.parse("d".repeat(32)),
  capabilities: RUNTIME_CAPABILITIES,
} as const;

type TestHandlerOptions = Omit<RuntimeHttpHandlerOptions, "identity"> & {
  identity?: RuntimeHttpHandlerOptions["identity"];
};

export function createRuntimeHttpHandler(
  options: TestHandlerOptions,
): RuntimeHttpHandler {
  return createHandler({
    ...options,
    identity: options.identity ?? TEST_IDENTITY,
  });
}
