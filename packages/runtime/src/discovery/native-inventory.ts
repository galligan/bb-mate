import * as path from "node:path";

import { z } from "zod";

import { OpaqueIdSchema } from "../contracts/ids.ts";
import { RuntimeError } from "../errors.ts";
import type { PrivateHostObservation } from "./private-host-observation.ts";

const boundedText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= maximum,
      `Expected at most ${maximum} UTF-8 bytes`,
    );

const NativeInventoryStatusSchema = z.enum([
  "running",
  "error",
  "incompatible",
  "missing",
  "disabled",
  "degraded",
  "needs-configuration",
]);

const NativeInventorySourceKindSchema = z.enum([
  "path",
  "npm",
  "git",
  "builtin",
  "catalog",
]);

const NativeInventoryProvenanceSchema = z.enum([
  "builtin",
  "direct",
  "catalog",
]);

const CanonicalInventoryRootSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      Buffer.byteLength(value, "utf8") <= 4_096 &&
      path.isAbsolute(value) &&
      path.resolve(value) === value,
    "Expected a canonical absolute path",
  );

const NativeInventoryEntrySchema = z
  .strictObject({
    id: boundedText(128),
    sourceKind: NativeInventorySourceKindSchema,
    canonicalRoot: CanonicalInventoryRootSchema.nullable(),
    version: boundedText(128),
    provenance: NativeInventoryProvenanceSchema,
    isOrphanedBuiltin: z.boolean(),
    enabled: z.boolean(),
    status: NativeInventoryStatusSchema,
  })
  .superRefine((entry, context) => {
    const expectedProvenance =
      entry.sourceKind === "path" ||
      entry.sourceKind === "npm" ||
      entry.sourceKind === "git"
        ? "direct"
        : entry.sourceKind === "builtin"
          ? "builtin"
          : "catalog";
    if (
      (entry.sourceKind === "path") !== (entry.canonicalRoot !== null) ||
      entry.provenance !== expectedProvenance ||
      (entry.isOrphanedBuiltin &&
        entry.sourceKind !== "builtin" &&
        entry.sourceKind !== "catalog")
    ) {
      context.addIssue({
        code: "custom",
        message: "Contradictory native inventory entry",
      });
    }
  });

const NativeInventoryMalformedIssueSchema = z.enum([
  "row",
  "id",
  "source",
  "rootDir",
  "version",
  "provenance",
  "isOrphanedBuiltin",
  "enabled",
  "status",
  "source-provenance",
  "canonical-root",
]);

const NativeInventoryMalformedRowSchema = z
  .strictObject({
    index: z.number().int().nonnegative().max(255),
    id: boundedText(128).nullable(),
    canonicalRoot: CanonicalInventoryRootSchema.nullable(),
    issues: z
      .array(NativeInventoryMalformedIssueSchema)
      .min(1)
      .max(11)
      .refine((issues) => new Set(issues).size === issues.length),
  })
  .superRefine((row, context) => {
    if (
      row.canonicalRoot !== null &&
      row.issues.some((issue) =>
        [
          "row",
          "source",
          "rootDir",
          "provenance",
          "source-provenance",
          "canonical-root",
        ].includes(issue),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Unsafe malformed inventory root hint",
      });
    }
  });

const NativeInventoryTransitionFactsSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    observedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    runtimeInstanceId: OpaqueIdSchema,
    hostname: boundedText(253).refine(isSafeHostname),
    topLevelStatus: z.enum([
      "ok",
      "command-error",
      "output-limit",
      "malformed",
      "entry-limit",
    ]),
    entries: z.array(NativeInventoryEntrySchema).max(256),
    malformedRows: z
      .array(NativeInventoryMalformedRowSchema)
      .max(256)
      .refine(
        (rows) => new Set(rows.map((row) => row.index)).size === rows.length,
        "Malformed row indices must be unique",
      ),
  })
  .superRefine((facts, context) => {
    if (facts.entries.length + facts.malformedRows.length > 256) {
      context.addIssue({
        code: "custom",
        message: "Native inventory row limit exceeded",
      });
    }
  });

export type NativeInventoryTransitionFacts = z.input<
  typeof NativeInventoryTransitionFactsSchema
>;

type ParsedNativeInventoryTransitionFacts = z.output<
  typeof NativeInventoryTransitionFactsSchema
>;

type FrozenNativeInventoryTransitionFacts = Omit<
  ParsedNativeInventoryTransitionFacts,
  "entries" | "malformedRows"
> & {
  readonly entries: readonly Readonly<NativeInventoryEntry>[];
  readonly malformedRows: readonly Readonly<
    Omit<NativeInventoryMalformedRow, "issues"> & {
      readonly issues: readonly NativeInventoryMalformedRow["issues"][number][];
    }
  >[];
};

export type NativeInventoryEntry = z.output<typeof NativeInventoryEntrySchema>;
export type NativeInventoryMalformedRow = z.output<
  typeof NativeInventoryMalformedRowSchema
>;

const trustedInventories = new WeakMap<
  object,
  FrozenNativeInventoryTransitionFacts
>();

declare const trustedNativeInventoryBrand: unique symbol;

export interface TrustedNativeInventory {
  readonly [trustedNativeInventoryBrand]: true;
}

export interface InspectionNativeInventoryBridge {
  issue(observation: unknown): Promise<TrustedNativeInventory>;
}

export function createInspectionNativeInventoryBridge(options: {
  readonly consumeIssuedNativeInventory: (
    observation: unknown,
    consumer: (transition: unknown) => unknown | Promise<unknown>,
  ) => unknown | Promise<unknown>;
  readonly readNativeInventoryTransition: (transition: unknown) => unknown;
}): InspectionNativeInventoryBridge {
  if (
    typeof options.consumeIssuedNativeInventory !== "function" ||
    typeof options.readNativeInventoryTransition !== "function"
  ) {
    throw new TypeError("Inspection transition functions must be provided");
  }

  return Object.freeze({
    async issue(observation: unknown) {
      try {
        let consumed = false;
        let pendingCapability: TrustedNativeInventory | undefined;
        let pendingFacts: FrozenNativeInventoryTransitionFacts | undefined;
        const capability = await options.consumeIssuedNativeInventory(
          observation,
          (transition) => {
            if (consumed) throw new RuntimeError("invalid_request");
            consumed = true;
            const facts = NativeInventoryTransitionFactsSchema.parse(
              options.readNativeInventoryTransition(transition),
            );
            const issued = createTrustedNativeInventory();
            pendingCapability = issued;
            pendingFacts = freezeInventoryFacts(facts);
            return issued;
          },
        );
        if (
          !consumed ||
          typeof capability !== "object" ||
          capability === null ||
          capability !== pendingCapability ||
          !pendingFacts
        ) {
          throw new RuntimeError("invalid_request");
        }
        trustedInventories.set(capability, pendingFacts);
        return capability as TrustedNativeInventory;
      } catch (error) {
        if (error instanceof RuntimeError) throw error;
        throw new RuntimeError("invalid_request", { cause: error });
      }
    },
  });
}

export function readPrivateHostObservation(
  inventory: unknown,
): Readonly<PrivateHostObservation> {
  if (
    typeof inventory !== "object" ||
    inventory === null ||
    !trustedInventories.has(inventory)
  ) {
    throw new TypeError("Invalid native inventory capability");
  }
  const facts = trustedInventories.get(inventory)!;
  return Object.freeze({
    runtimeInstanceId: facts.runtimeInstanceId,
    hostname: facts.hostname,
    observedAt: facts.observedAt,
  });
}

export function readTrustedNativeInventory(
  inventory: unknown,
): Readonly<FrozenNativeInventoryTransitionFacts> {
  if (
    typeof inventory !== "object" ||
    inventory === null ||
    !trustedInventories.has(inventory)
  ) {
    throw new TypeError("Invalid native inventory capability");
  }
  return trustedInventories.get(inventory)!;
}

function freezeInventoryFacts(
  facts: ParsedNativeInventoryTransitionFacts,
): FrozenNativeInventoryTransitionFacts {
  return Object.freeze({
    ...facts,
    entries: Object.freeze(
      facts.entries.map((entry) => Object.freeze({ ...entry })),
    ),
    malformedRows: Object.freeze(
      facts.malformedRows.map((row) =>
        Object.freeze({ ...row, issues: Object.freeze([...row.issues]) }),
      ),
    ),
  });
}

function createTrustedNativeInventory(): TrustedNativeInventory {
  const inventory = {};
  Object.defineProperty(inventory, "toJSON", {
    enumerable: false,
    value: () => {
      throw new TypeError("native inventory capabilities are server-private");
    },
  });
  return Object.freeze(inventory) as TrustedNativeInventory;
}

function isSafeHostname(value: string): boolean {
  if (
    value.includes(":") ||
    value.includes("/") ||
    value.includes("@") ||
    value.includes("..")
  ) {
    return false;
  }
  const labels = value.split(".");
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u.test(label),
  );
}
