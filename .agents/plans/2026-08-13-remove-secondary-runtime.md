# Remove the secondary Studio runtime

## Outcome

Studio discovery runs entirely inside the bb plugin process. The source CLI
continues to provide passive inspection and the Fixture surface lab, while the
managed Studio package contains no executable child runtime and exposes no
private listener or supervised `serve` command.

## Proof

- A repository-level contract rejects secondary-runtime modules, package
  payload paths, CLI command wiring, process spawning, and listener creation in
  the Studio backend.
- The managed-package clean room proves the schema-v4 RPC directly through bb
  and observes no Studio child process or listening socket.
- Runtime, CLI, Studio, script, package inspection, format, check, and build
  gates pass without the standalone workflow job.

## Steps

1. [completed] Add the failing absence/call-graph contract.
2. [completed] Remove the plugin launcher, resolver, supervisor, client, runtime
   artifact, and background-service declarations.
3. [completed] Remove the private CLI serve/listener/resource/supervisor path and
   dead HTTP, identity, store, and object-service modules.
4. [completed] Simplify package construction and inspection around the native
   plugin plus source CLI, with no runtime embedding or stamp.
5. [completed] Rewrite managed clean-room proof around schema v4 and no child or
   listener, then remove the obsolete standalone CI job.
6. [completed] Run focused and aggregate verification and inspect the exact diff.

## Boundaries

- No upstream bb edits, publication, VCS operations, GitHub operations, or live
  primary-profile bb mutation.
- Preserve the source CLI inspection/check/live delegation and Fixture lab.
- Preserve catalog/history behavior used by the in-process plugin.
