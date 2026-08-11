# Plugin Workbench runtime-owned target admission

Date: 2026-08-11
Status: Round-one review remediation and artifact reconciliation in progress
Issue: #62 (slice 62C)
Depends on: PR #78 / 62B merged as `4b6253e4eabd34d437a0d8907c05a87018ddd35c`

## Outcome

Let the private installed `bb-plugin-mate` nav panel explicitly choose one
released-bb project, admit only that project's local source on the primary host
into the supervised runtime, persist source-first development targets in the
runtime catalog, and render only authorized opaque target projections.

The plugin remains a thin full-trust server adapter. Browser callers submit a
project ID, never a filesystem path. The plugin resolves the authoritative path
through released public SDK calls and sends it only over the private inherited-
credential runtime channel. The runtime remains the sole owner of target state.

## Released-contract facts

- Released bb 0.36 `navPanel` receives only `subPath`; `useBbContext().projectId`
  is null on `/plugins/:pluginId/:panelPath`. A current project cannot be
  inferred from the route.
- The public backend SDK exposes `projects.list/get()` and
  `system.config().primaryHostId/dataDir`. Project source paths are available to
  the full-trust plugin backend but must never enter an RPC response.
- Before this slice, the merged runtime API was capability-v1, opened no catalog, and used random
  principal/context identities on every launch. Persistent authorized targets
  require a runtime data root and a runtime-owned stable security subject.
- Canonical target envelopes, private source rows, and the strict stable runtime
  identity live only beneath the runtime data root. The plugin persists no
  target or runtime-identity state.

## Contract

- Advance the supervision protocol/API and route namespace to v2. The strict
  FD3 frame adds one bounded absolute runtime data root; the runtime loads or
  creates its stable principal/context identity there. The bearer remains fresh
  per child. Descriptor and capability documents advertise `targets: true`
  only when the target controller is composed.
- Derive the runtime data root server-side beneath the released bb data
  directory and plugin namespace. Reject malformed, symlinked, incorrectly
  owned, hard-linked, or incorrectly permissioned runtime state; never repair
  unsafe state.
- Add private absent-Origin supervisor routes:
  - `POST /v2/targets/admit` with a strict bounded JSON body containing only the
    backend-resolved source path. The runtime mints the one-use root key.
  - `GET /v2/targets` returning a strict bounded document of public
    `DevelopmentTargetProjection` values for authorized server composition.
    All other methods, queries, origins, principals, scopes, bodies, and unknown
    keys fail closed with the existing redacted runtime problem shape.
- At runtime startup, open one catalog and close it once on shutdown. Admission
  performs trusted-root admission, bounded passive source discovery, the
  one-use inspection-to-runtime candidate transition, and catalog refresh.
  It runs no target code, package scripts, native inventory, npm, Connect, or
  browser work.
- The plugin backend exposes only eligible project options `{id, label}`. An
  explicit `admit({projectId})` is the sole combined runtime-start and
  source-admission edge. It re-resolves the project and primary host at action
  time, requires exactly one `local_path` source on that host (matching the
  released host workspace resolver), and hands only its server-private path to
  the owned runtime client.
- The frontend snapshot advances to a strict schema with finite lifecycle,
  project options, target-state, and bounded target rows. A target row contains
  only opaque ID/revision, display label, and plugin ID. No path-shaped value,
  source kind or identity, native status, package path, host ID, project source
  metadata, PID, command, environment, credential, token, base URL, or
  browser/Connect topology may appear.
- Browser launch remains unavailable under #70. The package remains
  `private: true`; #77 remains the external-distribution blocker.

## TDD execution

1. [x] Add protocol-v2 frame/descriptor/capability and strict target transport
       schemas, including unknown-key, body, origin, scope, and route attacks.
2. [x] Compose the CLI runtime data root, catalog, trusted source bridge,
       admission controller, authorized list route, persistence/reopen, and
       shutdown cleanup.
3. [x] Add plugin data-root composition and an owned runtime client whose
       token/base URL/path facts never enter public snapshots.
4. [x] Add released-SDK project filtering and exact project-ID revalidation;
       make `admit({projectId})` the sole demand/admission edge.
5. [x] Add strict frontend schema/UI for no-project, idle, admitting, empty,
       one, many, partial/unavailable/error, hostile-text, keyboard, axe, and
       deterministic visual states. Do not claim source freshness from a
       catalog read; only a vanished client selection gets a generic list-
       changed message.
6. [x] Extend the moved standalone and extracted private-package bb 0.36 clean
       rooms to prove idle/no DB mutation before demand, admission, opaque list,
       persistence after runtime restart, no target execution, and complete
       cleanup across crash/reload/disable/remove/server loss.
7. [ ] Regenerate exact runtime/package stamps, run all local/hosted gates, pass
       standing and targeted 5/5 exact-head reviews, merge/reconcile, close #62,
       and update #21.

## Verification

- Focused runtime protocol/auth/catalog/HTTP tests and CLI real-listener tests.
- Focused plugin resolver/launcher/supervisor/SDK/RPC/frontend tests.
- `bun run format:check && bun run check && bun run test && bun run build`
- `bun run visual:test && bun run compatibility:latest`
- `bun run standalone:inspect && bun run standalone:test`
- `bun run mate:package:test` from the extracted private package under released
  bb 0.36 with hostile PATH and disposable HOME/XDG/data roots.
- Native plugin declarations/build, exact tar/stamp/license inspection, prompt,
  packet doctor, `git diff --check`, zero threads, and clean GitButler state.
- Two independent exact-head reviews at 5/5 with zero P0-P3 and terminal hosted
  verify, visual, standalone, and GitGuardian checks.

## Stop conditions

Stop before browser-supplied paths, plugin-owned target rows, random-per-restart
catalog identity, target execution, native inventory mutation, PATH/Bun/bunx
fallback, Connect/browser bootstrap, private bb imports, normal-profile
mutation, publication/release/external redistribution, or upstream edits.
Stop if released public SDK cannot authoritatively resolve a selected project's
unique primary-host local source, if the runtime cannot persist/reopen the same
authorized targets, or if any lifecycle leaves a listener/process/catalog lock.

## Done

62C is merged and reconciled; #62 and #21 are current; the installed released-
contract plugin can explicitly admit one eligible project and render runtime-
owned opaque targets; local/hosted/package/standalone/lifecycle gates pass; two
independent exact-head reviews are 5/5 with zero P0-P3; and every release,
browser-bootstrap, upstream, Connect, and normal-profile boundary remains
intact.
