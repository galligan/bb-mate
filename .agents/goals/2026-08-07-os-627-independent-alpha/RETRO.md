# Execution Retro: OS-627 upstream-independent alpha

Date started: 2026-08-07
Date finalized: Pending
Status: Active
Spec: `.agents/goals/2026-08-07-os-627-independent-alpha/SPEC.md`
Goal: `.agents/goals/2026-08-07-os-627-independent-alpha/GOAL.md`
Prompt: `.agents/goals/2026-08-07-os-627-independent-alpha/PROMPT.md`
Refs: `.agents/goals/2026-08-07-os-627-independent-alpha/REFS.md`

## Summary

- Objective: complete OS-629 and OS-632 through OS-638 without upstream work.
- Completion horizon: `ready-pr`; OS-629 through OS-637 merge, OS-638 stops ready.
- Baseline: clean `main` at `a637aa0`; main CI run 31206636916 green.
- Capability baseline: native bb 0.35.1; official `@bb/plugin-sdk` remains
  unpublished, so Harness stays accurately unavailable.
- Forbidden actions: no publication, tag/release, visibility change,
  announcement, public-license choice, upstream edit, normal plugin/Connect
  mutation, or final OS-638 merge.

## Readiness

- Prompt checked: yes; 3,604 characters and no placeholders.
- Goal/prompt alignment checked: yes; packet doctor passes.
- Review blockers: none in preparation.
- Verification blockers: none in preparation.
- Tracker blockers: dependency graph recorded in the goal.
- Authority blockers: public license/release and OS-638 merge remain owner gates.
- Next action: implement OS-632 and preserve execution evidence here.

## Goal Amendments

| Time            | Change                                | Reason                                                                 | Approved By         |
| --------------- | ------------------------------------- | ---------------------------------------------------------------------- | ------------------- |
| 2026-08-07 prep | Finish at ready OS-638 PR, not merged | OS-638 explicitly requires an owner gate before merging its handoff PR | Issue specification |
| 2026-08-07 prep | Sequence OS-633 -> OS-634 -> OS-632   | Visual/a11y baselines must cover the completed launcher                | Preparation audit   |

## Execution Log

```text
2026-08-07 - Preparation baseline
- Changed: Prepared the active plan and direct-start goal packet.
- Verified: clean main a637aa0; green CI 31206636916; bb 0.35.1; SDK npm E404; live Linear dependency graph.
- Result: Every included issue is downstream-implementable; Harness and full live parity remain honestly gated.
- Next: Complete the preparation goal and start OS-629.
- Blockers: None.

2026-08-07 - OS-629 correction loop aggregate-green
- Changed: Added a validated compatibility target, public/passive human and JSON checker, fail-closed decision contract, focused tests, CI wiring, and live-remeasurement runbook.
- Verified: 19 focused tests; sanitized-PATH workspace bb 0.35.1 fallback; immutable public SDK/registry/app/theme probes; format/check/test/build with 127 tests.
- Result: Standing and targeted round-two reviews are clean at 5/5 after five P1/P2 findings were regression-tested and fixed.
- Next: Commit OS-629, open its draft PR, and follow hosted CI/review through merge.
- Blockers: Hosted CI and review state remain pending.

2026-08-07 - OS-633 implementation browser-green
- Changed: Added a pinned, isolated Ladle lab with 13 static surface groups, bounded fixture/theme/viewport controls, catalog-backed fixture adapters, edge states, documentation, and completeness tests.
- Verified: 5 focused tests across every fixture; Ladle static build and 13-entry `meta.json`; browser navigation, linkable fixture controls, host-action contract rendering, and realistic thread-list replacement.
- Result: The lab runs without bb, Connect, plugin execution, sibling imports, secrets, or inspection middleware; content-script fixtures remain unmounted.
- Next: Run aggregate gates, standing/targeted review, and the hosted PR loop.
- Blockers: None.

2026-08-07 - OS-633 correction loop review-clean
- Changed: Made host-action context/outcomes visible, made compact thread-list controls change the bounded shell, added visible environment/branch context, and expanded the forbidden-dependency guard across the complete story/provider boundary.
- Verified: 9 focused tests with 294 assertions; standing and targeted final reviews both 5/5; final aggregate format/check/test/build with 135 tests; both workbench and Ladle outputs present with 13 metadata entries.
- Result: All standing P1/P2 and targeted P1/P2/P3 findings are resolved and regression-tested.
- Next: Commit OS-633 and complete the hosted PR/merge/main-CI/Linear loop.
- Blockers: None.

2026-08-07 - OS-633 landed and OS-634 implementation focused-green
- Changed: Landed OS-633 in PR #7, then added reload-stable launcher state, allowlisted multi-plugin selection, bounded theme/viewport controls, exact mode prerequisites, and explicit copy-only CLI handoffs for OS-634.
- Verified: OS-633 main CI 31218687904 green; OS-634 focused URL, server-selection, overlay/action, and CLI tests plus workbench/CLI type checks.
- Result: Browser query values cannot become filesystem paths or native commands; build/live remain explicit terminal actions with inherited native output, and Harness remains capability-gated.
- Next: Complete aggregate verification, browser QA, review, and the hosted OS-634 loop.
- Blockers: None.

2026-08-07 - OS-634 review correction pass focused-green
- Changed: Split low-level Harness contract resolution from launcher availability; replaced false Live fixture rendering with a native handoff canvas; made plugin select values collision-free; recovered stale plugin links through the server allowlist; and redacted missing-target, symlink-realpath, provenance, and incidental native paths.
- Verified: 53 workbench tests now cover overlay keyboard/control interactions, single-entry history writes, stale async response suppression, stale allowlisted selection recovery, reserved-looking plugin keys, mode honesty, Live non-embedding, and path redaction. Workbench type-check is green.
- Result: All standing and targeted round-one P1/P2 findings have an implemented regression path; aggregate/browser/review rechecks remain.
- Next: Run aggregate gates and browser smoke, then request standing and fresh targeted round-two review.
- Blockers: None.

2026-08-07 - OS-634 correction pass aggregate and browser green
- Changed: Added a deterministic ignored Live-ready workspace only for browser QA; it does not alter product code or normal bb state.
- Verified: CI-equivalent format/check/test/build is green with 167 total tests; compatibility probes and workbench, plugin, and 13-story Ladle builds pass. Browser QA proved stale-link canonicalization, one history entry per interaction with Back/Forward restoration, Live handoff-only rendering with zero iframes/Connect requests, browser-session path redaction, 320x568 scrolling, and minimize/Escape focus return.
- Result: Every round-one standing and targeted finding has automated regression coverage plus runtime evidence where visual or focus behavior matters.
- Next: Standing and fresh targeted round-two review, then hosted PR/CI/review/merge/main-CI/Linear closeout.
- Blockers: None.

2026-08-07 - OS-634 round-two review clean
- Changed: Replaced the assumed global binary with the repo-proven `bun run bb-mate` handoff, withheld cross-workspace commands rather than serializing reconstructable directory hierarchy, and extended native-output redaction to punctuation-adjacent paths, file URLs, and UNC paths while preserving HTTPS URLs.
- Verified: Standing and fresh targeted round-two reviews are both 5/5 with no open P0-P3 findings. The final post-review aggregate passes 167 tests plus format, type, compatibility, plugin, workbench, and 13-story Ladle build gates.
- Result: All round-one and round-two findings are fixed and regression-tested; the branch is ready for the hosted PR loop.
- Next: Commit, create draft PR, verify hosted CI/review threads, mark ready, merge, verify main CI, and move OS-634 to Done.
- Blockers: None.

2026-08-07 - OS-634 landed and OS-632 started
- Changed: Merged OS-634 in PR #8 and reconciled the GitButler workspace before opening the Linear-recommended OS-632 branch and plan.
- Verified: PR #8 CI and GitGuardian green with no review threads; merge commit f14afd3; post-merge main CI 31222879164 green; clean lane-free workspace; OS-634 Linear Done.
- Result: The completed launcher is now the stable baseline for the bounded visual/accessibility matrix.
- Next: Add deterministic Playwright/axe coverage, checked-in baselines, measured geometry, and the explicit live-comparison/update workflow for OS-632.
- Blockers: None.

2026-08-07 - OS-632 implementation aggregate-green
- Changed: Added exact Playwright/axe dependencies, a bounded four-fixture plus open/minimized Mate screenshot matrix, platform baselines, zero-violation axe gates, keyboard/focus and reduced-motion checks, measured sidebar/composer geometry, explicit update commands, CI diff artifacts, and a manual Live-bb comparison runbook. Corrected the composer placeholder contrast defect axe exposed.
- Verified: 14/14 browser tests pass on macOS and in `mcr.microsoft.com/playwright:v1.62.1-noble`; Linux baselines generated and re-verified without update mode. A temporary 22% pixel drift failed with named actual/expected/diff artifacts, then was removed. Final aggregate check/167 unit tests/build/14 browser tests/diff check is green; documentation formatting is rerun after each evidence update.
- Result: Normal PR CI now catches bounded visual drift and serious accessibility regressions without authenticated host access, while exactness claims remain Fixture-only.
- Next: Run standing and fresh targeted reviews, fix findings, then complete the hosted PR/merge/main-CI/Linear loop.
- Blockers: None.

2026-08-07 - OS-632 round-one review corrections
- Changed: Expanded zero-violation axe coverage to every visual state and the portaled Mate panel; traversed multiple labeled/focus-visible controls; corrected dark shell, fixture label, and Mate status contrast; replaced ambient inspection screenshots with a deterministic component harness; and disabled local server reuse.
- Verified: All eight accessibility tests pass after reproducing the reviewer contrast and portal gaps. A deliberate occupied-port probe now fails immediately instead of accepting a stale server. Updated macOS and Linux baselines both pass the complete 14-test matrix.
- Result: All three standing and all three targeted round-one P1/P2 findings have implemented regression paths; round-two review remains.
- Next: Final aggregate and Linux no-update proof, then standing and targeted round-two review.
- Blockers: None.

2026-08-07 - OS-632 local and review gates complete
- Changed: Closed all six round-one findings with explicit regression paths and sent the final snapshot through standing and fresh targeted round-two review.
- Verified: Both reviewers scored the final tree 5/5 with no open P0-P3 findings. The pinned Linux container passed 14/14 without updating baselines; macOS and independent reviewer browser runs passed 14/14; the final format/check/167-unit-test/build/browser/diff aggregate is green. The standing reviewer independently confirmed a valid occupied port is rejected before an isolated 14/14 rerun.
- Result: OS-632 is ready for its draft PR and hosted CI/review loop.
- Next: Commit, create the draft PR, verify hosted checks and threads, mark ready, merge, verify main CI, and move OS-632 to Done.
- Blockers: None.

2026-08-07 - OS-632 hosted runner drift exposed
- Changed: Split the visual gate into the exact pinned Playwright container already used for Linux baseline generation; the ordinary verification job retains the full workspace install, checks, tests, and build.
- Verified: Hosted run 31225221650 passed every nonvisual gate, then correctly failed three screenshots at stable one-percent text-layout differences on the ambient GitHub runner. Uploaded expected/actual/diff artifacts showed Linux font-metric wrapping rather than a product-state change; the same baselines pass 14/14 in the pinned image.
- Result: CI now compares against the environment that owns the Linux baselines instead of weakening pixel tolerances or accepting runner-specific reflows.
- Next: Amend the PR snapshot, rerun both hosted jobs, and recheck reviews before readiness.
- Blockers: None.
```

## Preparation Audits

- OS-629: independent branch; one target data file plus deterministic public
  probes/tests; avoid Ladle, overlay, CSS, catalog, lockfile, and CI edits.
- OS-633/634/632: use one incremental chain because package, fixtures, overlay,
  styles, lockfile, and CI overlap. Ladle/Playwright/axe are not yet installed.
- OS-635/636/637/638: local artifact is achievable after the lab stabilizes;
  clean-room no-bb lane is mandatory; real native mutation is not authorized;
  OS-638 stops at its approval surface.

## Review Log

| Milestone | Reviewer           | Report                                     | Score      | Verdict           | Open P0-P2 | Notes                                                |
| --------- | ------------------ | ------------------------------------------ | ---------- | ----------------- | ---------- | ---------------------------------------------------- |
| prep      | OS-629 audit       | agent transcript                           | not scored | complete          | 0          | Independent public drift check                       |
| prep      | surface audit      | agent transcript                           | not scored | complete          | 0          | Incremental 633/634/632 chain                        |
| prep      | distribution audit | agent transcript                           | not scored | complete          | 0          | Local candidate and stop rules                       |
| prep      | packet alignment   | agent transcript                           | not scored | clean             | 0          | Three P2s fixed; recheck clean                       |
| 1         | OS-629 standing    | `tmp/reviews/standing/os-629-round-1.json` | 3/5        | changes requested | 3          | Target validation, decision durability, split errors |
| 1         | OS-629 targeted    | `tmp/reviews/targeted-os629/round-1.json`  | 2/5        | changes requested | 2          | Decision and release-ref coherence                   |
| 2         | OS-629 standing    | `tmp/reviews/standing/os-629-round-2.json` | 5/5        | clean             | 0          | All standing and targeted gaps fixed                 |
| 2         | OS-629 targeted    | `tmp/reviews/targeted-os629/round-2.json`  | 5/5        | clean             | 0          | Negative probes and full gate pass                   |
| 1         | OS-633 standing    | `tmp/reviews/standing/os-633-round-1.json` | 3/5        | changes requested | 2          | Sidebar scenario and viewport gaps                   |
| 1         | OS-633 targeted    | `tmp/reviews/targeted-os633/round-1.json`  | 3/5        | changes requested | 2          | Host-action evidence and inert viewport              |
| 2         | OS-633 targeted    | `tmp/reviews/targeted-os633/round-2.json`  | 4/5        | changes requested | 0          | One reasonable P3 isolation-test gap                 |
| 2         | OS-633 standing    | `tmp/reviews/standing/os-633-round-2.json` | 5/5        | clean             | 0          | All standing and targeted gaps fixed                 |
| 3         | OS-633 targeted    | `tmp/reviews/targeted-os633/round-3.json`  | 5/5        | clean             | 0          | Full boundary and correction recheck                 |
| 1         | OS-634 standing    | `tmp/reviews/standing/os-634-round-1.json` | 2/5        | changes requested | 4          | Mode honesty, sentinel, redaction, interactions      |
| 1         | OS-634 targeted    | `tmp/reviews/targeted-os634/round-1.json`  | 2/5        | changes requested | 5          | Stale links, Live truth, redaction, test gaps        |
| 2         | OS-634 standing    | `tmp/reviews/standing/os-634-round-2.json` | 5/5        | clean             | 0          | All findings plus final handoff/privacy recheck      |
| 2         | OS-634 targeted    | `tmp/reviews/targeted-os634/round-2.json`  | 5/5        | clean             | 0          | Acceptance matrix and full final-tree verification   |
| 1         | OS-632 standing    | `tmp/reviews/standing/os-632-round-1.json` | 2/5        | changes requested | 3          | Ambient Mate state, portal/traversal, stale servers  |
| 1         | OS-632 targeted    | `tmp/reviews/targeted-os632/round-1.json`  | 2/5        | changes requested | 3          | Matrix/panel axe gaps and shallow traversal          |
| 2         | OS-632 standing    | `tmp/reviews/standing/os-632-round-2.json` | 5/5        | clean             | 0          | Determinism, portal/traversal, stale-port recheck    |
| 2         | OS-632 targeted    | `tmp/reviews/targeted-os632/round-2.json`  | 5/5        | clean             | 0          | Full matrix, portal, and keyboard recheck            |
| 3         | OS-632 standing    | `tmp/reviews/standing/os-632-round-3.json` | 5/5        | clean             | 0          | Pinned CI container and 14-test shape recheck        |
| 3         | OS-632 targeted    | `tmp/reviews/targeted-os632/round-3.json`  | 5/5        | clean             | 0          | Coverage, script boundary, and workflow recheck      |

## Verification Log

| Check                                                                           | Scope                | Result               | Notes                                                      |
| ------------------------------------------------------------------------------- | -------------------- | -------------------- | ---------------------------------------------------------- |
| `but status --json`                                                             | baseline             | pass                 | no uncommitted files, stacks, or branches                  |
| Main CI run 31206636916                                                         | baseline             | pass                 | green at `a637aa0`                                         |
| `bb --version`                                                                  | native capability    | pass                 | 0.35.1                                                     |
| `npm view @bb/plugin-sdk version --json`                                        | Harness capability   | expected unavailable | npm E404; no fallback allowed                              |
| `check-goal-prompt --no-placeholders`                                           | packet               | pass                 | 3,604/4,000; no placeholders                               |
| `goal-loop-doctor`                                                              | packet               | pass                 | required files and sections ready                          |
| `bun test scripts/compatibility-check.test.ts`                                  | OS-629               | pass                 | 19 tests; all drift families and fail-closed paths         |
| Sanitized-PATH `bun run compatibility:check`                                    | OS-629 clean CI      | pass                 | workspace-pinned bb-app 0.35.1 fallback                    |
| `bun run compatibility:check`                                                   | OS-629 public probes | pass                 | 18 target/version/registry/dependency/token/catalog checks |
| `bun run format:check && bun run check && bun run test && bun run build`        | OS-629               | pass                 | 127 tests and all builds green                             |
| `bun test apps/workbench/src/surface-lab/surface-lab.test.tsx`                  | OS-633 focused       | pass                 | 5 tests; 13 stories and every fixture rendered             |
| `bun --filter @bb-mate/workbench stories:build`                                 | OS-633 static lab    | pass                 | 13-entry metadata and portable static assets               |
| Local Ladle browser smoke                                                       | OS-633 runtime       | pass                 | discovery, controls, host contract, sidebar replacement    |
| `bun run format:check && bun run check && bun run test && bun run build`        | OS-633 final         | pass                 | 135 tests; workbench and 13-story Ladle outputs green      |
| `bun --filter @bb-mate/workbench check && bun --filter @bb-mate/workbench test` | OS-634 corrections   | pass                 | 53 tests; 518 assertions across 12 files                   |
| `bun run format:check && bun run check && bun run test && bun run build`        | OS-634 candidate     | pass                 | 167 tests; all compatibility and build gates green         |
| Local workbench browser smoke                                                   | OS-634 runtime       | pass                 | stale recovery, history, Live truth, redaction, focus      |
| macOS Playwright/axe matrix (14 tests)                                          | OS-632 browser       | pass                 | four fixture states, Mate open/FAB, a11y, geometry         |
| Pinned Playwright 1.62.1 Linux container (14 tests)                             | OS-632 CI parity     | pass                 | checked-in Linux baselines re-verified without updates     |
| Intentional 22% pixel drift                                                     | OS-632 diff proof    | expected failure     | named actual, expected, diff, trace artifacts emitted      |
| `bun run format:check && bun run check && bun run test && bun run build`        | OS-632 candidate     | pass                 | 167 unit tests; workbench/plugin/Ladle builds green        |
| Standing isolated Playwright/axe rerun (14 tests)                               | OS-632 final review  | pass                 | 15.6 seconds after occupied-port refusal proof             |
| Hosted CI 31225221650                                                           | OS-632 runner probe  | expected failure     | three stable one-percent Linux font-metric diffs uploaded  |
| CI-shaped pinned container without host IPC (14 tests)                          | OS-632 CI correction | pass                 | standing reviewer independently passed in 14.2 seconds     |

## Prompt / Goal Alignment

- Checked by: coordinator.
- Result: pass; the goal-loop doctor accepts the packet.
- Missing from prompt: none.
- Fixes made: condensed the direct-start prompt and added the required
  Boundary, Verification, Review, Next Move, Stop Rules, and Persistence
  resume surfaces.

## Tracker / PR Log

| Item   | State       | Notes                                                  |
| ------ | ----------- | ------------------------------------------------------ |
| OS-627 | In Progress | Parent epic                                            |
| OS-629 | Done        | PR #6 merged at `7f364f1`; main CI 31216658339 green   |
| OS-633 | Done        | PR #7 merged at `7e11d89`; main CI 31218687904 green   |
| OS-634 | Done        | PR #8 merged at `f14afd3`; main CI 31222879164 green   |
| OS-632 | In Progress | Deterministic visual and accessibility regression      |
| OS-635 | Todo        | Blocked by OS-633                                      |
| OS-636 | Todo        | Unblocked; finalized after artifact commands stabilize |
| OS-637 | Todo        | Blocked by OS-632/634/635/636                          |
| OS-638 | Todo        | Blocked by OS-629/637; final ready PR only             |

## Follow-Ups

- OS-639 through OS-644 remain Backlog and `upstream-dependent`.
- A public license, npm publication, visibility change, and announcement require
  separate owner decisions after the local candidate review.

## Final State

Pending execution.
