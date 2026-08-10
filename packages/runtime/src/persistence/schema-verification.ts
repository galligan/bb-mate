import type { Database } from "bun:sqlite";

import { RuntimeError } from "../errors.ts";

export interface ExpectedSchemaEntry {
  readonly type: "table" | "index" | "trigger";
  readonly name: string;
  readonly sql: string;
}

interface SchemaRow {
  readonly type: string;
  readonly name: string;
  readonly sql: string;
}

function normalizeSql(sql: string): string {
  return sql
    .replace(/\bIF\s+NOT\s+EXISTS\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/;$/u, "");
}

export function verifyOwnedSchema(
  database: Database,
  tableName: string,
  expected: readonly ExpectedSchemaEntry[],
): void {
  const actual = database
    .query<SchemaRow, [string, string]>(
      `
      SELECT type, name, sql
      FROM sqlite_schema
      WHERE sql IS NOT NULL
        AND (tbl_name = ? OR name = ?)
      ORDER BY type, name
    `,
    )
    .all(tableName, tableName);
  const normalizedExpected = expected
    .map((entry) => ({
      type: entry.type,
      name: entry.name,
      sql: normalizeSql(entry.sql),
    }))
    .sort((left, right) =>
      `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`),
    );
  const normalizedActual = actual.map((entry) => ({
    ...entry,
    sql: normalizeSql(entry.sql),
  }));

  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    throw new RuntimeError("corrupt_data");
  }
}
