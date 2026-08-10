import { describe, expect, test } from "bun:test";

import * as runtime from "./index.ts";

describe("@bb-mate/runtime public surface", () => {
  test("exports only the transport-neutral runtime foundation", () => {
    expect(Object.keys(runtime).sort()).toEqual([
      "AuthenticatedPrincipalSchema",
      "BbContextIdSchema",
      "DevelopmentTargetCodec",
      "DevelopmentTargetPayloadSchema",
      "DevelopmentTargetRootKindSchema",
      "DevelopmentTargetSourceKindSchema",
      "NativeReconciliationStatusSchema",
      "ObjectBindingsSchema",
      "ObjectCodecRegistry",
      "ObjectIdSchema",
      "ObjectKindSchema",
      "OpaqueIdSchema",
      "PrincipalIdSchema",
      "PrincipalKindSchema",
      "RUNTIME_ERROR_CODES",
      "RuntimeError",
      "ScopeSchema",
      "SessionIdSchema",
      "TargetIdSchema",
      "authorize",
      "canonicalJson",
      "createDevelopmentTargetService",
      "createOpaqueId",
      "createRequestContext",
      "createRuntimeHttpHandler",
      "createWorkbenchService",
      "defineObjectCodec",
      "isRequestContext",
      "issueTrustedDevelopmentTargetCandidate",
      "openDevelopmentTargetCatalog",
      "openRuntimeStore",
    ]);
  });

  test("does not expose persistence, event-feed, or schema internals", () => {
    expect(runtime).not.toHaveProperty("openRuntimeDatabase");
    expect(runtime).not.toHaveProperty("applyRuntimeMigrations");
    expect(runtime).not.toHaveProperty("createEventFeed");
    expect(runtime).not.toHaveProperty("OBJECT_MIGRATIONS");
    expect(runtime).not.toHaveProperty("EVENT_MIGRATIONS");
  });
});
