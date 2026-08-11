/**
 * Server-only handoff for consuming a discovery candidate exactly once.
 *
 * Keep this capability off the browser-safe package root. Runtime composition
 * imports the explicit subpath so candidate paths never cross a transport.
 */
export {
  consumeIssuedSourceCandidate,
  readSourceCandidateTransition,
} from "./source-candidate-transition.ts";
