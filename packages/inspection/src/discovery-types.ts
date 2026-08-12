export const TRUSTED_ROOT_KINDS = [
  "current-project",
  "explicit",
  "pinned",
] as const;

export type TrustedRootKind = (typeof TRUSTED_ROOT_KINDS)[number];

export interface TrustedRootInput {
  rootKey: string;
  kind: TrustedRootKind;
  path: string;
  displayName?: string;
}

export interface DiscoveryOperationOptions {
  readonly signal?: AbortSignal;
}

export interface TrustedRoot {
  readonly rootKey: string;
  readonly kind: TrustedRootKind;
  readonly displayName: string;
}

export interface DiscoveryDiagnostic {
  readonly code: string;
  readonly rootKey: string | null;
  readonly displayPath: string | null;
  readonly detail: string;
}

export interface TrustedRootAdmission {
  readonly roots: readonly TrustedRoot[];
  readonly aliases: readonly TrustedRootAlias[];
  readonly diagnostics: readonly DiscoveryDiagnostic[];
}

export interface TrustedRootAlias {
  readonly rootKey: string;
  readonly admittedRootKey: string;
}

export interface SourceCandidate {
  readonly rootKey: string;
  readonly canonicalRoot: string;
  readonly displayPath: string;
  readonly packageName: string;
  readonly version: string;
  readonly pluginId: string;
  readonly displayName: string;
  readonly hasServer: boolean;
  readonly hasApp: boolean;
}

export interface IssuedSourceCandidateFacts extends SourceCandidate {
  readonly rootKind: TrustedRootKind;
}

export interface SourceDiscoveryResult {
  readonly candidates: readonly SourceCandidate[];
  readonly diagnostics: readonly DiscoveryDiagnostic[];
}
