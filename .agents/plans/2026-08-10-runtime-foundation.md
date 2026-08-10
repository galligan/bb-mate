# Workbench runtime foundation

Date: 2026-08-10
Status: Implementation and local verification complete; review and merge pending
Issue: [#55](https://github.com/galligan/bb-mate/issues/55)
Goal: `.agents/goals/2026-08-10-plugin-workbench/`

## Outcome

Create one private `@bb-mate/runtime` workspace package that later CLI, plugin,
browser, native-tool, and stdio-MCP adapters can share. This slice owns strict
versioned envelopes, verified request context and default-deny authorization,
deterministic SQLite persistence, an atomic pull-only event feed, and a small
injectable loopback HTTP policy/handler. It does not ship a listener, browser
bootstrap, object-specific workflow, artifact store, supervisor, or MCP
transport.

## Decisions

- Keep one package with focused internal modules. Do not split contracts,
  persistence, authorization, events, and HTTP into separate packages before
  real consumers require that boundary.
- Declare Zod directly and use Bun's built-in SQLite. Do not add another native
  database binding.
- Reserve the complete Workbench object-kind vocabulary, but make concrete
  payload codecs registry-driven. Production ships no invented target,
  session, annotation, capture, comparison, brief, or review payload merely to
  satisfy this foundation.
- Treat `principalId` as the verified security subject and `kind` as the
  credential class. Multiple adapters may later receive distinct credentials
  for the same subject while another subject remains isolated.
- Track issued request-context objects by exact module-private identity. A
  copied, inherited, or symbol-reflected object never inherits authority.
- Bound every generic JSON value to 8,192-character strings/property names,
  100 array items/object properties, and a 256 KiB canonical UTF-8 envelope
  before a concrete codec may admit it. Every parsed envelope is therefore
  serializable under the same bound.
- Store principal, bb-context, target, optional session, revision, and integer
  timestamps in database columns outside canonical payload JSON. IDs do not
  authorize access. Reads recompute canonical payload bytes and fail closed on
  any stored representation drift.
- Use pull pagination over committed event rows. Events identify the changed
  object and its bindings but never copy user payloads, comments, paths,
  credentials, or binary data.
- Use SQLite's rollback journal in this first slice, avoiding WAL/SHM mode and
  its additional file-mode lifecycle until a measured concurrency need exists.
- Expose only an injectable Fetch handler. `GET /healthz` is constant and
  unauthenticated; `GET /v1/capabilities` requires verified `runtime:read`.
  Every other route is absent or method-rejected.

## Implementation

1. [x] Add the private package, curated exports, direct dependencies, scripts,
       and a focused package-level type/test gate.
2. [x] Define strict identifiers, principal/request contexts, object envelopes,
       codec registration, typed errors, and canonical JSON serialization.
3. [x] Implement explicit scopes and table-driven default-deny authorization
       for principal, bb-context, target, session, revocation, and revision.
4. [x] Implement a symlink-rejecting 0700 data-root boundary, 0600 database,
       transactional append-only migrations, corruption/newer-schema failure,
       and deterministic injectable clock/ID sources.
5. [x] Implement atomic object create/read/update plus minimal redacted events,
       optimistic revisions, bounded pull cursors, restart persistence, and
       transaction rollback semantics.
6. [x] Implement the exact `127.0.0.1:<port>` Host/Origin/auth/concurrency/body
       policy and security headers around constant health and authenticated
       capabilities handlers.
7. [x] Add schema, canonicalization, IDOR, migration/corruption, event,
       file-mode, HTTP policy, and forbidden-surface tests. Audit exports/routes
       for every deferred feature.
8. [ ] Run focused and aggregate checks, two independent 5/5 review lanes,
       hosted CI, issue/PR/thread gates, SHA-pinned merge, and clean GitButler
       reconciliation.

## Verification

- `bun --filter @bb-mate/runtime check`
- `bun --filter @bb-mate/runtime test`
- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run build`
- Static route/export audit proving no browser bootstrap, artifact upload,
  target path, generic object-write HTTP route, SSE/WebSocket, `/mcp`, URL
  fetch, shell/eval, native lifecycle, destructive/import/export, or remote
  bind surface.

## Security matrix

- Schema: unknown keys, wrong versions/kinds/IDs/timestamps/revisions,
  unregistered codecs, oversized text/arrays, and non-canonical payloads fail.
- Authorization: missing scope, revoked credential, different subject, bb
  context, target, or session, and known foreign object IDs fail identically.
- Persistence: fresh/idempotent/ordered migrations, injected rollback, newer
  schema, corruption, duplicate IDs, revision conflict, restart, and concurrent
  transaction behavior are explicit and non-destructive.
- Events: object mutation and event commit atomically; cursors/page limits and
  bindings prevent cross-context leakage; event bodies remain redacted.
- Filesystem: permissive-umask subprocess proof still yields 0700/0600; unsafe
  existing roots/databases and symlink roots fail closed; no file escapes the
  task-owned root.
- HTTP: hostile/malformed/duplicate Host and Origin fail even with auth;
  unauthenticated, wrong-scope, revoked, oversized, wrong-method/content, and
  over-concurrency requests fail with typed redacted responses and exact
  restrictive headers; no wildcard CORS exists.

## Boundaries

- No browser bootstrap/cookie/session credential issuance, same-instance
  topology, static Workbench assets, target discovery, concrete authoring
  objects, artifact files, capture/export/import/retention, process supervisor,
  MCP transport, agent tools, remote proxy, or secret store.
- No private/copy of bb or SDK internals, target-plugin execution, arbitrary
  filesystem browsing, normal-profile mutation, Connect action, automatic
  bunx, publication, tag/release, signing/notarization, or upstream submission.
- `../bb` remains a read-only reference only.

## Done

The package and its public export surface match this boundary; all security and
persistence matrices pass; the exact PR head receives standing and targeted
5/5 reviews with zero unresolved P0-P2; hosted checks are green; #55 is closed;
the PR is merged; and GitButler is clean on current `main`.
