import { constants, promises as fs } from "node:fs";
import path from "node:path";

import {
  BbContextIdSchema,
  createOpaqueId,
  OpaqueIdSchema,
  PrincipalIdSchema,
  type BbContextId,
  type OpaqueId,
  type PrincipalId,
} from "../../../packages/runtime/src/index.ts";

interface PersistedWorkbenchIdentity {
  schemaVersion: 1;
  principalId: string;
  bbContextId: string;
  rootKeys: Record<string, string>;
}

export interface WorkbenchServerIdentity {
  readonly principalId: PrincipalId;
  readonly bbContextId: BbContextId;
  rootKey(slot: string): OpaqueId;
}

const IDENTITY_FILE = "workbench-server.json";

export async function loadWorkbenchServerIdentity(
  dataRoot: string,
): Promise<WorkbenchServerIdentity> {
  await ensurePrivateDataRoot(dataRoot);
  const identityPath = path.join(dataRoot, IDENTITY_FILE);
  let persisted = await readIdentity(identityPath);
  if (!persisted) {
    persisted = {
      schemaVersion: 1,
      principalId: createOpaqueId(),
      bbContextId: createOpaqueId(),
      rootKeys: {},
    };
    await writeIdentity(identityPath, persisted);
  }

  const rootKey = (slot: string): OpaqueId => {
    const existing = persisted.rootKeys[slot];
    if (existing) return OpaqueIdSchema.parse(existing);
    const created = createOpaqueId();
    persisted.rootKeys[slot] = created;
    return created;
  };

  return {
    principalId: PrincipalIdSchema.parse(persisted.principalId),
    bbContextId: BbContextIdSchema.parse(persisted.bbContextId),
    rootKey,
  };
}

export async function persistWorkbenchServerIdentity(
  dataRoot: string,
  identity: WorkbenchServerIdentity,
  slots: readonly string[],
): Promise<void> {
  const rootKeys = Object.fromEntries(
    slots.map((slot) => [slot, identity.rootKey(slot)]),
  );
  await writeIdentity(path.join(dataRoot, IDENTITY_FILE), {
    schemaVersion: 1,
    principalId: identity.principalId,
    bbContextId: identity.bbContextId,
    rootKeys,
  });
}

async function readIdentity(
  identityPath: string,
): Promise<PersistedWorkbenchIdentity | null> {
  let handle;
  try {
    handle = await fs.open(
      identityPath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if ((error as NodeJS.ErrnoException).code === "ELOOP") {
      throw new TypeError("Unsafe persisted Workbench server identity");
    }
    throw error;
  }
  let parsed: unknown;
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      !ownedByCurrentUser(stat.uid) ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size > 16_384
    ) {
      throw new TypeError("Unsafe persisted Workbench server identity");
    }
    parsed = JSON.parse(await handle.readFile("utf8"));
  } finally {
    await handle.close();
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) throw invalidIdentity();
  if (
    Object.keys(parsed).sort().join(",") !==
    "bbContextId,principalId,rootKeys,schemaVersion"
  ) {
    throw invalidIdentity();
  }
  if (!isRecord(parsed.rootKeys)) throw invalidIdentity();
  PrincipalIdSchema.parse(parsed.principalId);
  BbContextIdSchema.parse(parsed.bbContextId);
  for (const [slot, key] of Object.entries(parsed.rootKeys)) {
    if (!/^[a-z-]+:[A-Za-z0-9_-]+$/u.test(slot)) throw invalidIdentity();
    OpaqueIdSchema.parse(key);
  }
  return parsed as unknown as PersistedWorkbenchIdentity;
}

async function writeIdentity(
  identityPath: string,
  identity: PersistedWorkbenchIdentity,
): Promise<void> {
  const temporaryPath = `${identityPath}.${createOpaqueId()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(identity)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporaryPath, identityPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

async function ensurePrivateDataRoot(dataRoot: string): Promise<void> {
  const stat = await fs.lstat(dataRoot);
  const canonical = await fs.realpath(dataRoot);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    !ownedByCurrentUser(stat.uid) ||
    canonical !== path.resolve(dataRoot) ||
    (stat.mode & 0o777) !== 0o700
  ) {
    throw new TypeError("Unsafe Workbench runtime data root");
  }
}

function ownedByCurrentUser(uid: number): boolean {
  return typeof process.getuid !== "function" || uid === process.getuid();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidIdentity(): TypeError {
  return new TypeError("Invalid persisted Workbench server identity");
}
