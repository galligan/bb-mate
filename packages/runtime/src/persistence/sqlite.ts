export type SqliteBinding =
  string | number | bigint | boolean | null | Uint8Array;
export type SqliteBindings = SqliteBinding[];

export interface SqliteRunResult {
  readonly changes: number;
}

export interface SqliteStatement<
  Row = unknown,
  Bindings extends readonly unknown[] = SqliteBindings,
> {
  get(...bindings: Bindings): Row | null | undefined;
  all(...bindings: Bindings): Row[];
  run(...bindings: Bindings): SqliteRunResult;
}

/**
 * The catalog's deliberately small SQLite dependency.
 *
 * Bun's SQLite connection and bb's better-sqlite3 connection are adapted to
 * this interface at their respective ownership boundaries. Catalog code does
 * not own connection modes or lifecycle.
 */
export interface SqliteDatabase {
  exec(sql: string): unknown;
  query<Row = unknown, Bindings extends readonly unknown[] = SqliteBindings>(
    sql: string,
  ): SqliteStatement<Row, Bindings>;
  transaction<Bindings extends readonly unknown[], Result>(
    operation: (...bindings: Bindings) => Result,
  ): (...bindings: Bindings) => Result;
}

interface PreparedSqliteStatement {
  get(...bindings: unknown[]): unknown;
  all(...bindings: unknown[]): unknown[];
  run(...bindings: unknown[]): { readonly changes: number | bigint };
}

export interface PreparedSqliteDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): PreparedSqliteStatement;
  transaction(
    operation: (...bindings: any[]) => unknown,
  ): (...bindings: any[]) => unknown;
}

interface QuerySqliteStatement {
  get(...bindings: any[]): unknown;
  all(...bindings: any[]): unknown[];
  run(...bindings: any[]): { readonly changes: number | bigint };
}

export interface QuerySqliteDatabase {
  exec(sql: string): unknown;
  query(sql: string): QuerySqliteStatement;
  transaction(
    operation: (...bindings: any[]) => unknown,
  ): (...bindings: any[]) => unknown;
}

/** Adapt Bun's query-oriented SQLite API. */
export function adaptQuerySqliteDatabase(
  database: QuerySqliteDatabase,
): SqliteDatabase {
  return {
    exec: (sql) => database.exec(sql),
    query<Row, Bindings extends readonly unknown[]>(sql: string) {
      const statement = database.query(sql);
      return {
        get: (...bindings: Bindings) =>
          statement.get(...bindings) as Row | null | undefined,
        all: (...bindings: Bindings) => statement.all(...bindings) as Row[],
        run: (...bindings: Bindings) => {
          const result = statement.run(...bindings);
          return { changes: Number(result.changes) };
        },
      };
    },
    transaction(operation) {
      return database.transaction(operation) as typeof operation;
    },
  };
}

/** Adapt the better-sqlite3 shape exposed by bb.storage.database(). */
export function adaptPreparedSqliteDatabase(
  database: PreparedSqliteDatabase,
): SqliteDatabase {
  return {
    exec: (sql) => database.exec(sql),
    query<Row, Bindings extends readonly unknown[]>(sql: string) {
      const statement = database.prepare(sql);
      return {
        get: (...bindings: Bindings) =>
          statement.get(...bindings) as Row | null | undefined,
        all: (...bindings: Bindings) => statement.all(...bindings) as Row[],
        run: (...bindings: Bindings) => {
          const result = statement.run(...bindings);
          return { changes: Number(result.changes) };
        },
      };
    },
    transaction(operation) {
      return database.transaction(operation) as typeof operation;
    },
  };
}
