import { RuntimeError } from "../errors.ts";
import { verifyOwnedSchema } from "./schema-verification.ts";
import type { SqliteDatabase } from "./sqlite.ts";

const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS runtime_migrations (
    version INTEGER PRIMARY KEY,
    checksum TEXT NOT NULL
  ) STRICT
`;

export interface RuntimeMigration {
  readonly version: number;
  readonly checksum: string;
  apply(database: SqliteDatabase): void;
  verify?(database: SqliteDatabase): void;
}

interface AppliedMigration {
  readonly version: number;
  readonly checksum: string;
}

export function applyRuntimeMigrations(
  database: SqliteDatabase,
  migrations: readonly RuntimeMigration[],
  initializeLedger: boolean,
): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new TypeError(
        "Migration versions must be consecutive starting at 1",
      );
    }
    if (migration.checksum.length === 0) {
      throw new TypeError("Migration checksums must not be empty");
    }
  });

  if (initializeLedger) database.exec(MIGRATIONS_TABLE_SQL);
  verifyOwnedSchema(database, "runtime_migrations", [
    {
      type: "table",
      name: "runtime_migrations",
      sql: MIGRATIONS_TABLE_SQL,
    },
  ]);

  const applied = database
    .query<AppliedMigration, []>(
      "SELECT version, checksum FROM runtime_migrations ORDER BY version",
    )
    .all();
  applied.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new RuntimeError("corrupt_data");
    }
  });
  const supportedVersion = migrations.at(-1)?.version ?? 0;
  if (applied.some(({ version }) => version > supportedVersion)) {
    throw new RuntimeError("unsupported_schema");
  }

  for (const existing of applied) {
    const migration = migrations[existing.version - 1]!;
    if (existing.checksum !== migration.checksum) {
      throw new RuntimeError("corrupt_data");
    }
    migration.verify?.(database);
  }

  for (const migration of migrations.slice(applied.length)) {
    database.transaction(() => {
      migration.apply(database);
      migration.verify?.(database);
      database
        .query(
          "INSERT INTO runtime_migrations (version, checksum) VALUES (?, ?)",
        )
        .run(migration.version, migration.checksum);
    })();
  }
}
