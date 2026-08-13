import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { DEVELOPMENT_TARGET_CATALOG_MIGRATION_STATEMENTS } from "./runtime-migrations.ts";

test("exposes an immutable append-only catalog migration sequence for bb storage", () => {
  expect(DEVELOPMENT_TARGET_CATALOG_MIGRATION_STATEMENTS).toHaveLength(9);
  expect(Object.isFrozen(DEVELOPMENT_TARGET_CATALOG_MIGRATION_STATEMENTS)).toBe(
    true,
  );
  expect(
    DEVELOPMENT_TARGET_CATALOG_MIGRATION_STATEMENTS.some((statement) =>
      statement.includes("runtime_migrations"),
    ),
  ).toBe(false);
  expect(DEVELOPMENT_TARGET_CATALOG_MIGRATION_STATEMENTS.join("\n")).toContain(
    "CREATE TABLE runtime_objects",
  );
  expect(DEVELOPMENT_TARGET_CATALOG_MIGRATION_STATEMENTS.join("\n")).toContain(
    "CREATE TABLE development_target_project_scopes",
  );
  expect(
    DEVELOPMENT_TARGET_CATALOG_MIGRATION_STATEMENTS.map((statement) =>
      createHash("sha256").update(statement).digest("hex"),
    ),
  ).toEqual([
    "c3d024c3616c4c8e4e38ec4578da32d83bb84537606187609700cf15957d38ce",
    "baf96ba2e20bda609d579dbfbf1a3257d7c81f3c243c317db36eb20668aa5dd4",
    "db5645fd35a49338055e07876d6d8aef7340e326cb54b427ca204ed69905da12",
    "2d4d1873b657dbf5742cd2920f29dd2463945a4ad32e21acd624af24432806a9",
    "3783f4a611d92ed0ad9986fd7187a99da7ffcb3b98b79665e950892f51fb89ff",
    "32b97aa6681c1e5259e7a3e5517f5779d97d6bedf230cdc191008dbe2cbe9f37",
    "13ec16f4c464f1276bd48e5defad3a69cbfbb8af1f8123333c10ae44319c0775",
    "6b80b3138208505a3f27b88e79929b2a6431fef8fc159eefa895b25ec3358741",
    "eb32c76b9557ade825d419737a919771bca2054a24676915cfd307d2bc8f6d26",
  ]);
});
