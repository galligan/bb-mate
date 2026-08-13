import { describe, expect, test } from "bun:test";

import * as runtime from "./index.ts";

describe("@bb-plugin-studio/runtime public surface", () => {
  test("exports only the transport-neutral runtime foundation", () => {
    expect(Object.keys(runtime).sort()).toEqual([
      "AuthenticatedPrincipalSchema",
      "BatchProjectTargetAdmissionRequestSchema",
      "BatchProjectTargetAdmissionResponseSchema",
      "BbContextIdSchema",
      "DevelopmentTargetCodec",
      "DevelopmentTargetListResponseSchema",
      "DevelopmentTargetPayloadSchema",
      "DevelopmentTargetProjectionSchema",
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
      "TARGET_ADMISSION_MAX_PROJECTS",
      "TargetIdSchema",
      "authorize",
      "canonicalJson",
      "createDevelopmentTargetService",
      "createInspectionDevelopmentTargetCandidateBridge",
      "createOpaqueId",
      "createRequestContext",
      "createRuntimeHttpHandler",
      "createWorkbenchService",
      "defineObjectCodec",
      "isRequestContext",
      "loadOrCreateRuntimeIdentity",
      "openDevelopmentTargetCatalog",
      "openRuntimeStore",
    ]);
  });

  test("does not expose persistence, event-feed, or schema internals", () => {
    expect(runtime).not.toHaveProperty(
      "issueTrustedDevelopmentTargetCandidateFromInspection",
    );
    expect(runtime).not.toHaveProperty("openRuntimeDatabase");
    expect(runtime).not.toHaveProperty("applyRuntimeMigrations");
    expect(runtime).not.toHaveProperty("createEventFeed");
    expect(runtime).not.toHaveProperty("OBJECT_MIGRATIONS");
    expect(runtime).not.toHaveProperty("EVENT_MIGRATIONS");
  });
});
