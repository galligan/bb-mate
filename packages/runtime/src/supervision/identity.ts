import { constants, promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  BbContextIdSchema,
  createOpaqueId,
  PrincipalIdSchema,
  type BbContextId,
  type OpaqueIdRandomSource,
  type PrincipalId,
} from "../contracts/ids.ts";
import { canonicalJson } from "../contracts/objects.ts";
import { RuntimeError } from "../errors.ts";
import { prepareRuntimeDataRoot } from "../persistence/database.ts";

const IDENTITY_FILE = "runtime-identity.json";
const MAX_IDENTITY_BYTES = 1024;
const RuntimeIdentitySchema = z.strictObject({
  schemaVersion: z.literal(1),
  principalId: PrincipalIdSchema,
  bbContextId: BbContextIdSchema,
});

export interface RuntimeIdentity {
  readonly principalId: PrincipalId;
  readonly bbContextId: BbContextId;
}

export interface LoadOrCreateRuntimeIdentityOptions {
  readonly dataRoot: string;
  readonly randomSource?: OpaqueIdRandomSource;
}

function validateIdentityStat(stat: {
  isFile(): boolean;
  mode: number;
  nlink: number;
  size: number;
  uid: number;
}): void {
  if (
    !stat.isFile() ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.nlink !== 1 ||
    stat.size < 1 ||
    stat.size > MAX_IDENTITY_BYTES ||
    (process.getuid && stat.uid !== process.getuid())
  ) {
    throw new RuntimeError("corrupt_data");
  }
}

async function readIdentity(identityPath: string): Promise<RuntimeIdentity> {
  let file: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    file = await fs.open(
      identityPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    validateIdentityStat(await file.stat());
    const text = await file.readFile("utf8");
    const parsed = RuntimeIdentitySchema.parse(JSON.parse(text));
    if (`${canonicalJson(parsed)}\n` !== text) {
      throw new RuntimeError("corrupt_data");
    }
    return Object.freeze({
      principalId: parsed.principalId,
      bbContextId: parsed.bbContextId,
    });
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError("corrupt_data", { cause: error });
  } finally {
    await file?.close().catch(() => undefined);
  }
}

async function identityExists(identityPath: string): Promise<boolean> {
  try {
    await fs.lstat(identityPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new RuntimeError("corrupt_data", { cause: error });
  }
}

export async function loadOrCreateRuntimeIdentity(
  options: LoadOrCreateRuntimeIdentityOptions,
): Promise<RuntimeIdentity> {
  const dataRoot = await prepareRuntimeDataRoot(options.dataRoot);
  const identityPath = path.join(dataRoot, IDENTITY_FILE);
  if (await identityExists(identityPath)) return readIdentity(identityPath);

  const identity = RuntimeIdentitySchema.parse({
    schemaVersion: 1,
    principalId: PrincipalIdSchema.parse(createOpaqueId(options.randomSource)),
    bbContextId: BbContextIdSchema.parse(createOpaqueId(options.randomSource)),
  });
  const temporaryPath = path.join(
    dataRoot,
    `.runtime-identity-${createOpaqueId(options.randomSource)}.tmp`,
  );
  let temporaryCreated = false;
  try {
    const file = await fs.open(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    try {
      await file.writeFile(`${canonicalJson(identity)}\n`, "utf8");
      await file.sync();
      await file.chmod(0o600);
    } finally {
      await file.close();
    }
    try {
      await fs.link(temporaryPath, identityPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError("internal", { cause: error });
  } finally {
    if (temporaryCreated) {
      await fs.unlink(temporaryPath).catch(() => undefined);
    }
  }
  return readIdentity(identityPath);
}
