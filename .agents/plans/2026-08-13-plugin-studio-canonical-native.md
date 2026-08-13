# Canonical Plugin Studio and native-runtime execution

Status: Ready-PR horizon complete; stack unmerged

## Outcome

Make `bb-plugin-studio` the only maintained product identity, run primary-host
development-source discovery in the bb plugin process, persist its catalog in
bb-owned storage, and provide a source-installable trial that does not ship or
start a secondary runtime server.

## Authority and boundaries

- The user explicitly authorized removing the installed `mate` plugin and
  forging ahead with the canonical `studio` identity.
- The `mate` registration was removed on 2026-08-13. Its residual 172 KiB data
  root was moved recoverably to
  `~/.Trash/bb-plugin-mate-state-removed-20260813` after recording only table
  counts. No values, secrets, or payloads were copied or inspected.
- Upstream bb changes, npm publication, GitHub releases, announcements, and
  destructive use of the normal profile beyond the explicitly removed `mate`
  target remain out of scope.
- Enrolled-machine discovery remains unavailable until a bounded public bb
  host-routed discovery contract exists. Do not substitute terminals,
  unrestricted commands, or recursively materialized `files.listPaths`.
- Historical Git history, completed `.agents` records, changelog entries, and
  released-package evidence may retain their then-current names.

## Canonical identity

- Repository: `galligan/bb-plugin-studio`
- Publishable package and CLI bin: `bb-plugin-studio`
- Derived bb plugin ID: `studio`
- Source package: `plugins/studio`
- Private workspace scope: `@bb-plugin-studio/*`
- Skill: `plugin-studio`
- Secondary runtime artifact: none after #101 / PR #114
- Environment/session/temp names: `BB_PLUGIN_STUDIO_*` and Plugin Studio
  terminology

The publishable plugin package owns both the native bb plugin manifest and the
compiled CLI bin. This avoids competing npm names and gives users one package
identity.

## Execution stack

1. Canonical identity and package layout
   - Add a public naming/package tracer before changing manifests.
   - Rename the source tree, private workspace packages, CLI command, plugin,
     skill, runtime artifact, environment/session/temp identifiers, symbols,
     maintained docs, workflows, and package inspectors.
   - Keep old literals only in approved historical evidence or narrow migration
     fixtures, enforced by a naming test.

2. Native catalog storage
   - Create the catalog schema through `bb.storage.database()` and supported
     migrations.
   - Preserve target IDs, revisions, scopes, retirements, capacity, retention,
     and cursor semantics.
   - Prove clean new-install behavior first. Test any legacy importer only with
     sanitized fixtures; do not read the trashed primary data.

3. In-process discovery
   - Invoke the existing inspection kernel for bb-authorized primary-host
     `local_path` projects.
   - Preserve strict UTF-8, symlink/race checks, candidate/entry/matcher/depth
     bounds, cancellation, fair partial truth, and target nonexecution.
   - Deduplicate concurrent refreshes and cancel on plugin disposal.
   - Compare normalized results against the current controller fixtures before
     removing the legacy path.

4. Native product state
   - Replace runtime handshake language with catalog-oriented idle, scanning,
     ready, partial, and failed states.
   - Preserve project sorting, target detail, task actions, Back navigation,
     narrow/dark visuals, accessibility, and path-free RPC projections.

5. Remove the child boundary
   - Remove the supervisor, launcher, resolver, target client, loopback HTTP
     listener, bearer protocol, runtime identity, capability handshake,
     packaged executable, and `serve` command from the canonical package.
   - Retain only source commands that are independently useful without a child
     process.

6. Shareable trial and live use
   - Build and install `path:<repo>/plugins/studio` in disposable exact bb 0.36
     and 0.37 profiles.
   - Prove plugin ID `studio`, native status/refresh, BB-registered project and
     plugin discovery, detail/task/Back behavior, reload/disposal, no child
     process, no listener, no runtime executable, no path leakage, and complete
     cleanup.
   - Document clone, frozen install, Fixture preview, disposable Live bb,
     verification, cleanup, and known enrolled-host limitation.
   - After disposable proof and explicit final verification, install the
     canonical path plugin in the normal profile; there is no legacy `mate`
     registration left to migrate.

## Required verification

- Focused RED/GREEN tracers for every behavioral slice
- Naming audit over maintained sources
- Exact minimum bb 0.36 and verified-through bb 0.37 lanes
- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run build`
- `bun run visual:test`
- Canonical package inspection and clean-room install
- No-child-process, no-listener, no-runtime-artifact assertions
- Disposable Live bb catalog/detail/task/Back proof
- Normal-profile fingerprint before and after the final canonical install
- Exact-head hosted CI and two independent zero-finding reviews before ready

## Completion evidence

- Ready stack: #108 canonical identity → #109 bounded enumeration → #110
  bb-owned catalog → #113 in-process discovery → #114 runtime removal.
- Every exact head is mergeable, hosted-green, and free of review threads; #113
  and #114 each have clean 5/5 replacement reviews.
- Final native package: 12 files, SHA-256
  `67b24251e578b94212441ffc893d4929122cfa4b9c1d92c40895e5396ec5f725`.
- Disposable exact bb 0.36 and 0.37 package/lifecycle proofs pass.
- The live `studio` plugin is source-correct, enabled, running, schema-v4, and
  exposes the canonical Plugin Studio target at revision 1 with no `mate`,
  secondary process, or private listener.
- Current root, target-detail, and Back navigation were verified. Preview
  remains truthfully unavailable under #70.
- No merge, npm publication, release, upstream bb change, or inspection of the
  recoverably removed legacy data was performed.

## Stop conditions

- Stop rather than scanning an enrolled host through an unsafe fallback.
- Stop rather than publishing, releasing, or announcing without new authority.
- Stop if the canonical package cannot install without private bb APIs.
- Stop if removal of child-runtime code would weaken passive nonexecution,
  bounded traversal, path privacy, or catalog durability.
