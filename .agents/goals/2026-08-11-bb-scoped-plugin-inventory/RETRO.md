# Execution Retro: bb-scoped Plugin Studio inventory

Date started: 2026-08-11
Date finalized: Pending
Status: Executing
Spec: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/SPEC.md`
Goal: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/GOAL.md`
Prompt: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/PROMPT.md`
Refs: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/REFS.md`

## Summary

- Objective: automatically inventory every bb-registered local project and its
  source plugins using workspace-aware, path-private discovery.
- Completion horizon: `ready-pr`.
- Authority used: preparation goal, packet creation, four read-only delegated
  audits, GitHub issue creation/sub-issue linkage, parent roadmap update.
- Outcome: milestone A remains independently ready with its exact-head evidence.
  PR #84 remains draft. Its current scanner/fix code head
  `89a38e0ff5cf67d423d80c88cb2c8e1993b3a9a0` is locally green, but current
  artifact, Plugin Studio Live, hosted, and exact-head review proof remains
  pending. Neither PR is merged.
- Tracker/PR/source-control state: #82 open beneath #21; #62 complete; #70/#77
  open and out of scope; PR #73 preserved; PR #83 is at documentation head
  `06ee8ae4943bcbc61fb2302196ef370d12f18726` and contains implementation head
  `af7b4dd1a712fbe015bd93a249e2d156a382fa44`; PR #84's current scanner/fix
  code head is `89a38e0ff5cf67d423d80c88cb2c8e1993b3a9a0` and remains draft.
- Verification: prompt/doctor, Mate 80/80 (378 assertions), plugin check/build,
  15 Chromium screenshot/axe cases including 420px, Prettier, and diff checks
  pass on the milestone-A implementation head. Before this documentation and
  shipped-skill reconciliation, milestone B's current local matrix passes 790
  tests: inspection 193, runtime 204, CLI 110, Mate 102, scripts 94, Workbench
  66, and Linear 21. Mate reports 446 assertions, inspection 574, and CLI 539.
  Current standalone and private-package identities require regeneration.
- Review state: milestone-A round-one and round-two findings are dispositioned;
  both exact-head round-three reviews are clean 5/5. Milestone-B reviews at
  `a69fe031c43f5eb20f5c0ca43fe394f15f2a4b4a` are historical and superseded;
  current exact-head reviews and hosted CI remain pending.
- Remaining risks: artifact identity must be regenerated if executable inputs
  change. Browser bootstrap/live preview and external redistribution remain
  explicitly out of scope under #70 and #77.

## Readiness

- Prompt checked: 3,994/4,000 characters; no placeholders; passed.
- Goal/prompt alignment checked: passed after one delegated repair round.
- Review blockers: PR #84 needs fresh standing and targeted reviews at the
  final exact head, with zero open P0-P3 findings.
- Verification blockers: regenerate and verify current runtime/package
  identities, rerun current Plugin Studio Live proof, and obtain exact-head
  hosted CI. The older Workbench-era proof is historical only.
- Tracker blockers: none; #82 owns the slice and #21 lists it.
- Authority blockers: merge and release intentionally excluded.
- Next action: finish current artifact proof, rerun Plugin Studio in Live bb,
  obtain exact-head hosted CI and two clean review lanes, then mark PR #84 ready
  without merging or releasing.

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
| 3     | Current B standing    | Pending                           | —     | Pending           | —          | Required on the final exact head.                  |
| 3     | Current B batch/UI    | Pending                           | —     | Pending           | —          | Required on the final exact head.                  |

## Verification Log

| Check                                 | Scope             | Result  | Notes                                                           |
| ------------------------------------- | ----------------- | ------- | --------------------------------------------------------------- |
| `check-goal-prompt --no-placeholders` | Prompt            | Pass    | 3,994/4,000 characters; no placeholders.                        |
| `goal-loop-doctor`                    | Packet            | Pass    | Packet OK; zero reports at execution start.                     |
| `goal-loop-doctor`                    | Historical state  | Pass    | Passed at the former `a69fe031` readiness checkpoint.           |
| `goal-loop-doctor`                    | Current packet    | Pass    | Packet OK; 7 reports; current readiness gates remain pending.   |
| `prettier --check`                    | Packet            | Pass    | All five Markdown files formatted.                              |
| `git diff --check`                    | Packet            | Pass    | No whitespace errors.                                           |
| `bun --filter bb-plugin-mate test`    | PR #83            | Pass    | 80 tests; 378 assertions.                                       |
| `bun --filter bb-plugin-mate check`   | PR #83            | Pass    | Native plugin contracts type-check.                             |
| `bun --filter bb-plugin-mate build`   | PR #83            | Pass    | Released bb plugin build succeeds.                              |
| Mate Chromium visual/axe              | PR #83            | Pass    | 15 cases; wide, 420px, light, and dark.                         |
| `bun run check`                       | B checkpoint      | Pass    | All packages and compatibility before restoration.              |
| `bun run test`                        | B checkpoint      | Pass    | Aggregate packages, scripts, and clean room before restoration. |
| `bun run build`                       | B checkpoint      | Pass    | All workspace builds before restoration.                        |
| `bun run visual:test`                 | B checkpoint      | Pass    | 14 Workbench + 20 Mate Chromium cases.                          |
| Exact-head archive Mate gates         | PR #84            | Pass    | 84 tests/356 assertions; check/build; 20 visual/axe cases.      |
| `bun run standalone:test`             | Restored B        | Pass    | Runtime SHA `0cf4a5eb…`, 64,849,634 bytes.                      |
| `bun run mate:package:test`           | Restored B        | Pass    | Twice; 14 files; package SHA `3196ce94…`.                       |
| `bun test scripts`                    | Restored B        | Pass    | 88 tests; 282 expectations.                                     |
| Path plugin build + atomic reload     | Live bb 0.36      | Pass    | Source/settings preserved; app hash `986f67d68b68472e`.         |
| `status({})` then `refresh({})` RPC   | Live bb 0.36      | Pass    | Schema v3; BB Mate 2 plugins; grid ready-empty; no paths.       |
| In-app Browser inspection             | Live bb 0.36      | Pass    | Catalog, detail, and Back flow verified on the real remote.     |
| Hosted verify/visual/standalone       | Historical B      | Pass    | `3162a521`; superseded for current readiness.                   |
| `bun run test`                        | Historical B      | Pass    | 709 tests at `a69fe031`; superseded for current readiness.      |
| `bun run build`                       | Historical B      | Pass    | Green at `a69fe031`; superseded for current readiness.          |
| `bun run visual:test`                 | Historical B      | Pass    | 14 Workbench + 20 Mate cases; superseded for current readiness. |
| `bun run standalone:test`             | Historical B      | Pass    | Runtime `4b216966…de05`; superseded for current readiness.      |
| `bun run mate:package:test`           | Historical B      | Pass    | Package `8301ce83…5dc1`; superseded for current readiness.      |
| Hosted verify/visual/standalone       | Historical B      | Pass    | Green at `a69fe031`; superseded for current readiness.          |
| Path plugin build + atomic reload     | Historical Live   | Pass    | `a69fe031`; Workbench-era proof, not current readiness proof.   |
| `status({})` then `refresh({})` RPC   | Historical Live   | Pass    | `a69fe031`; schema v3 and no paths; superseded.                 |
| In-app Browser catalog/detail/Back    | Historical Live   | Pass    | `a69fe031`; Workbench-era proof; superseded.                    |
| `bun run test`                        | Current code      | Pass    | 790 tests at `89a38e0`: 193/204/110/102/94/66/21.               |
| Mate assertions                       | Current code      | Pass    | 102 tests and 446 assertions before docs/skill reconciliation.  |
| Inspection assertions                 | Current code      | Pass    | 193 tests and 574 assertions before docs/skill reconciliation.  |
| CLI assertions                        | Current code      | Pass    | 110 tests and 539 assertions before docs/skill reconciliation.  |
| `bun test inspect-mate-package`       | Current guidance  | Pass    | 10 tests; 61 expectations; Plugin Studio prose pinned.          |
| `tsc -p scripts/tsconfig.json`        | Current guidance  | Pass    | Inspector and regression type-check.                            |
| Standalone/package identity           | Current readiness | Pending | Invalidated; regenerate on the final exact head.                |
| Hosted verify/visual/standalone       | Current readiness | Pending | Required on the final exact head.                               |
| Plugin Studio Live proof              | Current readiness | Pending | Rerun in released bb on the final exact head.                   |

## Prompt / Goal Alignment

- Checked by: delegated tracker/VCS auditor and coordinator.
- Result: passed after repair and final length/doctor validation.
- Missing from prompt: initial draft omitted exact branch names and concrete
  runtime/CLI package checks, while GOAL/REFS disagreed on one versus two PRs.
- Fixes made: standardized two required stacked PRs and branch names; named
  runtime and CLI checks; removed merge-like wording from the ready-PR spec.

## Tracker / PR Log

| Item       | State | Notes                                                                                                                             |
| ---------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| GitHub #21 | Open  | Parent roadmap; #82 added, #62 checked, #70/#77 open.                                                                             |
| GitHub #82 | Open  | Focused all-project bb-scoped inventory sub-issue.                                                                                |
| GitHub #73 | Open  | Unrelated Biner setup lane; preserve without mutation.                                                                            |
| PR #83     | Ready | Head `06ee8ae`; implementation `af7b4dd`; two clean 5/5 reviews and hosted CI green.                                              |
| PR #84     | Draft | Current scanner/fix code head `89a38e0`; fresh artifact, Plugin Studio Live, hosted, and exact-head review proof remains pending. |

## Follow-Ups

- Browser bootstrap and live preview remain #70.
- External runtime redistribution compliance remains #77.

## Final State

- Completion proof: pending. The current scanner/fix code checkpoint is locally
  green, but artifact identity, current Plugin Studio Live proof, exact-head
  hosted CI, and exact-head reviews remain.
- Prompt length: 3,994/4,000; no placeholders; passed.
- Review report summary: milestone-A rounds one and two and milestone-B round
  one are archived historical evidence. Milestone-A round three remains clean
  5/5. Milestone-B round two is clean only at historical head `a69fe031` and is
  superseded; fresh current exact-head reviews are pending.
- Verification summary: milestone A passes 80 Mate tests/378 assertions,
  plugin check/build, and 15 Chromium cases. Before this documentation and
  shipped-skill reconciliation, current milestone B passes 790 local tests:
  inspection 193, runtime 204, CLI 110, Mate 102, scripts 94, Workbench 66, and
  Linear 21. Current artifact and visual/Live identities remain pending.
- Forbidden actions audit: no merge, queue, publication, release, upstream edit,
  plugin removal/reinstall, or PR #73 mutation has occurred; confirm once more
  before readiness.
- Remaining findings / risks: no current findings are accepted or deferred;
  fresh review is pending. Preview/browser bootstrap remains #70; external
  runtime redistribution remains #77.
- Final transcript proof: the catalog root, Workbench-era detail, and Back flow
  were verified at historical head `a69fe031`. A current Plugin Studio Live UI
  rerun is required before readiness.
