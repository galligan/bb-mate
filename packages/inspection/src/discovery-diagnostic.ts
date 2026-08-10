import type { DiscoveryDiagnostic, TrustedRoot } from "./discovery-types.ts";
import { boundedDiagnosticDetail } from "./discovery-errors.ts";

export function discoveryDiagnostic(
  code: string,
  root: TrustedRoot,
  displayPath: string,
  detail: string,
): DiscoveryDiagnostic {
  return {
    code,
    rootKey: root.rootKey,
    displayPath,
    detail: boundedDiagnosticDetail(detail),
  };
}
