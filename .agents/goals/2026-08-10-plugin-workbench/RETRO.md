# Plugin Workbench goal retrospective and evidence ledger

Date started: 2026-08-10
Status: Active

## Summary

The execution goal is active. Compatibility baseline #52, spec/goal PR #53,
released-capability Gate 0 PR #68, and standalone-runtime PR #69 are merged.
The narrowed runtime domain/security foundation #55 is merged through PR #71
and reconciled. Source-first development-target discovery #57 is merged,
reconciled, and closed. Host-shell #62 is the active milestone. Slice 62A is
merged and reconciled through PR #76. Slice 62B's installed host/status shell,
exact packaged-runtime adapter, and disposable released-bb lifecycle proof are
locally complete and the pre-commit audit is clean. The final executable head's
local verification matrix is green. The replacement exact head is governed by
hosted and standing/targeted review gates before ready, merge, and
reconciliation in draft PR #78.

## Readiness

Active. Prompt/doctor/formatting and packet reviews pass; #52, #53, and #68 are
merged. Gate 0 admits all released host-plugin rows to downstream execution.
Standalone #69 passed green local, hosted, and two-lane exact-head review
evidence and is reconciled. The transport-neutral runtime foundation #55 has
passed focused/aggregate verification, two independent exact-head reviews, and
hosted CI, then merged and reconciled. Source-catalog slice 57A is also merged
and reconciled. Slice 57B1 passed its full local, review, hosted, merge, and
GitButler reconciliation gates. Slice 57B2 is merged and reconciled. Slice 62A
passed local, hosted, two-lane exact-head review, merge, and reconciliation
gates. Slice 62B passes its focused, aggregate, build, visual, package,
managed-lifecycle, and pre-commit audit gates. The final executable head's
replacement local matrix is terminal green. Its exact head remains subject to
standing/targeted review and hosted checks before draft PR #78 can leave draft.
Browser bootstrap/topology remains isolated in #70.

## Baseline

- Repository: `/Users/mg/Developer/bb/bb-mate`
- Active branch: `feat/plugin-workbench/mate-host-package`; issue #62; draft PR
  #78.
- Current merge base: `09f27471ae3bb768272c9103278425bcb03e27b4`.
- Compatibility PR #52 merged from exact head
  `1b047598b52f49ed8e6e0f7dd88387ff02c10445` to baseline merge commit
  `fa02c6d0d7c4ffb2f8855029def1589ed7ce7824`; issue #51 is closed.
- Spec PR #53 merged from exact reviewed head
  `e48e0306f2eb01c167aca19ce349c5b54bfcfc80` through GitHub async request
  `3227e20c-b82b-4b20-9138-e7b17bd95d77`. Merge commit:
  `59479253b2c0f6b465d5da870958267f846f42de`.
- Gate 0 PR #68 merged from exact reviewed head
  `87066b4f62f82283fec8f25a912bd48a682f72cb` to merge commit
  `d40aef0b7b04e6f76982b7203927905fd380c5a8`; issue #54 is closed.
- Standalone PR #69 merged from exact reviewed head
  `d4dff55faa80231519daa2217d920cee73eb8a48` through GitHub async request
  `ed06e024-dbcc-4e9a-86e2-8560b05166a6` to merge commit
  `3d37aaece878fd099854d4190df78d9ce45cb98a`; issue #56 is closed.
- Runtime PR #71 merged from exact reviewed head
  `b4327b73ba8d8e1acd6c43572df417a126d71922` through GitHub async request
  `690f515a-0651-47ef-aa7a-852e9efe02cd` to merge commit
  `ac419ae1c87f7c5186b848bc937591cf45f57560`; issue #55 is closed.
- Source-catalog PR #72 merged from exact reviewed head
  `cb8c3f362390e1985db671b4a8ed2b0c1f7fc1d7` through GitHub async request
  `f0a90de8-4a3c-425d-92cb-313ff0b6f70d` to merge commit
  `52a3274f9981f94a37d296e3f0bfa46bafd7b867`. GitButler removed the integrated
  branch and a fresh 57B1 branch/PR #74 was opened from that base.

## Preparation findings

- A disposable compile probe proved Bun can produce a standalone macOS arm64
  Mach-O and run help/passive inspection. Packaged `dev` failed because current
  asset lookup did not find the lab and `process.execPath` was then reused as if
  it were Bun. This is an implementation gap, not a failed compiler bet.
- Current package clean-room proof intentionally supplies Bun and therefore does
  not prove no-Bun execution. The goal adds a separate binary lane.
- `@bb/plugin-sdk` was not publicly resolvable during preparation and upstream
  get-bb/bb#1134 remained open. A real frontend plugin therefore requires Gate
  0 before it may enter independent scope.
- The bb 0.36 npm artifact does contain the intended manifest, nav panel,
  RPC/realtime, background service, tools/skills, mention, composer, panel,
  message action, project, and plugin inventory declarations/runtime. It does
  not expose public automatic browser open/focus/capture/control or generic
  thread attachments. Workbench-owned page capture and mention/panel/tool
  references remain the honest downstream path.
- Security audit required Wave 0 contracts for four least-privilege principals,
  a single-use clean-history browser bootstrap after same-instance proof, and
  stdio-only V1 MCP. General HTTP/OAuth MCP, remote topology, arbitrary live
  capture, model-callable native/external mutation, and artifact import are
  deferred to reduce V1 risk.

## Goal Amendments

- Source discovery #57 is delivered as three merge-first slices rather than a
  single cross-layer change: 57A owns the secure persisted source catalog,
  57B1 owns bounded native inventory and atomic reconciliation, and 57B2 owns
  the opaque-target Workbench adapter. This preserves the merged completion
  horizon and verification gates while making the storage/native and browser
  boundaries independently reviewable. Issue #57 remains open until all three
  slices merge.
- Packet review clarified Gate 0 from one frontend verdict to a per-capability
  matrix. This preserves rather than narrows the original maximum-independent-
  work objective.
- V1 MCP is stdio only. The design record's optional HTTP MCP route was removed
  after security review; Streamable HTTP/OAuth remains deferred.

## Execution Log

- 2026-08-10: slice 57A added strict self-bound development-target codecs,
  private/public SQLite catalog persistence, dedicated target authorization,
  server-admitted source roots, bounded passive discovery, canonical path and
  symlink-race attestations, no-execution sentinels, and a real cross-package
  reopen integration test. Generic object CRUD rejects development targets;
  direct catalog calls independently reject forged source capabilities.
- Slice 57A focused proof passed: inspection 87 tests/191 assertions, runtime
  113 tests/598 assertions, and the cross-package catalog plus public-export
  checks 3 tests/18 assertions. The first aggregate build exposed Node
  strip-only syntax in a discovery error class; a focused regression fixed it.
- Slice 57A aggregate proof then passed exactly: `bun run format:check && bun
run check && bun run test && bun run build`. The aggregate test lane contains
  359 tests: inspection 87, runtime 113, Linear plugin 21, CLI 42, Workbench 53,
  and scripts 43. The legacy package clean room remained 41 files/13 stories
  with SHA-256
  `22e87071a14f060029f77500449991005de5eb88c06f7a29fa749f83848e7fb1`.
- Slice 57A round-one remediation tightened root admission, fixed bounded
  manifest reads, made scan budgets fair across admitted roots, validates the
  released manifest shape, reports unreadable directories, binds issued
  source candidates to filesystem identity, and attests every private source
  row on reopen. The fresh aggregate gate passes with 387 tests: inspection
  113, runtime 115, Linear plugin 21, CLI 42, Workbench 53, and scripts 43. The
  legacy package clean room remains 41 files/13 stories with SHA-256
  `dd6e1966905ea2e3c848d9cfedaaa341c23f1a606d98892312856700c08c757d`.
- Slice 57A round-two remediation preserves each root's reserved scan share,
  then redistributes unused entry/candidate capacity without exceeding the
  global 2,048/128 bounds. Discovery rejects invalid engine shapes and
  malformed plugin-owned SVG bytes through bounded no-follow reads. Exact
  inspection candidates are WeakMap-issued and revalidate candidate-directory
  identity plus bounded manifest inode/hash before a runtime bridge derives
  conservative absent/false native capability state. The fresh aggregate gate
  passes with 396 tests: inspection 120, runtime 116, Linear plugin 21, CLI 42,
  Workbench 53, and scripts 44. The legacy package clean room remains 41
  files/13 stories with SHA-256
  `27b0418115264df75edb01b4cc4bf33c8baa7e7829a3f693d6fab392abc1fc83`.
- 2026-08-10: created the packet from the accepted design record and four
  bounded preparation audits.
- 2026-08-10: activated the direct execution goal. Found one unresolved P2 on
  compatibility PR #52, added workflow-level serialization in commit
  `1b047598b52f49ed8e6e0f7dd88387ff02c10445`, ran the full local gates, replied
  and resolved the thread, and waited for hosted `verify`, `visual`, and
  GitGuardian checks to pass.
- 2026-08-10: pinned #52 at `1b047598b52f49ed8e6e0f7dd88387ff02c10445`
  and merged it through GitHub async request
  `0e8c1b42-73b9-4d40-9980-242ab10cf1ce`. Merge commit:
  `fa02c6d0d7c4ffb2f8855029def1589ed7ce7824`. `but pull` removed the integrated
  compatibility branch and rebased the clean spec branch. Issue #51 closed.
- 2026-08-10: pinned spec PR #53 at
  `e48e0306f2eb01c167aca19ce349c5b54bfcfc80` after exact-head standing and
  targeted reviews both reached 5/5 with hosted checks green. Merged through
  GitHub async request `3227e20c-b82b-4b20-9138-e7b17bd95d77`; merge commit
  `59479253b2c0f6b465d5da870958267f846f42de`. `but pull` reconciled to a clean
  main workspace.
- 2026-08-10: opened Gate 0 #54 and foundation issues #55–#57 beneath #21.
  Disposable released-artifact probes classified rows A–F independently; all
  six passed against `bb-app@0.36.0` and generated SDK declarations `0.4.1`.

## Gate 0 released-capability matrix

| Row                   | Result | Admission evidence                                                                                                           |
| --------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| A frontend shell      | Pass   | `--app` scaffold, generated declarations, `navPanel`, type refresh, and stamped native frontend build                        |
| B backend supervision | Pass   | `background.service` and `onDispose` compile and native backend build                                                        |
| C native tools        | Pass   | Strict bounded Zod tool compiles, builds, and packs                                                                          |
| D skills              | Pass   | Manifest skill root and context-gated `bb.agents.configure` compile, build, and pack                                         |
| E thread/composer     | Pass   | Mention provider, thread/message actions, and composer quote/mention compile and build                                       |
| F lifecycle/live      | Pass   | Isolated path install, source, reload, disable, enable, reload, remove, shutdown, and no normal-profile plugin contamination |

The durable method and caveats are in
[`docs/plugin-workbench-capabilities.md`](../../../docs/plugin-workbench-capabilities.md).
The matrix admits the real plugin shell, supervisor, native tools/skill,
released thread references, and isolated lifecycle into downstream scope.

Gate 0 also fixed four implementation requirements: explicit scaffold dev-
dependency installation, a package `files` allowlist that includes `dist/`,
Node for the published isolated bb server entrypoint, and honest Harness
unavailability while `@bb/plugin-sdk@0.4.1` remains npm E404. It does not admit
automatic host-browser control, arbitrary live capture, generic thread
attachments, or remote loopback tunneling.

The executable graph is now #55–#67 beneath epic #21. The merge-first order is
domain/executable foundation (#55–#56), source discovery and host shell
(#57/#62), sessions/captures/thread references (#61/#59/#58), native tools/MCP
and education (#60/#67/#66), then integrated trial/review/handoff
(#65/#63/#64).

GitHub's native dependency graph now mirrors that order without serializing
independent foundation work. Domain #55 and executable #56 can dispatch in
parallel; discovery #57 blocks on #55; Gate #54 and #57 both explicitly block
host shell #62. The object/adapter issues carry their direct blockers; #65 is
blocked by every integrated input; #63 blocks on #65; and #64 blocks on #63.
Issue dependency sections match the native graph rather than serving as its
only representation.

## Standalone executable #56

Implementation head `02be708155cf3e7f66165cfe092bedbc361ade5e` builds a
separate unsigned `bun-darwin-arm64` executable without changing the published
npm/shebang package. A generated, sorted static-import entry embeds the exact
Ladle bytes behind stable routes; source/package and standalone entrypoint modes
are explicit, and standalone has no Bun interpreter fallback.

The pre-review clean-room artifact is mode `0755`, 64,420,322 bytes, SHA-256
`479df4999ef6e6d340134a6dae61e85b11bc1a98f0c085754b152485ce7b0ec3`,
with 35 hashed assets and 13 stories. Two complete pinned Bun 1.3.14 builds were
byte-identical. The moved executable passed with empty `PATH`, isolated
HOME/TMP/XDG state, cleared Bun override variables, ambient `.env` and
`bunfig.toml`, and the checkout lab renamed out of reach. It passed help,
passive inspection without target-plugin execution, GET/HEAD, every asset hash,
story metadata, SIGTERM, and post-exit listener unreachability. Printable
payload inspection and the clean-room assertion found no absolute repository
path.

The legacy package lane remained separate and green: 41 files, 13 stories, and
clean-room SHA-256
`77f7cb2e924e047d09c53237e28eeeee5a69c2023829134ba497ba69d7530ba2`.
Focused tests, format, typecheck, compatibility, aggregate tests/build, and 14
visual/accessibility checks passed. PR #69 merged after its dedicated
`macos-15` arm64 job, Linux verification, visual, and security checks passed.

## Runtime foundation #55

The pre-review implementation head `2f5588ac0d213b926bc71b7afb9bac92ae860ee9`
adds one private `@bb-mate/runtime` package. Its curated public entry point
exports strict v1 identifiers, envelopes, codecs, request contexts,
authorization, the canonical store/service, and the injectable Fetch handler;
an exact export test keeps low-level database, migration, event-feed, and schema
internals private.

The service uses exact module-private issued-context identity, explicit least-
privilege scopes, and derives principal,
bb-context, target, and optional session bindings only from a branded server-
created request context. SQLite persistence stores those bindings outside
canonical payload JSON, uses optimistic revisions, and commits minimal redacted
pull events atomically with object mutations. Stored payload bytes must exactly
match their recomputed canonical form. The explicit private data root
fails closed for unsafe modes, ownership, links, sidecars, WAL databases,
corruption, newer schemas, migration drift, or live-schema drift without
repairing or deleting caller data.

Generic JSON is bounded to 8,192-character strings/property names, 100 array
items/object properties, and a 256 KiB complete canonical UTF-8 envelope. The HTTP slice is
handler-only: exact numerical loopback Host/URL/Origin,
authenticated non-browser absent-Origin access, a constant public health route,
authenticated capabilities with every deferred feature false, a 256 KiB body
bound, 32-request concurrency limit, typed redacted failures, and restrictive
security headers. Route/export tests prove the absence of bootstrap, target-
path, artifact, generic object-write, event-stream, MCP, URL-fetch, shell/eval,
native-lifecycle, destructive, import/export, and remote-bind surfaces.

Focused runtime verification passes 98 tests with 536 assertions. The full
remediation gate passes formatting, type/compatibility checks, 304 aggregate
tests, the 41-file/13-story legacy package clean room at SHA-256
`77f7cb2e924e047d09c53237e28eeeee5a69c2023829134ba497ba69d7530ba2`,
and all builds.

## Review Log

- Runtime/packaging, public bb seam, security/MCP, and goal-scope audits
  completed read-only during preparation. Findings were incorporated into the
  packet.
- Packet review round 1: standing 3/5 and targeted 3/5, changes requested. Fixed
  the collapsed Gate 0, HTTP-MCP contradiction, #1133 mislabel, missing exact
  commands/CI transitions, per-milestone 5/5 ambiguity, and prompt headroom.
- Packet review round 2: standing 3/5 and targeted 4/5, changes requested. Fixed
  the remaining unconditional Streamable HTTP test, built-in-browser claim,
  singular Gate 0 wording, and prompt maintenance margin. Historical scratch
  reports are archived outside the active doctor path after durable summary.
- Packet review round 3: standing 5/5 and targeted 5/5, both clean with zero
  open P0-P3. Active reports: `tmp/reviews/standing/round-3.json` and
  `tmp/reviews/targeted-packet/round-3.json`. Superseded rounds 1–2 are scratch-
  archived at `/tmp/bb-mate-plugin-workbench-reviews-20260810/`.
- PR #53 exact-head review round 4 found stale pre-activation/current-state
  language in the plan and `RETRO.md`. Round 5 standing and targeted reviews
  verified the correction at 5/5 with zero findings before merge.
- Gate 0 round 1: standing and targeted reviews both scored 3/5 and requested
  changes. Durable IDs `G0-SG-001`/`PW-GATE0-001` require exact C–F evidence
  outside ephemeral summaries; `G0-SG-002`/`PW-GATE0-003`
  require native GitHub dependency edges; and
  `G0-SG-003`/`PW-GATE0-002` require #21 to keep #54 open until PR #68
  merges. Native edges and epic state are corrected; exact evidence is being
  expanded before round 2. Historical non-clean reports remain active until
  their dispositions are recorded and then move to scratch archive.
- Gate 0 round 2: standing and targeted reviews both scored 4/5. Prior findings
  were fixed. `G0-SG-004` removed the unnecessary #55 → #56 serialization and
  required exact dependency prose for #62/#65. `PW-GATE0-001` remained open
  because C/D used plain npm installs while only E used `--include dev`, and
  the durable C–E command transcript was still summarized. Both corrections
  were completed before round 3.
- Gate 0 round 3: standing and targeted reviews both reached 5/5 at exact head
  `ae542f7c6c9ae94ed8d2a15a32170b182b8a7576` with zero findings. They
  independently corroborated C–F evidence, exact GitHub dependency/prose state,
  issue/PR status, full local and hosted gates, clean mergeability, no review
  threads, and clean GitButler state.
- Gate 0 round 4: a bookkeeping-only delta correctly checked the review step but
  prematurely labeled the whole milestone complete before merge. Standing
  `G0-SG-005` and targeted `PW-GATE0-004` both scored the head 4/5 and required
  “implementation and review complete; merge pending.” The status is corrected;
  completion remains reserved for post-merge reconciliation and #54 closure.
- Gate 0 round 5: standing and targeted exact-head reviews both reached 5/5 at
  `87066b4f62f82283fec8f25a912bd48a682f72cb` with zero findings. Hosted
  verify, visual, and security checks were green, and no review threads remained.
- PR #68 left draft at that exact head, merged through GitHub's SHA-pinned async
  merge endpoint as `d40aef0b7b04e6f76982b7203927905fd380c5a8`, closed #54,
  and reconciled to a clean, lane-free GitButler workspace. Epic #21 now links
  the capability matrix on `main` and marks Gate 0 complete.
- Standalone round 1: standing scored 3/5 and targeted scored 2/5. Their shared
  P1 (`ST-SA-001` / `PW-STANDALONE-001`) found that the exported builder could
  recursively delete a caller-selected broad output root. Recursive root
  deletion is removed: the builder now rejects repository ancestors, symlink
  roots, and unexpected entries, validates the whole directory first, and
  unlinks only `bb-mate` and `manifest.json`; three focused ownership tests
  cover replacement, no-delete rejection, broad paths, and symlinks. Shared P2
  `ST-SA-002` / `PW-STANDALONE-002` corrected the plan's package filter to
  `bb-mate`. `PW-STANDALONE-003` corrected hosted CI state from pending to
  green. All findings are fixed for round 2.
- Standalone round 2: standing reached 5/5; targeted reached 4/5 and kept
  `PW-STANDALONE-001` open because allowlisted replacement still removed the
  prior valid pair before a new build succeeded, and the system temp root was
  rejected only incidentally. The builder now structurally permits only the
  canonical artifact root or a leaf beneath `os.tmpdir()`, builds both files in
  a sibling staging directory, validates the exact pair before promotion,
  restores the old directory if promotion fails, and removes only a validated
  backup. Five ownership tests now include incomplete-stage and injected
  partway-promotion failures that prove the prior pair stays byte-identical.
- Standalone round 3: standing and targeted both scored 4/5. Their shared P2
  (`ST-SA-003` / continued `PW-STANDALONE-001`) reproduced a symlinked parent
  beneath the lexical temporary root redirecting output into a separate
  physical tree. The builder now walks every existing relative component and
  rejects symlinks before creating the leaf, then verifies the real output root
  remains beneath the real allowed base. A focused no-write test uses an
  outside task-owned directory and proves the symlink target remains empty.
- Standalone round 4: standing and targeted exact-head reviews both reached
  5/5 at `c6d0e93109f492cad754f270adef5ec6a39935c2` with zero findings. The
  original symlink-parent attack now rejects without touching its target;
  transactional rollback, moved empty-PATH execution, legacy package,
  aggregate, visual, hosted CI, thread, tracker, and clean-workspace gates pass.
- Standalone round 5: standing and targeted both reached 5/5 on the final
  docs-only head `d4dff55faa80231519daa2217d920cee73eb8a48`; fresh hosted
  verify, visual, native arm64, and security checks were green with no review
  threads. PR #69 then left draft and merged through the SHA-pinned async
  endpoint as `3d37aaece878fd099854d4190df78d9ce45cb98a`.
- Runtime planning decomposed the old cross-cutting #55 body. #55 now owns only
  versioned contracts, authorization, SQLite, pull events, and loopback policy;
  #57/#59/#61/#62/#66/#67 own their concrete lanes. New child #70 owns secure
  browser bootstrap and same-instance topology and blocks integrated trial #65.
- Runtime implementation subreviews exercised each security-critical lane.
  HTTP review first found absent-Origin authentication/order and forbidden-
  surface inventory gaps; the corrected lane reached 5/5 with 26 tests and 288
  assertions. The service lane reached 5/5 with zero findings. Persistence
  review rounds found and fixed ancestor-symlink admission, incomplete live-
  schema attestation, raw cursor errors, migration attestation ordering, and
  WAL/sidecar admission; round 3 reached 5/5 with zero P0-P3 and 40 focused
  tests. Full exact-head standing and targeted PR review then governed merge.
- Runtime full review round 1: standing scored 3/5 and targeted 2/5 at exact
  head `f5c04a8ba2784143e023d44f603945e3f6111d6c`. Their shared P1
  (`RT-SG-001` / `PW-RUNTIME-001`) reproduced privilege escalation by spreading
  the enumerable request-context symbol and replacing the principal/scopes.
  Request contexts now use a module-private `WeakSet` of exact issued objects;
  spread, inherited, and reflected-key clones all fail unauthenticated. Shared
  P2s (`RT-SG-002` / `PW-RUNTIME-002` and `RT-SG-003` /
  `PW-RUNTIME-003`) added mandatory JSON text/collection/byte bounds and exact
  canonical stored-byte verification. A two-open-store regression also proves
  optimistic stale-writer conflict across SQLite connections. All three
  findings are fixed for round 2.
- Runtime full review round 2: standing scored 3/5 at exact head
  `2bb5d6523398b031211ef23f0bbb5563de68aa8f`; the targeted lane independently
  reproduced the same remaining boundary defect before its report finalization.
  `RT-SG-004` found that `parse` bounded only the 261,911-byte payload while
  `serialize` bounded the 262,199-byte full envelope, breaking the registry's
  round-trip contract. `parse` now validates the same complete canonical
  envelope that `serialize` emits, and a generated near-limit regression proves
  payload-only admission cannot exceed the envelope ceiling. Round 1 findings
  remain fixed; this new finding is fixed for round 3.
- Runtime full review round 3: standing reached 5/5 with zero P0-P3 at exact
  head `2696d61941002e3fa7fe89c0d6aaa8c1d42de9f6`, independently proving the
  262,144-byte complete-envelope boundary and rejecting 262,145 bytes. The
  targeted lane found one P2 evidence defect: this retrospective counted 303
  aggregate tests even though the exact-head run contains 304. The count is
  corrected for the final docs-only exact-head recheck; no runtime behavior or
  prior verification result changed.
- Runtime full review round 4: standing and targeted both reached 5/5 with zero
  P0-P3 at docs-only head `b4327b73ba8d8e1acd6c43572df417a126d71922`.
  Hosted verify, visual, standalone-arm64, and security checks were green; the
  PR was cleanly mergeable with no review threads. PR #71 merged through async
  request `690f515a-0651-47ef-aa7a-852e9efe02cd` to
  `ac419ae1c87f7c5186b848bc937591cf45f57560`; #55 closed and GitButler
  reconciled without dirt or a residual lane.
- Source-catalog round 1: standing and targeted both scored 2/5 at exact head
  `5df4564d5673dafe54311b590dc5380e80d310ac`. Their security findings covered
  broad or ignored roots, an unbounded manifest-growth race, private-source
  rows that accepted invalid root identity, a forgeable/retargetable runtime
  candidate bridge, cross-root scan starvation, released-manifest drift, and
  swallowed directory-read failures. All are fixed for round 2: root policy
  rejects filesystem/home ancestors and ignored components; manifest reads use
  a fixed 256 KiB + 1 buffer; global budgets are partitioned across admitted
  roots; discovery mirrors the released manifest contract and emits bounded
  read diagnostics; issued candidates are module-private identity capabilities
  bound to canonical path/device/inode; and stored private rows are strictly
  parsed and fail closed without repair.
- Source-catalog round 2: targeted scored 4/5 and standing 3/5 at exact head
  `36d886e02cc5bb7cabe048f45c8b890c7f431593`. `LR-003` / `SC-SG-005`
  found that immutable per-root shares stranded unused global capacity;
  `SC-SG-004` kept manifest-contract alignment open because discovery accepted
  invalid engines and malformed plugin-owned SVG bytes. Both are fixed with
  bounded reserved-first redistribution and canonical compact-SVG validation.
  The remediation also strengthens the previously accepted internal bridge:
  raw target/native claims have no issuance path, inspection and runtime use
  two exact capability stages, and directory/manifest changes between
  discovery and persistence fail closed.
- Source-catalog round 3: standing and targeted both scored 2/5 at exact head
  `71f2fffc0108b7427f12ba07a1226e2f8c2cf5cc`. `SC-SG-006` / `LR-001`
  reproduced a transition race after inspection returned plain facts but
  before runtime captured them; in-place manifest mutation, manifest inode
  replacement, and whole-directory replacement all admitted stale claims.
  `SC-SG-004` also remained open because discovery treated `.\\icon.svg` as a
  plugin-owned path while the released validator treats only `./` paths that
  way. `LR-006` noted a stale budget comment.
- The round-3 remediation replaces the plain-facts reader with an exact,
  one-use transition capability. Inspection pre/post-attests the candidate
  directory and bounded manifest around runtime issuance; runtime independently
  verifies the same canonical path, device, inode, and SHA-256 evidence, keeps
  that identity on its own capability, and revalidates it before catalog
  persistence. Focused attacks for all three transition races and a
  post-issuance manifest mutation now fail closed with no catalog mutation.
  Windows-style `.\\icon.svg` is again a host icon name, matching the released
  validator, and the budget comment now describes reserved-first
  redistribution. The remediation gate passes 401 repository tests, all
  type/compatibility checks, formatting, every build, and the 41-file/13-story
  package clean room at SHA-256
  `622b4c8148f0b449c6321c8625b27ac24a84f8a0b662a4b0efcad7997715bed4`.
  Fresh exact-head review remained at that point.
- Source-catalog round 4: standing and targeted both reached 5/5 with zero
  P0-P3 at exact head `f8fe4765394527b03f421717bcd7780220b952a6`.
  Each lane independently rejected all three transition-time mutations and the
  post-issuance/pre-persistence mutation with an empty catalog, verified
  Windows-style icon parity and true global scan bounds, and found the full
  security/persistence/export/no-execution boundary clean. Hosted verify,
  visual, standalone-arm64, and security checks passed; PR #72 was cleanly
  mergeable with no review threads and GitButler had no uncommitted changes.
  Superseded source-catalog rounds 1-3 were scratch-archived under
  `/tmp/bb-mate-plugin-workbench-reviews-20260810/source-catalog/` after their
  findings and dispositions were preserved here. Prompt validation and the
  canonical goal-loop doctor then passed with 17 active review reports.
- Source-catalog final docs review found one P2 wording mismatch at
  `7e2cec6c928a00c2ec655c0c172ad37855af440f`: the RETRO said the docs-only
  head remained even though it was already current. Exact head
  `cb8c3f362390e1985db671b4a8ed2b0c1f7fc1d7` fixed that statement; standing
  and targeted round 6 each reached 5/5 with zero P0-P3, hosted checks were
  terminal green, and the goal doctor passed after the superseded scratch
  report was archived.
- PR #72 was made ready only after the exact final head was re-pinned as clean,
  mergeable, fully green, thread-free, and GitButler-clean. GitHub async request
  `f0a90de8-4a3c-425d-92cb-313ff0b6f70d` merged it as
  `52a3274f9981f94a37d296e3f0bfa46bafd7b867`. `but pull` removed the integrated
  57A branch and advanced the workspace base without uncommitted changes. #57
  remains open for native reconciliation and the browser adapter.
- PR #74 was made ready only after final exact head
  `3f271c462b750cf78e5640be8f797bcf04f25b25` passed two 5/5 review lanes,
  terminal hosted checks, zero threads, and clean mergeability. GitHub async
  request `41db3969-c528-49e3-89d2-63d2935b40af` merged it as
  `73e6865e2a135dfd02dc2429ebc3debaa179d79d`. `but pull` removed the integrated
  57B1 branch and advanced the workspace base; the unrelated PR #73 lane was
  only rebased locally and remains unpushed.
- Slice 57B2 replaces basename/path selection and recursive regex redaction
  with a lifecycle-open source catalog and schema-v2 browser projection. The
  browser selects only opaque target IDs, an invalid or foreign selection never
  falls back, one unambiguous target may auto-select, and the former external
  symlink acceptance is now a fail-closed no-execution case.
- The Workbench GET path reads only its prepared public catalog projection. It
  runs no `bb`, Connect, npm, build, native-observer, or target code and returns
  no command, URL, provenance, canonical root, principal/context, or host fact.
  Fixture remains available; Harness, Live, and terminal handoffs remain
  explicitly unavailable until their owning milestones.
- The dev adapter persists only stable server identity keys and the catalog
  under an explicit private data root, checks exact loopback Host/listener port
  and present Origin, and accepts only zero query parameters or one opaque
  `target`. Legacy, duplicate, mixed, and unknown query keys return a generic 400. Browser responses pass a strict recursive allowlist and 256 KiB reader.

## Verification Log

- `check-goal-prompt --no-placeholders`: passed at 3,216/4,000 characters.
- `goal-loop-doctor`: passed with every active review report clean.
- `bun run format:check`: passed for the reviewed packet and design record.
- Slice 57B1 local implementation gate passed `bun run format:check`, `bun run
check`, `bun run test`, `bun run build`, and `git diff --check`. The aggregate
  run passed 470 tests: inspection 136, runtime 169, CLI 42, Workbench 53,
  Linear plugin 21, and scripts 49. The package clean room passed with 41
  files, 13 stories, and SHA-256
  `e4e726bb0209adb43673942f9a33cc7243f5c82064eddea1231ff8bb82c73e6d`.
- Slice 57B2 local implementation gate passed `bun run format:check`, `bun run
check`, `bun run test`, `bun run build`, `bun run visual:test`, `bun run
compatibility:latest`, `bun run package:inspect`, and `bun run
standalone:inspect`. The remediation aggregate test lane passed 483 tests:
  inspection 136, runtime 169, CLI 42, Workbench 66, Linear plugin 21, and
  scripts 49. The final focused Workbench rerun recorded 629 assertions; all 14
  visual/accessibility checks
  passed. The unchanged package clean room remained 41 files/13 stories at
  SHA-256
  `e4e726bb0209adb43673942f9a33cc7243f5c82064eddea1231ff8bb82c73e6d`.
- Host-shell slice 62A remediation gate passed `bun run format:check`, `bun run
check`, `bun run test`, `bun run build`, `bun run compatibility:latest`, `bun
run package:inspect`, `bun run package:test`, `bun run standalone:build`, `bun
run standalone:inspect`, and `bun run standalone:test`. The aggregate lane
  passed 531 tests: inspection 136, runtime 175, CLI 75, Workbench 66, Linear
  plugin 21, and scripts 58. Repeated aggregate runs exposed a test-teardown
  race that recursively removed a symlink holder and its external temporary
  target concurrently. Teardown now removes temporary roots sequentially in
  reverse creation order; 100 focused reruns (600 tests), the full scripts
  suite, and the complete aggregate passed. The legacy package clean room contained
  41 files and 13 stories with SHA-256
  `c2480bdd519e1d5bfe22691d8ccb9da64b5516162a8d9c9210e57ecc11711a9f`.
  The twice-built moved standalone was deterministic, Mach-O arm64, mode 0755,
  64,783,586 bytes, 35 assets, 13 stories, and SHA-256
  `df2218e931e2c048ed0c2896a4448313169af324eca9595cc72717364a1ca16f`.
- PR #52 final local gate: `bun run format:check && bun run check && bun run
test && bun run build && bun run compatibility:latest` passed; package clean
  room produced 41 files, 13 stories, SHA-256
  `de6174f733c8a76fdc4b7e117ff2499a47d55e918e02150fecb9337384e0e843`.

## Evidence ledger

- 57B1 normalizes only released bb 0.36 `plugin list --json` evidence through a
  fixed no-shell command, 1 MiB output bound, 256-row bound, and UTF-8 field
  bounds. It canonicalizes only direct path rows; npm/Git/builtin/catalog roots
  are never read. One-use inspection transitions reject reuse, and runtime
  capabilities reject clones, forged facts, and failed transitions.
- The pure reconciler covers malformed, duplicate, future/stale, exact path,
  other path, npm/Git managed, builtin/catalog conflict, and absent precedence.
  A safely canonicalized malformed root hint protects a matching target while
  unrelated malformed rows do not hide a safe result.
- The catalog service requires an unbound branded `targets:write` principal,
  scoped target ID, freshly revalidated same-root source capability, trusted
  inventory capability, and optimistic revision. Public native state, private
  host evidence, and a redacted `target.native-reconciled` event commit in one
  transaction; failure rolls all three back.
- Reopen integrity attests strict schema, event/binding/revision consistency,
  and exact equality between private `observedAt` and the canonical public
  native timestamp. Missing, corrupt, or valid-looking divergent private rows
  fail closed without repair.
- Coordinator integration found that a future-dated observation could be
  classified as malformed and committed even though the next integrity check
  correctly rejected its timestamp. The catalog now rejects that capability
  before mutation; focused persistence proof reopens the unchanged target.
- Round-one standing and targeted review independently found that an older or
  equal issued inventory could overwrite newer accepted host evidence. Native
  persistence now requires a strictly newer per-target observation; replay
  tests prove the public target, private host row, event ledger, and reopened
  database remain unchanged.
- Standing and targeted round two each awarded exact head
  `990ea0be027347192f37f39527ef7e81d8b5e9c5` 5/5 with zero P0-P3 findings.
  Hosted verify, visual, standalone-arm64, and GitGuardian checks were terminal
  green; the PR was mergeable, thread-free, fully pushed, and GitButler-clean.
  Superseded non-clean round-one scratch reports were archived only after their
  findings and fixed dispositions were recorded here; the packet doctor then
  passed with 21 active reports.
- The coordinator walking skeleton proves passive source discovery to stable
  catalog target to released-shape managed inventory to reconciliation and
  reopen. The inventory invokes only `bb plugin list --json`, creates no
  additional target, exposes no private root/hostname publicly, and executes
  neither package scripts nor the target entrypoint.
- A real Vite walking skeleton used a disposable canonical `/private/tmp` data
  root and numerical loopback port 43127. It returned schema v2 with one opaque
  target, null terminal commands, Fixture available, and Harness/Live
  unavailable; legacy `plugin` query input returned the generic HTTP 400. SIGINT
  removed the listener and the disposable evidence roots were deleted. A first
  `/tmp` attempt failed closed because macOS resolves that path through a
  symlink, confirming the data-root ancestor policy rather than weakening it.
- Workbench round-one standing review scored 2/5 and targeted review scored
  3/5 at implementation head `9d740f01d05c0169c0283bf3fbc4dfb41f9a11dd`.
  Both found that a malformed launcher selector became a null target before the
  hook, allowing an empty-query fetch and sole-target fallback. Standing also
  found that the server admitted malformed target values, while both reviews
  found that malformed absolute-form request targets could escape the secured
  response path. The replacement blocks the fetch whenever URL-state parsing
  has already rejected a selector, requires the exact 32-character opaque ID
  grammar at the HTTP boundary, rejects non-origin-form request targets, and
  returns the same secured generic 400 for parsing failures. Focused regressions
  prove zero fetch/fallback, path/empty selector rejection, valid foreign-ID
  non-enumeration, and malformed/hostile absolute-form rejection.
- Replacement-head review then found one more WHATWG parser differential:
  slash-plus-backslash request targets normalized into a foreign authority even
  though the raw Host header remained loopback. A RED middleware regression
  reproduced the unintended 200. The raw origin-form policy now rejects every
  backslash before URL parsing, and literal `/\\evil…` and `/\\/evil…` attacks
  receive the same secured generic 400. The complete aggregate, build, and
  visual gates passed again after this production change.
- Targeted round three found that a raw HTTP fragment was also outside RFC
  origin-form even though WHATWG parsing stripped it and reached the endpoint.
  A RED regression reproduced that 200; the raw request-target gate now rejects
  `#` before parsing, and the fragment attack receives the secured generic 400.
  Aggregate, build, and visual gates passed again after the final correction.
- Standing and targeted round four each awarded exact implementation head
  `61b13d1f7d299e099525d87044ea74dc5dd9f88a` 5/5 with zero P0-P3 findings.
  Independent raw-request matrices covered malformed, absolute, scheme-relative,
  slash-backslash, fragment, control-bearing, encoded, Host, Origin, listener,
  IPv4, and IPv6 variants; opaque selection and schema-v2 boundaries also
  passed. Both hosted verify/visual/standalone sets and GitGuardian were terminal
  green, the PR was cleanly mergeable with zero threads, GitButler was clean,
  and unrelated #73 remained preserved. Superseded Workbench rounds 1-3 were
  scratch-archived only after all findings and fixed dispositions were recorded
  here.
- PR #75 was made ready only after exact final head
  `cc4c7e383dd0dac6b665f14b0075b9aaa288ebb0` passed terminal hosted checks,
  zero-thread verification, packet doctor, and final standing plus targeted
  5/5 reviews. GitHub async request
  `2cc9e6c7-3d21-41ba-8ad9-cb643da8dd6b` merged it as
  `6ed0c33ddbe8b971eadb36d170fc705dbf9550b3`. `but pull` removed the
  integrated 57B2 branch and reconciled the workspace; #57 closed complete and
  #21 now records source-first development-target discovery as merged. The
  unrelated #73 lane remains isolated in its pre-existing force-push-required
  state.
- Slice 62A now supplies the prerequisite protocol that #62 previously lacked.
  The strict inherited FD carries one bounded credential frame and remains the
  primary liveness signal; port-zero `serve` binds only numerical loopback,
  emits one bounded descriptor line, and exposes only constant health plus an
  authenticated capability document with exact runtime/API/instance identity.
  Parent disappearance, extra frame bytes, EOF, SIGINT, and SIGTERM converge on
  one awaited listener stop. The moved empty-PATH executable proves EOF,
  parent-loss-with-FD-open, and signal cleanup without a checkout asset or normal
  profile.
- Targeted host-shell round 1 found three release blockers after the initial
  implementation review. THS-001 is fixed by including bundled Zod in generated
  third-party notices and asserting its MIT license in the package clean room.
  THS-002 is fixed by inspecting raw origin-form request targets before WHATWG
  normalization, so encoded-dot, absolute, scheme-relative, backslash, and
  fragment aliases cannot reach either runtime route. THS-003 is fixed by
  awaiting child stdio `close`, not only process `exit`, before output-purity and
  secret-nonleak assertions. Focused regressions reproduce each prior gap and
  pass after remediation. At that point PR #76 remained draft while replacement
  exact-head hosted checks and independent reviews were pending.
- Targeted host-shell round 2 then found THS-004: raw GET/HEAD body framing was
  omitted while constructing the Fetch request, so an incomplete chunked health
  request could receive 200 before its body ended and escape the runtime body and
  concurrency accounting. The raw listener now rejects any Content-Length or
  Transfer-Encoding on GET/HEAD before dispatch, returns the secured generic 400,
  closes the connection, and destroys the unread request after the response.
  Slow chunked GET/HEAD, Content-Length zero plus trailing bytes, nonzero length,
  duplicate length, canonical bodyless reads, and streamed POST regressions pass.
- Exact-head round 3 showed that THS-004 still applied to noncanonical targets:
  target validation returned the secured 400 before the framing cleanup path,
  leaving an incomplete keep-alive socket open outside request accounting. Every
  listener-level pre-dispatch rejection now uses one close path that disables
  keep-alive, flushes the secured generic 400, and then destroys the unread
  request. Slow encoded-dot GET, fragment HEAD, absolute-form POST, and 33-way
  concurrent incomplete-request regressions all close within the bounded window
  with zero runtime-handler calls. The replacement aggregate passed 525 tests;
  package and moved-standalone proofs produced the hashes recorded above.
- The next targeted pass found the same unread-body lifetime gap after canonical
  requests reached early Host, Origin, authentication, encoding, declared-size,
  or capacity responses. The Node listener now treats request completion as the
  systemic ownership boundary: before sending any handler response for an
  incomplete message it overrides connection headers to close, preserves the
  handler status/body/security policy, flushes the response, and destroys the
  unread request. Focused slow-body tests cover 400/401/403/413/415/503, 33-way
  concurrent rejection, the 32-request capacity boundary, handler header
  override, and successful keep-alive reuse after a completely consumed body.
- Exact implementation head `2897369eaad4fedfc202b1a08fd23bac14f5f88f`
  passed the 525-test aggregate, exact package and standalone proofs, hosted
  verify/visual/standalone rerun, GitGuardian, zero-thread, and clean GitButler
  gates. Standing round five awarded 5/5 with zero P0-P3. Targeted round five
  found only THS-005: this ledger's current-state header still described merged
  57B2 as active and hosted readiness as pending. Those current-state fields are
  now corrected; executable and build-input bytes are unchanged. Slice 62A is
  implementation-and-review complete, while final exact-head review, ready,
  merge, and reconciliation remain.
- The first hosted standalone job at both the implementation and docs heads
  emitted a valid orphan-lane descriptor and then hit an immediate loopback
  connection refusal; same-head reruns and every local moved-binary proof passed.
  The clean-room readiness probe initially retried only connection-refused
  failures for two seconds after descriptor validation. One of two duplicate
  hosted runs still exceeded that arbitrary allowance while the other passed.
  A later duplicate hosted run exhausted even the ten-second allowance after a
  valid orphan descriptor while its twin passed. Because descriptors follow the
  Node listener's `listening` event, that was not ordinary startup delay. The
  final proof uses a fresh non-pooled loopback connection for each health and
  cleanup probe, races readiness against child close with bounded redacted exit
  diagnostics, and replaces the timed sleep parent with an owner-held indefinite
  sentinel asserted alive before the deliberate parent-loss transition. It still
  requires exact HTTP 200 and fails immediately on HTTP or unrelated network
  errors. Focused tests cover fresh connections, canceled-socket cleanup,
  readiness after 2.5 seconds, runtime exit, non-200, unrelated failure, and
  deadline exhaustion. The harness-only changes raise the aggregate to 531 tests
  while leaving the exact package and standalone hashes recorded above unchanged.
- Final exact head `21200fa85b675b553bd20180abbe50722509879d`
  passed both duplicate hosted verify, visual, and standalone jobs plus
  GitGuardian. Standing and targeted round seven each awarded 5/5 with zero
  P0-P3 findings; prompt, packet doctor, zero-thread, exact-body, and clean
  GitButler gates passed. GitHub async request
  `ca3452a7-cec4-4a21-9bd6-a64f20eff0d7` merged PR #76 as
  `09f27471ae3bb768272c9103278425bcb03e27b4`. `but pull` removed the integrated
  62A branch and reconciled the workspace. The unrelated #73 lane remains
  isolated in its pre-existing force-push-required state and was not pushed.
- Slice 62B preparation found a real contract gap before implementation could
  hide it. Released bb 0.36 can provide the full-trust plugin backend with the
  current project's source, but merged 62A deliberately exposes
  `capabilities.targets = false`, opens no runtime catalog, and has no trusted
  source-admission or target-list route. Calling a parallel `bb-mate inspect`,
  importing workspace internals into the installed plugin, or keeping
  plugin-owned target state would contradict the thin-adapter boundary. Issue
  #62 and the host-shell plan now record three merge-first slices: 62B ships the
  exact installed host/status shell with target discovery explicitly
  unavailable; 62C later adds private authenticated current-project source
  admission and authorized opaque target listing in the canonical runtime.
- Slice 62B implements `bb-plugin-mate` as a released 0.36 native nav-panel and
  server package. Status is read-only; only an explicit project-independent
  `ensure({})` demand starts the runtime. Project/source binding remains deferred
  to 62C, where runtime admission will actually consume it. The strict public snapshot exposes finite lifecycle
  states and version identity while keeping paths, process IDs, credentials,
  commands, listener URLs, host facts, browser launch, and target discovery out
  of the frontend contract. The installed-root resolver admits only the exact
  package-relative `darwin-arm64` executable and manifest, validates containment,
  regular/single-link `0755` mode, Mach-O architecture, size, SHA-256, version,
  API, and asset identity, then reattests immediately before an absolute-path
  spawn. FD3 startup, descriptor/capability equality, lazy concurrency, crash,
  service restart, abort, and process-group cleanup are bounded and tested.
- The exact 14-file npm artifact contains no source map or workspace source
  names. Raw bounded tar inspection rejects links, devices, PAX/GNU extensions,
  traversal, control characters, duplicates, extra entries, oversized gzip,
  excessive expansion, truncated terminators, appended gzip members, and every
  byte beyond the canonical two-block tar end. Public manifest, bb build
  metadata, README, skill, MIT license, generated notices, embedded stamp,
  executable mode, runtime manifest, runtime bytes, and the exact pinned Bun
  1.3.14 license are independently checked. The artifact SHA-256 is
  `41d65db1bf6fb4523265ed88407e644a59f8af1d260bf0dabcb741157ebf8a4b`;
  its runtime remains 64,783,586 bytes at
  `37cb41b0f8eb84e08c20cdee967cbec7b096161d8ac164bd45cfb3e1b73a6e4b`,
  runtime `0.1.0-alpha.2`, API 1.
- Bun's pinned license records statically linked JavaScriptCore/WebKit and other
  separately licensed components, but available release materials do not prove
  the full corresponding/relink bundle needed for external redistribution. The
  source and staged plugin manifests therefore enforce `private: true`; the
  README, notice, plan, inspector, and issue #77 make the tgz local-verification
  only and block upload, publication, release, or external redistribution until
  that separate compliance gate is complete.
- The final disposable clean room uses a strict loopback registry, full released
  `bb-app@0.36.0` server and host daemon, and a real temporary project. It proves
  idle-before-demand, 100 concurrent ensures yielding one child, crash with
  host-owned restart, reload, disable, enable and redemand, remove, graceful
  whole-server shutdown, and forced actual server-child loss. Fresh loopback
  probes confirm the owned listener closes at every transition; hostile PATH and
  target-code sentinels remain unused. Released bb intentionally retains an
  immutable managed artifact cache after removal; the proof verifies it is inert
  and hash-identical before deleting only the disposable profile.
- Package verification owns its standalone input end to end. Two fresh child
  Bun processes build into bounded temporary roots, and the managed installed-
  cache inspections receive that same canonical root rather than consulting a
  shared artifact. Portable pure-JavaScript ustar fixtures replace BSD/GNU tar
  assumptions. Normalizing Bun's virtual entry key and imports relative to the
  repository root removes the checkout-path compiler leak; independent builds
  in the workspace and a frozen fresh checkout now produce byte-identical
  executable and manifest bytes.
- The actual plugin panel is browser-tested inside a host `main` without nesting
  its own main landmark. Five deterministic Chromium screenshot and axe cases
  cover idle, ready, unavailable, hostile text, and dark appearance. Panel
  status is explicitly an on-mount/post-action snapshot for 62B, not realtime
  monitoring.
- Local 62B gates pass with 596 tests: inspection 136, runtime 175, CLI 76,
  Workbench 66, Linear plugin 21, Mate plugin 43, and scripts 79. Formatting,
  checks, released compatibility, builds, 19 visual/accessibility tests, the
  legacy 41-file package clean room, native declaration regeneration check,
  exact package inspection, and `git diff --check` also pass.
- A fresh independent pre-commit attack audit first found incomplete compiled-
  Bun distribution claims, a hidden post-tar gzip payload, a nested main
  landmark without browser coverage, manifest control-path drift, and two P3
  diagnostic/status wording gaps. The private/license/#77 boundary, canonical
  tar end, real browser gate, route hardening, CI artifact upload, and explicit
  snapshot semantics resolved every finding. The final exact-tree audit reports
  zero P0-P3 and a clean pre-commit verdict.
- Subsequent exact-head review cycles found and closed hosted GNU/BSD archive
  portability and temporary-artifact handoff gaps, an immediately-closed
  supervisor snapshot race, an unusable project-gated nav demand edge, and an
  incomplete runtime-manifest stamp. The final tests cover strict empty RPC
  inputs, current-state supervisor returns, exact manifest-byte size/SHA-256,
  valid-shape manifest mutations, and the real released nav-panel Start action.
- Standing round one then found `MATE-BUILD-001`: the ordinary plugin build
  still embedded the pre-determinism generated runtime stamp while only the
  package builder transiently compiled the final identity. The committed stamp
  now matches the fresh runtime and exact manifest bytes; the
  managed clean room derives the fresh stamp again and compares its data to the
  imported committed object. That semantic comparison deliberately survives
  Prettier formatting, after a source-byte comparison failed both hosted jobs.
  Ordinary `bb-plugin-mate build`, the full managed lifecycle, and the hosted
  replacement matrix are green. Standing round one's sole finding is fixed and
  its superseded scratch report is archived before the final clean round.
- A later exact-head hosted standalone run exposed `MATE-PROOF-001`: after a
  valid descriptor, the proof runtime could receive an unexpected supervisor
  channel close and exit cleanly before health. A rerun passed but was not
  accepted as disposition. TDD first showed that the CLI treated a close-only
  channel destruction as clean EOF; it now accepts only a readable `end` as
  normal liveness closure. Stress then proved that both Bun's Node-compatible
  extra pipe and native extra FD could close unpredictably. The supervision
  clean room therefore resolves an absolute Node executable before hostile
  PATH setup and runs the proof-side `child_process` owner under Node, matching
  the installed plugin. It awaits the frame write and parent FD close, labels
  lifecycle failures, and retains every descriptor, capability, secret,
  parent-loss, signal, and listener-cleanup assertion. Eleven consecutive full
  Node-hosted clean rooms passed before the final aggregate run. The previous
  standing round-two report predates these executable changes and is
  superseded; its disposition remains durable here.
- Final executable head `e6f172222fbb3549cdb95cf9c2827ee3d41870d8` is
  pushed in draft PR #78 with an exact verification and distribution-boundary
  body. Issue #62 carries the slice handoff, remains open for 62C, and issue #77
  remains the independent public-distribution blocker. Exact-head hosted and
  standing/targeted review gates, ready, merge, and local reconciliation remain
  coordinator gates.

### 62C runtime-owned target admission

- PR #78 subsequently passed both exact-head 5/5 review lanes, merged as
  `4b6253e4eabd34d437a0d8907c05a87018ddd35c`, and reconciled locally. Issue #62
  stayed open for the final runtime target-admission slice.
- Released bb 0.36 nav panels provide no implicit project context. The 62C
  panel therefore lists bounded eligible projects and requires an explicit
  selection. `status({})` is read-only; `admit({projectId})` is the only runtime
  start and source-admission edge. The backend re-resolves exactly one local
  source on the released primary host through public SDK calls and never sends
  its path to the browser.
- The supervisor frame, descriptor, capability document, and route namespace
  advance together to API 2. FD 3 privately carries the canonical runtime data
  root; the runtime persists its own stable principal/context identity and
  opens one catalog beneath that root. The per-child bearer remains ephemeral.
  Absent-Origin supervisor routes admit a source and list targets only with the
  exact target scopes.
- Admission performs bounded passive discovery, one-use inspection transition,
  and per-target atomic catalog refresh. Public target rows contain only opaque
  ID, bounded label, plugin ID, and positive revision. No source path, root key,
  credential, runtime URL, process fact, host fact, native inventory, package
  path, or browser topology enters the public snapshot.
- The extracted private-package bb 0.36 proof admits one-target and multi-target
  projects, preserves target revisions through runtime crash, reload, disable/
  enable, and graceful reopen, then proves removal, reinstall, forced server-
  child loss, listener/process cleanup, hostile-PATH nonexecution, log nonleak,
  inert retained cache bytes, and normal-profile preservation. Its exact local
  verification artifact contains 14 files with SHA-256
  `f6f969432a75968246825a8978b73e4ef48c87c641d78558ddefb1a667211450`;
  the embedded arm64 runtime is 64,849,634 bytes with SHA-256
  `8a8397f198368f43d81beeac56782c334a20fc0149626b08d5420dbaf327e155`
  and runtime version `0.1.0-alpha.3`.
- The authoritative exact-tree aggregate passes 642 tests: inspection 136,
  runtime 186, CLI 82, Workbench 66, Linear plugin 21, Mate plugin 66, and
  scripts 85. The first aggregate correctly found that the legacy CLI package
  proof still pinned alpha.2; advancing that proof to alpha.3 closed the only
  integration drift. The final 41-file CLI package has SHA-256
  `14f21a0f885cbc9abbce64e9e1a429d0bfffca40403870c76aa8b06d026face4`.
  Formatting, type and compatibility checks, all builds, 26 browser/axe/
  screenshot cases, native declaration checks, the moved standalone proof, and
  the final extracted Mate package proof are green.
- Browser launch remains unavailable under #70; target execution, native
  inventory mutation, Connect, publication, and external redistribution remain
  outside 62C. The private-package and #77 licensing boundary is unchanged.

## Prompt / Goal Alignment

The prompt carries the `merged` horizon, conditional Gate 0, authority,
forbidden actions, review model, verification, done/not-done, and persistence.

## Forbidden-action audit

Through Gate 0 there has been no npm publication/tag, Git tag/release,
visibility change, announcement, upstream edit/submission, Connect pairing or
share, automatic bunx execution, normal-profile plugin mutation, or private SDK
fallback. The only lifecycle mutations occurred in an `env -i` disposable bb
0.36 profile with explicit temporary HOME/XDG/cache/data roots and loopback
ports. The normal profile was inspected read-only for unique-plugin absence.

## Final State

Execution active. Gate 0, standalone-runtime #56, runtime foundation #55,
source-catalog slices 57A, 57B1, and 57B2, and host-shell slices 62A and 62B are
merged and reconciled; #57 is closed. Host-shell #62 remains open for active
slice 62C. Its runtime-owned target-admission implementation and extracted
released-bb lifecycle proof are locally complete; final aggregate verification,
standing and targeted exact-head review, hosted proof, ready, merge, and local
reconciliation remain. All release/upstream/Connect/normal-profile stop
boundaries remain intact, and #77 remains the independent external-
distribution blocker.
