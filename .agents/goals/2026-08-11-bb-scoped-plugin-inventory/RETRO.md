# Execution Retro: bb-scoped Plugin Studio inventory

Date started: 2026-08-11
Date finalized: 2026-08-12
Status: Complete; post-completion reconciliation added 2026-08-13
Spec: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/SPEC.md`
Goal: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/GOAL.md`
Prompt: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/PROMPT.md`
Refs: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/REFS.md`

## Summary

> Post-completion truth: PR #83 merged as `ff9289d1`, PR #84 merged as
> `13d892cd`, and scanner follow-ups #89-#91 landed on current `main`
> (`84e80f5c`). #82 is closed. The later repository move left the installed
> path registration targeting the removed checkout; #94 owns the supported
> preserve-state repair. Technical identity migration (#86/#95), compatibility
> policy (#93), native-runtime convergence (#96), and bounded directory
> enumeration (#97) are separate active follow-ups. Ready-but-unmerged, old
> artifact, and successful-live statements below are chronological evidence,
> not current state.

- Objective: automatically inventory every bb-registered local project and its
  source plugins using workspace-aware, path-private discovery.
- Completion horizon: `ready-pr`.
- Authority used: preparation goal, packet creation, four read-only delegated
  audits, GitHub issue creation/sub-issue linkage, parent roadmap update.
- Outcome: milestone A remains independently ready with its exact-head evidence.
  PR #84's exact implementation head is
  `7bdcfc3b8379ad08e0d4cd5ea36ad4eb6da60b7a` (`fix: preserve Plugin Studio
refreshes`, following the `6d58faad` evidence head) with green exact-head
  hosted CI, two clean round-4 review lanes, and all review threads resolved;
  it subsequently proceeded through review and merge.
- Historical tracker/PR/source-control state at the ready-PR horizon: #82 was
  open beneath #21; #62 complete; #70/#77 out of scope; PR #73 preserved; PR
  #83 exact head `1c897d5`; PR #84 implementation head `7bdcfc3b…`.
- Verification: prompt/doctor, Mate 80/80 (378 assertions), plugin check/build,
  15 Chromium screenshot/axe cases including 420px, Prettier, and diff checks
  pass on the milestone-A implementation head. Milestone B's current local
  matrix passes 791 tests: inspection 194/577 assertions, runtime 204/957, CLI
  110/539, Mate 102/446, scripts 94/351, Workbench 66, and Linear 21. Standalone,
  managed package, check, format, and diff gates are green. Current runtime,
  manifest, and private-package identities are recorded below.
- Review state: milestone-A round-one and round-two findings are dispositioned;
  both exact-head round-three reviews are clean 5/5. Milestone-B rounds at
  `a69fe031` and docs head `27176c76` are historical and superseded. Both
  round-4 lanes (standing and targeted batch/UI) are clean 5/5 at exact head
  `7bdcfc3b` with zero open P0-P2 findings; each recorded one P3 ledger-drift
  note that this reconciliation commit resolves. An architecture audit at the
  same head concluded SIMPLIFY IN PLACE with an owner-approved post-landing
  simplification stack; the sole open review thread (bounded directory
  enumeration) was answered with measured evidence and resolved as deferred
  hardening.
- Remaining risks: artifact identity must be regenerated if executable inputs
  change. Browser bootstrap/live preview and external redistribution remain
  explicitly out of scope under #70 and #77. The owner-approved simplification
  stack (pnpm YAML validator removal, matcher caps-for-accounting, discovery
  manifest/attestation slimming) lands as separate stacked PRs after readiness.

## Readiness

- Prompt checked: 3,994/4,000 characters; no placeholders; passed.
- Goal/prompt alignment checked: passed after one delegated repair round.
- Review blockers: none. Round-4 standing and targeted batch/UI reviews are
  clean 5/5 at exact head `7bdcfc3b` with zero open P0-P2 findings; both P3
  ledger notes are resolved by this reconciliation commit.
- Verification blockers: none. Exact-head hosted CI (run 31611595184),
  artifact, preserve-state Live RPC, and current Browser root/detail/Back
  gates are green.
- Tracker blockers: none; #82 owns the slice and #21 lists it.
- Authority blockers: merge and release intentionally excluded.
- Next action at completion was the owner-controlled merge. Current follow-up
  work is tracked in #86, #93, #94-#102.

## Goal Amendments

| Time       | Change                                                          | Reason                                                                                                | Approved By                                   |
| ---------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 2026-08-11 | Chose `ready-pr` horizon and coordinator-with-workers topology. | User asked for documented autonomous execution and delegation; merge/release remain owner-controlled. | User request and standing repository boundary |

## Execution Log

```text
2026-08-11 - Preparation began
- Changed: Created the five-file goal packet.
- Verified: Live worktree, prior goal/plan, public SDK surfaces, issue/PR baseline.
- Result: Contract drafted; four bounded read-only audits delegated.
- Next: Reconcile audit evidence and validate the packet.
- Blockers: None.

2026-08-11 - Preparation contract reconciled
- Changed: Created #82 as a sub-issue of #21 and added it to the roadmap; chose
  one multi-root runtime operation over sequential per-project admission.
- Verified: Backend, runtime, frontend, and tracker/VCS audits returned exact
  code surfaces, caps, privacy rules, tests, and branch recommendations.
- Result: Ordinary projects only; activity orders but never filters; duplicate
  canonical roots scan once/fan out; npm/Bun/pnpm workspace forms are bounded;
  unsupported declarations are honest partial root-only scans.
- Next: Validate prompt/doctor and isolate milestone A.
- Blockers: None.

2026-08-11 - Native project-browser milestone isolated and hardened
- Changed: Created draft PR #83 on `feat/plugin-workbench/native-project-browser`,
  adopted the pinned bb 0.36 component registry, simplified runtime status,
  added Settings-style reload, plugin detail/task actions, and responsive visual
  coverage; closed both review rounds' milestone-local findings.
- Verified: Implementation head `af7b4dd1a712fbe015bd93a249e2d156a382fa44`
  passes 80 Mate tests / 378 assertions, plugin check/build, and 15 Chromium
  screenshot/axe cases including a 420px viewport.
- Result: Milestone A is independently coherent; automatic redirects replace
  history, detail reload failures remain visible, and stale task states are
  distinct. Implementation head
  `af7b4dd1a712fbe015bd93a249e2d156a382fa44` is followed by documentation head
  `06ee8ae4943bcbc61fb2302196ef370d12f18726` on PR #83.
- Next: Preserve the ready, independently mergeable PR #83 while completing its
  stacked inventory follow-up.
- Blockers: None within milestone A. Both round-three reviews are clean 5/5,
  hosted verify/visual/standalone are green, and PR #83 is ready and CLEAN.

2026-08-11 - Stacked batch inventory reached aggregate green
- Changed: Added workspace-aware multi-root discovery, strict grouped runtime
  transport, public-sdk project inventory and source revalidation, snapshot v3,
  always-expanded project/plugin presentation, 20 responsive visual baselines,
  and complete Radix dependency notice coverage.
- Verified: The implementation checkpoint reported 142 inspection, 192 runtime,
  86 CLI, and 84 Mate tests; package checks/builds; aggregate root
  check/test/build; 14 Workbench and 20 Mate
  Chromium visual/axe cases; Prettier and diff check.
- Result: One authenticated operation shares the global filesystem/catalog
  budgets across every eligible bb project; paths stay server-private; duplicate
  roots scan once; idle projects remain visible; per-project failures isolate.
  Draft PR #84 holds this checkpoint, whose multi-root scanner, authenticated
  batch transport, snapshot-v3 frontend, and 20-case Mate visual surface must be
  restored above the final PR #83 head before final proof.
- Next: Restore PR #84, rerun full aggregate and clean-room gates, verify Live
  bb, obtain exact-head reviews/CI, and update this ledger.
- Blockers: Final package identities and hashes are intentionally not recorded
  until regenerated and verified on the restored exact head.

2026-08-11 - Restored stacked inventory passed final local proof
- Changed: Restored the schema-v3 managed lifecycle harness and strict public
  codec, regenerated the exact runtime stamp, and reconciled the private package.
- Verified: 651 aggregate tests; 14 Workbench plus 20 Mate Chromium visual/axe
  cases; standalone SHA 0cf4a5eb9872b4e9ea1acb01343e537b3e36fa980b5ef6f92934de802eee0d24;
  14-file package SHA 3196ce94649bf678abaf72daa55638fa1273995342d16a63450bafec366a7110;
  scripts 88/88; full check/build/format/diff; managed package proof twice.
- Result: The extracted plugin shows BB Mate with Linear and Plugin Workbench,
  keeps grid visible with an honest empty scan, survives the full lifecycle
  matrix with stable identities, leaks no paths, executes no target code, and
  leaves the normal bb profile unchanged.
- Next: Push PR #84 and run exact-head reviews and hosted CI.
- Blockers: Final PR #84 review/hosted state only.

2026-08-11 - Live bb path plugin verified
- Changed: Built the settled path plugin, atomically reloaded `mate`, then staged
  the exact ignored development runtime after its first resolver check correctly
  rejected the old artifact and reloaded once more. No uninstall or retargeting
  occurred; plugin settings, KV, database, and source were preserved.
- Verified: The read-only status RPC returned schema v3 with BB Mate and grid
  unscanned; the sole refresh returned runtime alpha.3/API2, BB Mate with Linear
  plus Plugin Workbench, and grid ready-empty, with no path in either response.
  Browser inspection verified the compact runtime line, icon reload, always-open
  projects, plugin-only Open rows, detail/task state, and Back-to-projects route.
- Result: The real remote and desktop-equivalent bb surface matches the intended
  all-project native model. Preview remains truthfully unavailable under #70.
- Next: Push the exact evidence head and obtain final standing/targeted reviews
  plus hosted verify/visual/standalone proof.
- Blockers: Final PR #84 review and hosted state only.

2026-08-11 - Milestone-B round-one findings remediated
- Changed: Pruned excluded workspace subtrees before scan budgets; propagated
  client disconnect and runtime deadline cancellation through discovery and
  catalog persistence; added atomic complete-snapshot retirement with stable
  target reopening; isolated unsafe display labels per project; restored
  malformed-route replacement navigation and bb-native tie ordering; replaced
  stale one-project package guidance.
- Verified: Inspection 145/145, runtime 198/198, CLI 91/91, Mate 89/89, scripts
  89/89; 699 aggregate tests; 14 Workbench plus 20 Mate Chromium screenshot/axe
  cases; root check/build/format/diff; standalone and managed-package clean
  rooms. Runtime SHA is `ece8693f…b884`; private package SHA is
  `d7dc427c…c1ea`.
- Result: SB-001 through SB-007 and LR-BUI-001/LR-BUI-002 are dispositioned in
  code, tests, guidance, and this evidence ledger.
- Next: Push the replacement head, repeat Live proof, and obtain clean exact-head
  reviews plus hosted CI.
- Blockers: Review/hosted readiness only.

2026-08-11 - Replacement audit hardened cancellation and durable catalog bounds
- Changed: Made inventory completeness explicit; persisted private canonical
  project-scope authority; reconciled healthy projects through partial peers;
  retired omitted/empty project scopes; raced cancellation against
  never-resolving discovery; bounded history to 512 identities and 256 physical
  events per retained identity with explicit cursor expiry and integrity floors.
- Verified: Never-resolving and late-rejecting discovery; unrelated and nested
  partial scopes; aliases; empty/omitted inventories; 129 healthy churn cycles;
  capacity reclamation; retire/reopen stability; cursor expiry and gap-free
  recent pagination; rollback/migration/tamper/trigger-removal fail-closed cases.
  Inspection passes 145/145, runtime 202/202 (952 assertions), CLI 96/96 (492),
  and Mate 90/90 (377).
- Result: The initial replacement-review findings and every adjacent P2/P3 are
  fixed without changing the browser response schema or exposing private scope
  data. Shipped guidance now names npm, Bun, and bounded pnpm workspaces and no
  longer promises that read-only status must be idle.
- Next: Push this exact evidence head, repeat final Live proof, and obtain clean
  replacement reviews plus hosted CI.
- Blockers: Review/hosted readiness only.

2026-08-11 - Historical Workbench-era executable head proved clean
- Changed: Regenerated the final runtime/package identities, pushed exact PR #84
  head `a69fe031c43f5eb20f5c0ca43fe394f15f2a4b4a`, built the path plugin, staged
  only the verified ignored runtime pair, and atomically reloaded Mate without
  uninstalling, retargeting, or changing persistent plugin state.
- Verified: 709 aggregate tests; 14 Workbench plus 20 Mate Chromium/axe cases;
  standalone `4b216966...de05`; 14-file package `8301ce83...5dc1`; exact served
  app hash `1247405f6c1059d8`; schema-v3 status/refresh; BB Mate with Linear plus
  Plugin Workbench; grid ready-empty; no path leakage. Hosted verify, visual,
  and standalone are terminal success. Standing and targeted reviews are both
  clean 5/5 with zero P0-P3 findings.
- Result: The Workbench-era executable behavior matched the agreed all-project
  native experience in the real bb remote at `a69fe031`. This proof remains
  useful historical evidence but is superseded for current readiness.
- Next: Continue implementation and repeat every artifact-dependent, Live,
  hosted, and review gate on the final current head.
- Blockers: This historical proof cannot establish current readiness.

2026-08-12 - Scanner and Plugin Studio fixes reopened final proof
- Changed: Hardened the multi-root scanner, runtime/backend/frontend behavior,
  and current Plugin Studio presentation through code head
  `89a38e0ff5cf67d423d80c88cb2c8e1993b3a9a0`; updated the shipped skill to use
  current Plugin Studio prose and pinned that guidance in package inspection.
- Verified: Before the documentation/skill reconciliation, the local aggregate
  passed 790 tests: inspection 193, runtime 204, CLI 110, Mate 102, scripts 94,
  Workbench 66, and Linear 21. Mate reported 446 assertions, inspection 574,
  and CLI 539.
- Result: The current code checkpoint is locally green. The former `a69fe031`
  Workbench-era package, Live, hosted, and review proof is now explicitly
  historical and superseded for readiness.
- Next: Regenerate standalone and private-package identities, rerun current
  Plugin Studio Live proof, obtain exact-head hosted CI and two clean reviews,
  then reconcile PR #84 for ready without merging.
- Blockers: Current artifact identities, Live proof, hosted CI, and exact-head
  review are pending.

2026-08-12 - Intermediate pushed head passed artifact and preserve-state Live proof
- Changed: Pushed exact evidence head
  `23b14cb09cbba3551941af9ce254a365a66213f9`, regenerated the standalone
  runtime and private Mate package, and reloaded the path plugin without
  uninstalling, retargeting, or changing its source or persistent state.
- Verified: 790 aggregate tests: inspection 193/574 assertions, runtime 204/957,
  CLI 110/539, Mate 102/446, scripts 94/351, Workbench 66, and Linear 21.
  Standalone, managed package, check, format, and diff passed. Runtime
  `9493df9e…` is 64,882,658 bytes, manifest `4ba4ce42…` is 6,494 bytes, and
  package `fee4508a…` is 24,686,639 bytes.
- Result: Preserve-state Live proof passed at the exact head. Plugin Studio was
  served at app hash `de3682…`; source stayed unchanged; runtime stayed running;
  schema 3 was ready; BB Mate exposed Linear revision 15 plus Plugin Studio
  revision 16; grid was ready-empty; responses contained no `/Users`; logs were
  empty.
- Next: Rerun root/detail/Back visual click-through when Browser binding is
  available, obtain exact-head hosted CI and two clean reviews, then reconcile
  PR #84 for ready without merging.
- Blockers: At this superseded checkpoint Browser binding was unavailable, so
  visual click-through was not rerun. Hosted CI and exact-head reviews remained
  pending.

2026-08-12 - Final artifact stamp and current Browser proof passed
- Changed: Added the remaining-BOM inspection regression, regenerated artifact
  identities, and pushed exact evidence head
  `6d58faad71f571334cf5c84acad7f3b38257d05a` above PR #83 base `1c897d5`.
- Verified: 791 aggregate tests: inspection 194/577 assertions, runtime 204/957,
  CLI 110/539, Mate 102/446, scripts 94/351, Workbench 66, and Linear 21.
  Runtime `95ab3719…` is 64,882,658 bytes, manifest `027cde5e…` is 6,494 bytes,
  and package `0d2a37d3…` is 24,686,636 bytes.
- Result: Current Browser proof passed. Every project was expanded; BB Mate
  listed Linear plus Plugin Studio; grid was ready-empty; Plugin Studio revision
  16 detail showed preview-unavailable truth and Project tasks containing
  OS-648; Back returned to the root catalog. The preserve-state RPC/log proof
  remains green at the same final artifact lineage.
- Next: Obtain exact-head hosted CI and two clean reviews, then reconcile PR #84
  for ready without merging.
- Blockers: Hosted CI and exact-head reviews remain pending.

2026-08-12 - Exact-head readiness gates closed at 7bdcfc3b
- Changed: Pushed implementation head
  `7bdcfc3b8379ad08e0d4cd5ea36ad4eb6da60b7a` (catalog-root refreshes survive
  panel navigation, detail-anchored refreshes stay generation-cancelled,
  Plugin Studio product copy, seven re-recorded visual snapshots); answered
  and resolved the final review thread (bounded directory enumeration) as
  deferred hardening with measured evidence (100k entries: 44 ms read, 32 ms
  sort, 38 MB transient RSS, isolated runtime, 30 s deadline).
- Verified: Hosted CI run 31611595184 is green at the exact head (verify,
  visual, standalone-darwin-arm64, GitGuardian). Round-4 standing and targeted
  batch/UI reviews are both clean 5/5 with zero open P0-P2 findings. Focused
  suites: inspection 194, runtime 204, CLI 110 hosted (one known-flaky native
  timing case locally), Mate 104/461 assertions, scripts 94/351; 20 Mate plus
  14 Workbench Chromium visual/axe cases pass locally at the head. Frontend-only
  delta leaves runtime `95ab3719…`, manifest `027cde5e…`, and package
  `0d2a37d3…` identities unchanged.
- Result: An architecture audit at this head concluded SIMPLIFY IN PLACE: the
  bb-allowlist/batch-scan/path-private architecture is sound; owner approved a
  post-landing simplification stack (pnpm YAML block validator removal,
  matcher caps-for-accounting swap, discovery manifest/attestation slimming)
  as separate stacked PRs. Both round-4 P3 ledger notes are resolved by this
  reconciliation entry.
- Next: Push this reconciliation commit, confirm hosted CI at the docs
  successor head, then mark PR #84 ready. No merge is authorized.
- Blockers: None for readiness; merge and release remain owner-approved.
```

## Review Log

| Round | Scope                 | Report                            | Score | State             | Open P0-P2 | Notes                                              |
| ----- | --------------------- | --------------------------------- | ----- | ----------------- | ---------- | -------------------------------------------------- |
| 1     | Milestone A standing  | `standing/round-1.json`           | 3/5   | Changes requested | 8 P2       | Superseded by focused fixes.                       |
| 1     | Milestone A native UI | `targeted-native-ui/round-1.json` | 3/5   | Changes requested | 5 P2       | Superseded by focused fixes.                       |
| 2     | Milestone A standing  | `standing/round-2.json`           | 4/5   | Changes requested | 2 P2       | Redirect/evidence fixes dispositioned.             |
| 2     | Milestone A native UI | `targeted-native-ui/round-2.json` | 3/5   | Changes requested | 2 P2       | Detail/narrow-proof fixes dispositioned.           |
| 3     | Milestone A standing  | `standing/round-3.json`           | 5/5   | Clean             | 0          | Exact head and hosted CI verified.                 |
| 3     | Milestone A native UI | `targeted-native-ui/round-3.json` | 5/5   | Clean             | 0          | Exact head and 420px Live UI proof clean.          |
| 1     | Milestone B standing  | `standing-batch/round-1.json`     | 3/5   | Changes requested | 6 P2       | All findings fixed on replacement implementation.  |
| 1     | Milestone B batch/UI  | `targeted-batch-ui/round-1.json`  | 3/5   | Changes requested | 2 P2       | Both findings fixed on replacement implementation. |
| 2     | Historical B standing | `standing-batch/round-2.json`     | 5/5   | Superseded        | 0          | Clean at `a69fe031`; not current readiness proof.  |
| 2     | Historical B batch/UI | `targeted-batch-ui/round-2.json`  | 5/5   | Superseded        | 0          | Clean at `a69fe031`; not current readiness proof.  |
| 3     | Docs-head B standing  | `standing-batch/round-3.json`     | 5/5   | Superseded        | 0          | Clean at docs head `27176c76`; superseded.         |
| 3     | Docs-head B batch/UI  | `targeted-batch-ui/round-3.json`  | 5/5   | Superseded        | 0          | Clean at docs head `27176c76`; superseded.         |
| 4     | Current B standing    | `standing-batch/round-4.json`     | 5/5   | Clean             | 0          | Exact head `7bdcfc3b`; one P3 ledger note fixed.   |
| 4     | Current B batch/UI    | `targeted-batch-ui/round-4.json`  | 5/5   | Clean             | 0          | Exact head `7bdcfc3b`; 34 visual cases re-proven.  |

## Verification Log

| Check                                 | Scope              | Result | Notes                                                            |
| ------------------------------------- | ------------------ | ------ | ---------------------------------------------------------------- |
| `check-goal-prompt --no-placeholders` | Prompt             | Pass   | 3,994/4,000 characters; no placeholders.                         |
| `goal-loop-doctor`                    | Packet             | Pass   | Packet OK; zero reports at execution start.                      |
| `goal-loop-doctor`                    | Historical state   | Pass   | Passed at the former `a69fe031` readiness checkpoint.            |
| `goal-loop-doctor`                    | Current packet     | Pass   | Packet OK; 7 reports; current readiness gates remain pending.    |
| `prettier --check`                    | Packet             | Pass   | All five Markdown files formatted.                               |
| `git diff --check`                    | Packet             | Pass   | No whitespace errors.                                            |
| `bun --filter bb-plugin-mate test`    | PR #83             | Pass   | 80 tests; 378 assertions.                                        |
| `bun --filter bb-plugin-mate check`   | PR #83             | Pass   | Native plugin contracts type-check.                              |
| `bun --filter bb-plugin-mate build`   | PR #83             | Pass   | Released bb plugin build succeeds.                               |
| Mate Chromium visual/axe              | PR #83             | Pass   | 15 cases; wide, 420px, light, and dark.                          |
| `bun run check`                       | B checkpoint       | Pass   | All packages and compatibility before restoration.               |
| `bun run test`                        | B checkpoint       | Pass   | Aggregate packages, scripts, and clean room before restoration.  |
| `bun run build`                       | B checkpoint       | Pass   | All workspace builds before restoration.                         |
| `bun run visual:test`                 | B checkpoint       | Pass   | 14 Workbench + 20 Mate Chromium cases.                           |
| Exact-head archive Mate gates         | PR #84             | Pass   | 84 tests/356 assertions; check/build; 20 visual/axe cases.       |
| `bun run standalone:test`             | Restored B         | Pass   | Runtime SHA `0cf4a5eb…`, 64,849,634 bytes.                       |
| `bun run mate:package:test`           | Restored B         | Pass   | Twice; 14 files; package SHA `3196ce94…`.                        |
| `bun test scripts`                    | Restored B         | Pass   | 88 tests; 282 expectations.                                      |
| Path plugin build + atomic reload     | Live bb 0.36       | Pass   | Source/settings preserved; app hash `986f67d68b68472e`.          |
| `status({})` then `refresh({})` RPC   | Live bb 0.36       | Pass   | Schema v3; BB Mate 2 plugins; grid ready-empty; no paths.        |
| In-app Browser inspection             | Live bb 0.36       | Pass   | Catalog, detail, and Back flow verified on the real remote.      |
| Hosted verify/visual/standalone       | Historical B       | Pass   | `3162a521`; superseded for current readiness.                    |
| `bun run test`                        | Historical B       | Pass   | 709 tests at `a69fe031`; superseded for current readiness.       |
| `bun run build`                       | Historical B       | Pass   | Green at `a69fe031`; superseded for current readiness.           |
| `bun run visual:test`                 | Historical B       | Pass   | 14 Workbench + 20 Mate cases; superseded for current readiness.  |
| `bun run standalone:test`             | Historical B       | Pass   | Runtime `4b216966…de05`; superseded for current readiness.       |
| `bun run mate:package:test`           | Historical B       | Pass   | Package `8301ce83…5dc1`; superseded for current readiness.       |
| Hosted verify/visual/standalone       | Historical B       | Pass   | Green at `a69fe031`; superseded for current readiness.           |
| Path plugin build + atomic reload     | Historical Live    | Pass   | `a69fe031`; Workbench-era proof, not current readiness proof.    |
| `status({})` then `refresh({})` RPC   | Historical Live    | Pass   | `a69fe031`; schema v3 and no paths; superseded.                  |
| In-app Browser catalog/detail/Back    | Historical Live    | Pass   | `a69fe031`; Workbench-era proof; superseded.                     |
| `bun run test`                        | Current exact head | Pass   | 791 at `6d58faa`: 194/204/110/102/94/66/21.                      |
| Inspection assertions                 | Current exact head | Pass   | 194 tests and 577 assertions.                                    |
| Runtime assertions                    | Current exact head | Pass   | 204 tests and 957 assertions.                                    |
| CLI assertions                        | Current exact head | Pass   | 110 tests and 539 assertions.                                    |
| Mate assertions                       | Current exact head | Pass   | 102 tests and 446 assertions.                                    |
| Script assertions                     | Current exact head | Pass   | 94 tests and 351 assertions.                                     |
| `bun test inspect-mate-package`       | Current guidance   | Pass   | 10 tests; 61 expectations; Plugin Studio prose pinned.           |
| `tsc -p scripts/tsconfig.json`        | Current guidance   | Pass   | Inspector and regression type-check.                             |
| `bun run standalone:test`             | Current exact head | Pass   | Runtime `95ab3719…`; 64,882,658 bytes.                           |
| Runtime manifest                      | Current exact head | Pass   | SHA `027cde5e…`; 6,494 bytes.                                    |
| `bun run mate:package:test`           | Current exact head | Pass   | Package `0d2a37d3…`; 24,686,636 bytes.                           |
| `bun run check` / format / diff       | Current exact head | Pass   | All green at `6d58faa`.                                          |
| Preserve-state path-plugin reload     | Current Live       | Pass   | Source unchanged; runtime running; app hash `de3682…`.           |
| `status({})` then `refresh({})` RPC   | Current Live       | Pass   | Schema 3 ready; rev15/rev16; grid empty; no `/Users`; no logs.   |
| Browser root/detail/Back              | Current Live       | Pass   | Expanded root, rev16 detail/OS-648, Back returned to root.       |
| Hosted verify/visual/standalone       | Current exact head | Pass   | Run 31611595184 green at `7bdcfc3b`.                             |
| Round-4 standing review lane          | Current exact head | Pass   | Clean 5/5; zero open P0-P2; one P3 ledger note fixed here.       |
| Round-4 targeted batch/UI review lane | Current exact head | Pass   | Clean 5/5; 104 Mate tests/461 assertions; 34 visual cases.       |
| Review-thread resolution              | PR #84             | Pass   | Directory-enumeration thread answered with measurements; 0 open. |

## Prompt / Goal Alignment

- Checked by: delegated tracker/VCS auditor and coordinator.
- Result: passed after repair and final length/doctor validation.
- Missing from prompt: initial draft omitted exact branch names and concrete
  runtime/CLI package checks, while GOAL/REFS disagreed on one versus two PRs.
- Fixes made: standardized two required stacked PRs and branch names; named
  runtime and CLI checks; removed merge-like wording from the ready-PR spec.

## Tracker / PR Log

| Item       | State  | Notes                                                                         |
| ---------- | ------ | ----------------------------------------------------------------------------- |
| GitHub #21 | Open   | Parent roadmap; #82 added, #62 checked, #70/#77 open.                         |
| GitHub #82 | Closed | Focused all-project bb-scoped inventory completed through merged PRs #83/#84. |
| GitHub #73 | Open   | Unrelated Biner setup lane; preserve without mutation.                        |
| PR #83     | Merged | Merge commit `ff9289d1`; milestone-A proof remains historical.                |
| PR #84     | Merged | Merge commit `13d892cd`; later scanner follow-ups landed through #91.         |

## Follow-Ups

- Browser bootstrap and live preview remain #70.
- External runtime redistribution compliance remains #77.

## Final State

- Completion proof: exact implementation head `7bdcfc3b` has green hosted CI
  (run 31611595184), two clean round-4 review lanes with zero open P0-P2
  findings, all review threads resolved, and unchanged artifact identities.
  PR #84 moves to ready once this reconciliation commit's hosted CI is green.
- Prompt length: 3,994/4,000; no placeholders; passed.
- Review report summary: milestone-A rounds one and two and milestone-B round
  one are archived historical evidence. Milestone-A round three remains clean
  5/5. Milestone-B round two (`a69fe031`) and round three (docs head
  `27176c76`) are superseded. Round-4 standing and targeted batch/UI lanes are
  the active readiness set: both clean 5/5 at exact head `7bdcfc3b`.
- Verification summary: milestone A passes 80 Mate tests/378 assertions,
  plugin check/build, and 15 Chromium cases. Current milestone B passes 791
  tests with the package/assertion breakdown above, standalone runtime
  `95ab3719…`, manifest `027cde5e…`, package `0d2a37d3…`, preserve-state Live
  status/refresh proof at app hash `de3682…`, and current Browser proof.
- Authority audit at the original horizon excluded merge. The PRs were later
  merged through the owner-controlled GitHub sequence; no publication, release,
  plugin removal/reinstall, or upstream edit is implied by this retro.
- Remaining findings / risks: the bounded directory-enumeration observation is
  explicitly deferred hardening, resolved on the PR with measured evidence. An
  owner-approved simplification stack (pnpm YAML block validator removal,
  matcher caps-for-accounting, discovery manifest/attestation slimming) lands
  as separate stacked PRs after readiness. Preview/browser bootstrap remains
  #70; external runtime redistribution remains #77.
- Final transcript proof: current Plugin Studio status/refresh RPC proof passed
  at the final artifact lineage, including schema 3, Linear revision 15, Plugin
  Studio revision 16, ready-empty grid, no `/Users`, and empty logs. Current
  Browser proof confirmed the expanded root, Linear plus Plugin Studio, rev16
  detail, preview-unavailable truth, OS-648 Project task, and Back to root.
