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
const PUBLICATION_PREFIX = ".runtime-identity-";
const PUBLICATION_SUFFIX = ".publish";
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

function validateIdentityStat(
  stat: {
    isFile(): boolean;
    mode: number;
    nlink: number;
    size: number;
    uid: number;
  },
  expectedLinks: 1 | 2,
): void {
  if (
    !stat.isFile() ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.nlink !== expectedLinks ||
    stat.size < 1 ||
    stat.size > MAX_IDENTITY_BYTES ||
    (process.getuid && stat.uid !== process.getuid())
  ) {
    throw new RuntimeError("corrupt_data");
  }
}

function publicationPathFor(
  identityPath: string,
  principalId: PrincipalId,
): string {
  return path.join(
    path.dirname(identityPath),
    `${PUBLICATION_PREFIX}${principalId}${PUBLICATION_SUFFIX}`,
  );
}

async function recoverPublicationRemnant(
  identityPath: string,
  identity: z.infer<typeof RuntimeIdentitySchema>,
  identityFile: Awaited<ReturnType<typeof fs.open>>,
  identityStat: Awaited<ReturnType<typeof identityFile.stat>>,
): Promise<void> {
  // The canonical server-minted principal binds the only second pathname that
  // this publication protocol may remove; every other hardlink stays corrupt.
  const publicationPath = publicationPathFor(
    identityPath,
    identity.principalId,
  );
  let publicationFile: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    publicationFile = await fs.open(
      publicationPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const publicationStat = await publicationFile.stat();
    validateIdentityStat(publicationStat, 2);
    if (
      publicationStat.dev !== identityStat.dev ||
      publicationStat.ino !== identityStat.ino
    ) {
      throw new RuntimeError("corrupt_data");
    }
    const pathStat = await fs.lstat(publicationPath);
    validateIdentityStat(pathStat, 2);
    if (
      pathStat.dev !== identityStat.dev ||
      pathStat.ino !== identityStat.ino
    ) {
      throw new RuntimeError("corrupt_data");
    }
    await fs.unlink(publicationPath);
    validateIdentityStat(await publicationFile.stat(), 1);
    validateIdentityStat(await identityFile.stat(), 1);
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError("corrupt_data", { cause: error });
  } finally {
    await publicationFile?.close().catch(() => undefined);
  }
}

async function readIdentity(identityPath: string): Promise<RuntimeIdentity> {
  let file: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    file = await fs.open(
      identityPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const stat = await file.stat();
    if (stat.nlink !== 1 && stat.nlink !== 2) {
      throw new RuntimeError("corrupt_data");
    }
    validateIdentityStat(stat, stat.nlink === 1 ? 1 : 2);
    const text = await file.readFile("utf8");
    const parsed = RuntimeIdentitySchema.parse(JSON.parse(text));
    if (`${canonicalJson(parsed)}\n` !== text) {
      throw new RuntimeError("corrupt_data");
    }
    if (stat.nlink === 2) {
      await recoverPublicationRemnant(identityPath, parsed, file, stat);
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
  const temporaryPath = publicationPathFor(identityPath, identity.principalId);
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
