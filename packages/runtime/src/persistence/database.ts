import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { RuntimeError } from "../errors.ts";
import { applyRuntimeMigrations, type RuntimeMigration } from "./migrations.ts";

const DATABASE_NAME = "workbench.sqlite3";
const SQLITE_SIDECAR_SUFFIXES = ["-journal", "-wal", "-shm"] as const;

export interface RuntimeDatabase {
  readonly dataRoot: string;
  readonly databasePath: string;
  readonly database: Database;
  close(): void;
}

export interface OpenRuntimeDatabaseOptions {
  readonly dataRoot: string;
  readonly migrations?: readonly RuntimeMigration[];
}

async function rejectSymlinkComponents(absolutePath: string): Promise<void> {
  const { root } = path.parse(absolutePath);
  let current = root;
  for (const component of path.relative(root, absolutePath).split(path.sep)) {
    if (!component) continue;
    current = path.join(current, component);
    const entry = await fs.lstat(current).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    if (!entry) return;
    if (entry.isSymbolicLink()) {
      throw new RuntimeError("invalid_request", {
        cause: new Error("Runtime data root paths must not contain symlinks"),
      });
    }
  }
}

async function rejectWalDatabaseHeader(databasePath: string): Promise<void> {
  const file = await fs.open(databasePath, "r");
  try {
    const header = Buffer.alloc(20);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (
      bytesRead === header.length &&
      header.subarray(0, 16).toString("binary") === "SQLite format 3\0" &&
      (header[18] === 2 || header[19] === 2)
    ) {
      throw new RuntimeError("corrupt_data", {
        cause: new Error("WAL-mode databases are not supported"),
      });
    }
  } finally {
    await file.close();
  }
}

export async function prepareRuntimeDataRoot(input: string): Promise<string> {
  if (!input || !path.isAbsolute(input)) {
    throw new RuntimeError("invalid_request");
  }
  const dataRoot = path.resolve(input);
  await rejectSymlinkComponents(dataRoot);
  const existingRoot = await fs.lstat(dataRoot).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (existingRoot?.isSymbolicLink()) {
    throw new RuntimeError("invalid_request", {
      cause: new Error("Runtime data root must not be a symbolic link"),
    });
  }
  if (existingRoot) {
    if (!existingRoot.isDirectory()) {
      throw new RuntimeError("invalid_request", {
        cause: new Error("Runtime data root must be a directory"),
      });
    }
    if ((existingRoot.mode & 0o777) !== 0o700) {
      throw new RuntimeError("invalid_request", {
        cause: new Error("Runtime data root permissions must be 0700"),
      });
    }
    if (process.getuid && existingRoot.uid !== process.getuid()) {
      throw new RuntimeError("invalid_request", {
        cause: new Error("Runtime data root must be owned by the current user"),
      });
    }
  } else {
    await fs.mkdir(dataRoot, { mode: 0o700 });
    await fs.chmod(dataRoot, 0o700);
  }
  return dataRoot;
}

export async function openRuntimeDatabase(
  options: OpenRuntimeDatabaseOptions,
): Promise<RuntimeDatabase> {
  const dataRoot = await prepareRuntimeDataRoot(options.dataRoot);

  const databasePath = path.join(dataRoot, DATABASE_NAME);
  const existingDatabase = await fs
    .lstat(databasePath)
    .catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
  if (existingDatabase) {
    if (existingDatabase.isSymbolicLink()) {
      throw new RuntimeError("invalid_request", {
        cause: new Error("Runtime database must not be a symbolic link"),
      });
    }
    if (!existingDatabase.isFile()) {
      throw new RuntimeError("invalid_request", {
        cause: new Error("Runtime database must be a regular file"),
      });
    }
    if ((existingDatabase.mode & 0o777) !== 0o600) {
      throw new RuntimeError("invalid_request", {
        cause: new Error("Runtime database permissions must be 0600"),
      });
    }
    if (existingDatabase.nlink !== 1) {
      throw new RuntimeError("invalid_request", {
        cause: new Error("Runtime database must not be hard linked"),
      });
    }
    if (process.getuid && existingDatabase.uid !== process.getuid()) {
      throw new RuntimeError("invalid_request", {
        cause: new Error("Runtime database must be owned by the current user"),
      });
    }
  } else {
    const file = await fs.open(databasePath, "wx", 0o600);
    await file.close();
    await fs.chmod(databasePath, 0o600);
  }
  for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
    const sidecar = await fs
      .lstat(`${databasePath}${suffix}`)
      .catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return undefined;
        throw error;
      });
    if (!sidecar) continue;
    if (suffix !== "-journal") {
      throw new RuntimeError("invalid_request", {
        cause: new Error("WAL and shared-memory sidecars are not supported"),
      });
    }
    if (
      sidecar.isSymbolicLink() ||
      !sidecar.isFile() ||
      (sidecar.mode & 0o777) !== 0o600 ||
      sidecar.nlink !== 1 ||
      (process.getuid && sidecar.uid !== process.getuid())
    ) {
      throw new RuntimeError("invalid_request", {
        cause: new Error("Runtime rollback journals must be private files"),
      });
    }
  }
  await rejectWalDatabaseHeader(databasePath);

  let database: Database | undefined;
  try {
    database = new Database(databasePath, {
      create: true,
      strict: true,
    });
    const journalMode = database.query("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    if (journalMode.journal_mode !== "delete") {
      throw new RuntimeError("corrupt_data");
    }
    database.exec("PRAGMA journal_mode = DELETE");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec("PRAGMA synchronous = FULL");
    const integrity = database.query("PRAGMA quick_check").get() as {
      quick_check: string;
    };
    if (integrity.quick_check !== "ok") {
      throw new RuntimeError("corrupt_data");
    }
    applyRuntimeMigrations(
      database,
      options.migrations ?? [],
      existingDatabase === undefined,
    );
  } catch (error) {
    database?.close();
    if (
      typeof error === "object" &&
      error !== null &&
      (("name" in error && error.name === "SQLiteError") ||
        ("code" in error &&
          typeof error.code === "string" &&
          error.code.startsWith("SQLITE_")))
    ) {
      throw new RuntimeError("corrupt_data", { cause: error });
    }
    throw error;
  }

  return {
    dataRoot,
    databasePath,
    database,
    close: () => database.close(),
  };
}
