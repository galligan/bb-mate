export const MAX_DIAGNOSTIC_CHARACTERS = 8192;

export class DiscoveryFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function boundedDiagnosticDetail(detail: string): string {
  return detail.slice(0, MAX_DIAGNOSTIC_CHARACTERS);
}
