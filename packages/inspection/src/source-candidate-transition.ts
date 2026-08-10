import path from "node:path";
import type {
  IssuedSourceCandidateFacts,
  SourceCandidate,
  TrustedRoot,
} from "./discovery-types.ts";
import {
  readBoundedManifestSnapshot,
  type BoundedManifestSnapshot,
} from "./discovery-manifest-reader.ts";
import { attestScanDirectory, isContained } from "./discovery-path-safety.ts";
import { trustedRootDetails } from "./trusted-roots.ts";

export interface CandidateDirectoryIdentity {
  readonly canonicalRoot: string;
  readonly device: number;
  readonly inode: number;
}

export interface CandidateManifestIdentity {
  readonly device: number;
  readonly inode: number;
  readonly sha256: string;
}

export interface SourceCandidateTransitionFacts extends IssuedSourceCandidateFacts {
  readonly directoryIdentity: Readonly<CandidateDirectoryIdentity>;
  readonly manifestIdentity: Readonly<CandidateManifestIdentity>;
}

interface IssuedCandidateRecord {
  readonly root: TrustedRoot;
  readonly facts: IssuedSourceCandidateFacts;
  readonly directoryIdentity: CandidateDirectoryIdentity;
  readonly manifestIdentity: CandidateManifestIdentity;
}

const issuedCandidates = new WeakMap<object, IssuedCandidateRecord>();
const consumedCandidates = new WeakSet<object>();
const activeTransitions = new WeakMap<object, SourceCandidateTransitionFacts>();

export async function issueSourceCandidate(
  root: TrustedRoot,
  candidate: SourceCandidate,
  manifest: BoundedManifestSnapshot,
): Promise<SourceCandidate> {
  Object.defineProperty(candidate, "toJSON", {
    enumerable: false,
    value: () => {
      throw new TypeError("source candidates are server-private");
    },
  });
  Object.freeze(candidate);
  const directoryIdentity = await captureCandidateDirectoryIdentity(
    root,
    candidate.canonicalRoot,
  );
  issuedCandidates.set(candidate, {
    root,
    facts: Object.freeze({ ...candidate, rootKind: root.kind }),
    directoryIdentity,
    manifestIdentity: Object.freeze({
      device: manifest.device,
      inode: manifest.inode,
      sha256: manifest.sha256,
    }),
  });
  return candidate;
}

export async function consumeIssuedSourceCandidate<T>(
  candidate: unknown,
  consumer: (transition: unknown) => T | Promise<T>,
): Promise<T> {
  if (typeof candidate !== "object" || candidate === null) throw notIssued();
  const issued = issuedCandidates.get(candidate);
  if (!issued || consumedCandidates.has(candidate)) throw notIssued();
  consumedCandidates.add(candidate);

  await revalidateIssuedCandidate(issued);
  const transition = createTransition();
  activeTransitions.set(transition, freezeTransitionFacts(issued));
  try {
    let result: T | undefined;
    let consumerFailed = false;
    let consumerError: unknown;
    try {
      result = await consumer(transition);
    } catch (error) {
      consumerFailed = true;
      consumerError = error;
    }
    await revalidateIssuedCandidate(issued);
    if (consumerFailed) throw consumerError;
    return result as T;
  } finally {
    activeTransitions.delete(transition);
  }
}

export function readSourceCandidateTransition(
  transition: unknown,
): Readonly<SourceCandidateTransitionFacts> {
  if (typeof transition !== "object" || transition === null) {
    throw transitionNotActive();
  }
  const facts = activeTransitions.get(transition);
  if (!facts) throw transitionNotActive();
  return Object.freeze({
    ...facts,
    directoryIdentity: Object.freeze({ ...facts.directoryIdentity }),
    manifestIdentity: Object.freeze({ ...facts.manifestIdentity }),
  });
}

async function revalidateIssuedCandidate(
  issued: IssuedCandidateRecord,
): Promise<void> {
  try {
    const rootDetails = trustedRootDetails(issued.root);
    if (
      issued.facts.rootKey !== issued.root.rootKey ||
      issued.facts.rootKind !== issued.root.kind ||
      !isContained(rootDetails.canonicalRoot, issued.facts.canonicalRoot)
    ) {
      throw notIssued();
    }
    const before = await captureCandidateDirectoryIdentity(
      issued.root,
      issued.facts.canonicalRoot,
    );
    if (!sameDirectoryIdentity(before, issued.directoryIdentity)) {
      throw notIssued();
    }
    const manifest = await readBoundedManifestSnapshot(
      path.join(issued.facts.canonicalRoot, "package.json"),
    );
    if (
      manifest === null ||
      manifest.device !== issued.manifestIdentity.device ||
      manifest.inode !== issued.manifestIdentity.inode ||
      manifest.sha256 !== issued.manifestIdentity.sha256
    ) {
      throw notIssued();
    }
    const after = await captureCandidateDirectoryIdentity(
      issued.root,
      issued.facts.canonicalRoot,
    );
    if (!sameDirectoryIdentity(after, issued.directoryIdentity)) {
      throw notIssued();
    }
  } catch {
    throw notIssued();
  }
}

function freezeTransitionFacts(
  issued: IssuedCandidateRecord,
): SourceCandidateTransitionFacts {
  return Object.freeze({
    ...issued.facts,
    directoryIdentity: Object.freeze({ ...issued.directoryIdentity }),
    manifestIdentity: Object.freeze({ ...issued.manifestIdentity }),
  });
}

function createTransition(): object {
  const transition = {};
  Object.defineProperty(transition, "toJSON", {
    enumerable: false,
    value: () => {
      throw new TypeError("source candidate transitions are server-private");
    },
  });
  return Object.freeze(transition);
}

async function captureCandidateDirectoryIdentity(
  root: TrustedRoot,
  candidateRoot: string,
): Promise<CandidateDirectoryIdentity> {
  const attestation = await attestScanDirectory(
    candidateRoot,
    trustedRootDetails(root).canonicalRoot,
  );
  if (attestation.canonicalPath !== candidateRoot) throw notIssued();
  return {
    canonicalRoot: attestation.canonicalPath,
    device: attestation.dev,
    inode: attestation.ino,
  };
}

function sameDirectoryIdentity(
  left: CandidateDirectoryIdentity,
  right: CandidateDirectoryIdentity,
): boolean {
  return (
    left.canonicalRoot === right.canonicalRoot &&
    left.device === right.device &&
    left.inode === right.inode
  );
}

function notIssued(): TypeError {
  return new TypeError("source candidate was not issued by discovery");
}

function transitionNotActive(): TypeError {
  return new TypeError("source candidate transition is not active");
}
