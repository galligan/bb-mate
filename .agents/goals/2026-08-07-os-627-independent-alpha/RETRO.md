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

2026-08-07 - OS-632 pinned-container bootstrap correction
- Changed: Added the sole missing image prerequisite, `unzip`, before the pinned Bun setup action in the visual container and documented that boundary.
- Verified: Hosted run 31225715348 reached the new visual job and failed before install/tests only because setup-bun could not find `unzip`; the parallel normal verification job continued independently. Workflow behavior remained fail-closed and uploaded no misleading screenshot diffs.
- Result: The next hosted run can execute the already-reviewed exact-image test shape without changing visual acceptance thresholds or baselines.
- Next: Lint, review, commit, push, and follow both hosted jobs to green.
- Blockers: None.

2026-08-07 - OS-632 landed and OS-635 started
- Changed: Merged OS-632 in PR #9, reconciled its GitButler lane, moved Linear to Done, and opened the recommended OS-635 branch and plan from clean main.
- Verified: PR run 31225976689 and post-merge main run 31226118637 both passed the full verify and pinned visual jobs; merge commit 9f2aa0c; no review threads; clean lane-free workspace.
- Result: Deterministic visual/accessibility coverage is now the packaging baseline.
- Next: Build and prove the private versioned local artifact without publishing.
- Blockers: None.

2026-08-07 - OS-635 package walking skeleton green
- Changed: Defined a staged private package manifest without workspace dependencies; bundled the Bun CLI; packaged the 13-story lab; added a loopback-only, path/symlink-confined GET/HEAD server; isolated clean-room state; added third-party notices and local package docs.
- Verified: 32 CLI/server tests pass. The lifecycle test performs two complete builds plus a staging repack under an isolated exact-tool PATH, requires byte-identical output, checks the 40-file allowlist and path/source/symlink boundaries, installs under isolated HOME/XDG/npm/Bun state, runs help and expected-nonzero missing-bb inspection, proves the entrypoint stayed inert, serves all 13 stories with bb/Connect/SDK unavailable, and verifies uninstall package/manifest/root-lock/hidden-lock residue. The generated license payload covers direct runtimes, their closures, the complete Ladle static-client import set, and embedded notices. Current SHA-256: 6e8b25d89345c2e68908131eb2d8f9e4cb31ab12be1b238447f3f8f9e64afc13.
- Result: The installed artifact works outside the source checkout with no sibling bb, workspace link, plugin package, or publication side effect.
- Next: Run aggregate gates, standing and fresh targeted implementation review, then the hosted PR loop.
- Blockers: None.

2026-08-07 - OS-635 hosted Linux tool closure corrected
- Changed: Added the exact `gzip` executable to the clean-room PATH alongside `tar`; GNU tar delegates gzip decompression to that binary on the hosted Linux runner.
- Verified: Hosted run 31228900314 proved the missing-tool failure after visual passed. The corrected snapshot passes `bun run package:test` and the complete format/check/test/build/diff gate locally with the artifact hash and 40-file allowlist unchanged.
- Result: The package test now declares the complete external tool closure it actually needs on both macOS and Linux.
- Next: Re-run standing and targeted review on the changed snapshot, amend the PR, and follow hosted CI to green.
- Blockers: None.

2026-08-07 - OS-635 landed and OS-636 started
- Changed: Corrected the Linux clean-room tool closure, merged OS-635 in PR #10, reconciled its GitButler lane, moved Linear to Done, and opened the recommended OS-636 documentation branch from clean main.
- Verified: Corrected PR run 31229243221 and post-merge main run 31229355120 both passed verify and visual; GitGuardian passed; merge commit 544d9b1; no review threads; clean lane-free workspace.
- Result: The private local artifact is now the verified baseline for the external author guide, trust model, and support policy.
- Next: Verify every documented command from a clean checkout or installed artifact, then complete security and targeted documentation review.
- Blockers: A public license choice remains an explicit owner decision and is not authorized by this goal; the docs must make the private `UNLICENSED` boundary and pre-public-release gate explicit.

2026-08-07 - OS-636 external guide candidate and clean-checkout correction
- Changed: Added the five-minute Fixture path, external author guide, full-trust operation matrix, CONTRIBUTING, SECURITY, and support/deprecation/license policies. During clean-checkout verification, fixed Ladle's default cwd-derived application ID by overriding it with the stable `bb-mate-surface-lab-v1` ID and added an artifact assertion for that boundary.
- Verified: A fresh archive of commit fa6fd86 installed with the frozen lockfile, served the documented loopback story URL, exposed the expected story in `meta.json`, and stopped cleanly. Before the fix, the source and fresh checkout each built internally stable archives but differed because Ladle embedded a hash of `process.cwd()`. With the stable ID, both independent checkout paths produce the same 40-file, 13-story SHA-256 `545ae6a9d4e30caf2b6099b90f087ad1e026b5e089b2cb13cbb7ea8534d5b359`.
- Result: The documented clean-checkout package path is now byte-reproducible across checkout roots, not only across repeated builds in one directory.
- Next: Run the exact committed clean-checkout aggregate, browser gate, standing security review, and fresh targeted author-doc review.
- Blockers: None inside the private-alpha scope; the public license remains an explicit owner gate.

2026-08-07 - OS-636 committed clean-checkout gates green
- Changed: Committed the documentation candidate and checkout-independent lab correction, then exported commit 58d72ef into a new directory with no Git metadata or pre-existing dependencies.
- Verified: The fresh export passed frozen install, format, type/compatibility checks, all 172 tests, the 40-file/13-story package lifecycle at SHA `545ae6a…b359`, every build, all 14 Playwright/axe checks, and all 21 local Markdown link targets. The final `git diff --check` invocation was inapplicable inside the Git-less archive and returned Git usage after every repository gate had passed; the source workspace diff check is green.
- Result: Every documented non-mutating path is backed by a clean source or isolated artifact execution. Native build/install/dev handoffs remain exact-argv tested and deliberately unexecuted because this goal forbids normal native-state mutation.
- Next: Fix standing and targeted review findings, then complete the hosted PR loop.
- Blockers: None.

2026-08-07 - OS-636 round-one review corrections
- Changed: Corrected the source-workbench session-endpoint disclosure, exact bb/Bun and Linux-runner support envelope, non-Linear author intake, artifact Control-C lifecycle, and aggregate plugin-script execution disclosure.
- Verified: Standing and targeted round one each scored 3/5. All four targeted findings and both standing findings now have direct documentation corrections; the stable package implementation was independently verified by both reviewers.
- Result: External authors can distinguish source passive HTTP inspection from the packaged static lab, identify exact verified versions/environments, reach support without private tracker access, and understand that root gates execute plugin-owned code.
- Next: Run focused documentation checks and standing/fresh-targeted round-two review.
- Blockers: None.

2026-08-07 - OS-636 final review and aggregate green
- Changed: Closed every standing and external-author review finding by documenting the source inspection endpoint, exact support envelope, private GitHub intake, foreground-server cleanup order, and aggregate plugin-script execution boundary.
- Verified: Both second-round reviewers approved at 5/5 with no P0-P3 findings. The current tree passed format, compatibility/type checks, all 172 tests, every build, all 14 Playwright/axe checks, and `git diff --check`; the clean-room package contains 40 files and 13 stories at SHA-256 `b8b2f756215c01413f110cc2a31d85484fa243a2d019676aa2141d834d3c2479`.
- Review: Standing `tmp/reviews/standing/os-636-round-2.json`; targeted `tmp/reviews/targeted-os636/round-2.json`.
- Next: Commit the approved corrections, open the draft PR, follow hosted CI and review threads, then land and reconcile OS-636 before starting OS-637.
- Blockers: None.

2026-08-07 - OS-636 landed and OS-637 started
- Changed: Promoted and merged PR #11, reconciled GitButler to a clean lane-free main, closed OS-636, and opened the Linear-recommended OS-637 branch.
- Verified: PR CI 31230755681 and post-merge main CI 31230856034 both passed verify and visual; GitGuardian passed; PR #11 had no reviews, inline comments, or unresolved review threads.
- Result: OS-636 is Done at merge commit `b2d5c203e7ee2f69314a5babbe2097260c87a4d0`. OS-637 is unblocked and scoped to disposable clean-room state only.
- Next: Execute the external-author trial from a fresh temporary profile, fix all P0/P1 friction, and rerun before review.
- Blockers: None inside the private-alpha scope.

2026-08-07 - OS-637 clean-room trial found and fixed native re-exec loop
- Changed: Ran the source, packaged, browser, compatibility, native build, and guarded Live journey from disposable state. Added an explicit environment boundary so BB Mate consumes `BB_CLI` without forwarding bb's own re-exec selector into the resolved child.
- Verified: Before the fix, all four native probes timed out at five seconds while the same bb 0.35.1 executable succeeded directly. After the fix, the isolated native host reported bb 0.35.1 and unpaired Connect, `check` built server/app metadata at SDK 0.4.1, and `live` refused the uninstalled plugin with the exact path-install handoff.
- Result: Trial finding F-1 (P1) is fixed with focused tests for selector removal and captured-child environment preservation. All 13 surfaces, ownership classifications, inert content-script behavior, and Vite HMR were verified in Chrome.
- Next: Commit the correction and report, rerun the entire journey from a new clean archive, then complete standing and targeted review.
- Blockers: None; Harness remains expected upstream-dependent.

2026-08-07 - OS-637 independent scratch rerun green
- Changed: Exported committed candidate e9b0f60 into a second Git-less source root with new profile, install prefix, plugin, bb data, ports, and browser servers. Repeated every source, artifact, compatibility, native, Live, and cleanup step without reusing first-run state.
- Verified: Frozen install completed in 11.8 seconds; Chrome discovered all 13 stories, ownership classes, inert content-script behavior, and fixture HMR. The artifact reproduced SHA-256 `fc99a5161ad0890706d03306de32248174aa3ead67b3daf334932f6868214a07`; isolated bb 0.35.1 inspection and check passed; Live refused the uninstalled path with the exact handoff; packaged preview and uninstall passed.
- Result: The F-1 P1 correction survives a true first-run environment. No P0/P1 finding remains, no plugin was installed, Connect stayed unpaired, and normal bb/plugin state was not used.
- Next: Run the repository aggregate and standing/fresh-targeted reviews, fix all findings, then open the draft PR.
- Blockers: None inside the private-alpha scope.

2026-08-07 - OS-637 round-one review found a source native-selection regression
- Changed: Standing and fresh targeted reviewers traced the full production runtime and reproduced that the first F-1 correction stripped canonical `BB_CLI` from the non-native source Vite child. Both also found that the durable report did not fully define the isolated native setup; targeted review additionally requested explicit uninstall-residue evidence.
- Verified: Both reviewers scored the branch 2/5 and blocked readiness. Standing reproduced terminal bb 0.35.1 preflight followed by blocked browser inspection with no bb version. Targeted confirmed the aggregate remained green at 174 tests, 40 files, 13 stories, and SHA-256 `fc99a5161ad0890706d03306de32248174aa3ead67b3daf334932f6868214a07`.
- Review: Standing `tmp/reviews/standing/os-637-round-1.json`; targeted `tmp/reviews/targeted-os637/round-1.json`.
- Next: Consume selectors only at native invocations, preserve canonical bb for Vite, commit the complete clean-room runbook and uninstall evidence, rerun isolated source/native paths, and request round two.
- Blockers: OS-637 remains blocked by the open P1 until the corrected production path and reviews pass.

2026-08-07 - OS-637 review corrections and isolated rerun green
- Changed: Moved selector consumption into the shared native invocation boundary, preserved a freshly resolved canonical `BB_CLI` for the source Vite child, added direct source/check/live environment assertions, and committed the complete clean-profile/native runbook plus uninstall-residue evidence.
- Verified: With `BB_CLI_REEXEC=1` deliberately present, terminal preflight and the source `/bb-mate-session.json` both reported isolated bb 0.35.1 and unpaired Connect. Native check rebuilt SDK 0.4.1 metadata; Live refused the uninstalled plugin with the exact handoff; isolated inventory remained eight builtins only. The aggregate passed 175 tests, all builds, all 14 Playwright/axe checks, and produced a 40-file/13-story artifact at SHA-256 `0e5503f371a1ffc57c4f4fc333828f4b40affe146b82c7f2c7980f925c48d00e`.
- Result: Both round-one P1/P2 findings and the targeted P3 are corrected in code, tests, durable procedure, and current runtime evidence. No normal plugin or Connect state was used or changed.
- Next: Commit the corrections and request standing plus fresh-targeted round-two approval.
- Blockers: None pending independent review.

2026-08-07 - OS-637 final standing and targeted review clean
- Changed: Iterated the executable clean-room runbook through literal clean-archive probes: exact GitButler branch provenance, complete empty-shell tool paths, five endpoint assignments, source/package readiness polling, hidden npm lock semantics, and reliable process-tree teardown with TERM grace plus KILL fallback.
- Verified: Standing round three and targeted round four approved exact head `0fefc5535320ae3f0b01398c9520d673e1ca2700` at 5/5 with zero P0-P3 findings. Both reproduced the 13-story Bun/Ladle lane and verified the wrapper/child exited, `wait` settled, and port 61047 closed. All six OS-637 acceptance criteria pass; the unchanged production tree remains green at 175 tests, all builds, 14 Playwright/axe checks, and artifact SHA-256 `0e5503f371a1ffc57c4f4fc333828f4b40affe146b82c7f2c7980f925c48d00e`.
- Review: Standing `tmp/reviews/standing/os-637-round-3.json`; targeted `tmp/reviews/targeted-os637/round-4.json`.
- Next: Open the draft PR, follow hosted CI and all review threads, then ready/land and reconcile Linear.
- Blockers: None.

2026-08-07 - OS-637 landed and OS-638 started
- Changed: Promoted and merged PR #12, reconciled GitButler to clean lane-free main, closed OS-637, and opened the Linear-recommended OS-638 branch at the release-handoff stop boundary.
- Verified: PR CI 31233812475 passed verify, visual, and GitGuardian with no reviews, inline comments, or unresolved threads. Post-merge main CI 31233902043 passed verify and visual at merge commit `c8363d3e80e54371f62b826a0e808268f2317038`.
- Result: Every upstream-independent implementation/trial issue through OS-637 is Done. OS-638 is unblocked and explicitly stops at a green ready but unmerged PR.
- Next: Assemble the traceable version, artifact, compatibility, limitations, lifecycle, copy, and owner-decision handoff; review and verify it without publishing or merging.
- Blockers: Public license, repository visibility, publication, release, and announcement remain owner decisions rather than implementation blockers.
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

| Milestone | Reviewer           | Report                                     | Score      | Verdict           | Open P0-P2 | Notes                                                 |
| --------- | ------------------ | ------------------------------------------ | ---------- | ----------------- | ---------- | ----------------------------------------------------- |
| prep      | OS-629 audit       | agent transcript                           | not scored | complete          | 0          | Independent public drift check                        |
| prep      | surface audit      | agent transcript                           | not scored | complete          | 0          | Incremental 633/634/632 chain                         |
| prep      | distribution audit | agent transcript                           | not scored | complete          | 0          | Local candidate and stop rules                        |
| prep      | packet alignment   | agent transcript                           | not scored | clean             | 0          | Three P2s fixed; recheck clean                        |
| 1         | OS-629 standing    | `tmp/reviews/standing/os-629-round-1.json` | 3/5        | changes requested | 3          | Target validation, decision durability, split errors  |
| 1         | OS-629 targeted    | `tmp/reviews/targeted-os629/round-1.json`  | 2/5        | changes requested | 2          | Decision and release-ref coherence                    |
| 2         | OS-629 standing    | `tmp/reviews/standing/os-629-round-2.json` | 5/5        | clean             | 0          | All standing and targeted gaps fixed                  |
| 2         | OS-629 targeted    | `tmp/reviews/targeted-os629/round-2.json`  | 5/5        | clean             | 0          | Negative probes and full gate pass                    |
| 1         | OS-633 standing    | `tmp/reviews/standing/os-633-round-1.json` | 3/5        | changes requested | 2          | Sidebar scenario and viewport gaps                    |
| 1         | OS-633 targeted    | `tmp/reviews/targeted-os633/round-1.json`  | 3/5        | changes requested | 2          | Host-action evidence and inert viewport               |
| 2         | OS-633 targeted    | `tmp/reviews/targeted-os633/round-2.json`  | 4/5        | changes requested | 0          | One reasonable P3 isolation-test gap                  |
| 2         | OS-633 standing    | `tmp/reviews/standing/os-633-round-2.json` | 5/5        | clean             | 0          | All standing and targeted gaps fixed                  |
| 3         | OS-633 targeted    | `tmp/reviews/targeted-os633/round-3.json`  | 5/5        | clean             | 0          | Full boundary and correction recheck                  |
| 1         | OS-634 standing    | `tmp/reviews/standing/os-634-round-1.json` | 2/5        | changes requested | 4          | Mode honesty, sentinel, redaction, interactions       |
| 1         | OS-634 targeted    | `tmp/reviews/targeted-os634/round-1.json`  | 2/5        | changes requested | 5          | Stale links, Live truth, redaction, test gaps         |
| 2         | OS-634 standing    | `tmp/reviews/standing/os-634-round-2.json` | 5/5        | clean             | 0          | All findings plus final handoff/privacy recheck       |
| 2         | OS-634 targeted    | `tmp/reviews/targeted-os634/round-2.json`  | 5/5        | clean             | 0          | Acceptance matrix and full final-tree verification    |
| 1         | OS-632 standing    | `tmp/reviews/standing/os-632-round-1.json` | 2/5        | changes requested | 3          | Ambient Mate state, portal/traversal, stale servers   |
| 1         | OS-632 targeted    | `tmp/reviews/targeted-os632/round-1.json`  | 2/5        | changes requested | 3          | Matrix/panel axe gaps and shallow traversal           |
| 2         | OS-632 standing    | `tmp/reviews/standing/os-632-round-2.json` | 5/5        | clean             | 0          | Determinism, portal/traversal, stale-port recheck     |
| 2         | OS-632 targeted    | `tmp/reviews/targeted-os632/round-2.json`  | 5/5        | clean             | 0          | Full matrix, portal, and keyboard recheck             |
| 3         | OS-632 standing    | `tmp/reviews/standing/os-632-round-3.json` | 5/5        | clean             | 0          | Pinned CI container and 14-test shape recheck         |
| 3         | OS-632 targeted    | `tmp/reviews/targeted-os632/round-3.json`  | 5/5        | clean             | 0          | Coverage, script boundary, and workflow recheck       |
| 4         | OS-632 standing    | `tmp/reviews/standing/os-632-round-4.json` | 5/5        | clean             | 0          | Fresh-image unzip prerequisite proof                  |
| 4         | OS-632 targeted    | `tmp/reviews/targeted-os632/round-4.json`  | 5/5        | clean             | 0          | Minimal bootstrap and unchanged-policy recheck        |
| 1         | OS-635 standing    | `tmp/reviews/standing/os-635-round-1.json` | 3/5        | changes requested | 3          | Isolation, notices, and failed-bind diagnostics       |
| 1         | OS-635 targeted    | `tmp/reviews/targeted-os635/round-1.json`  | 3/5        | changes requested | 3          | Full-build determinism, notices, uninstall residue    |
| 2         | OS-635 targeted    | `tmp/reviews/targeted-os635/round-2.json`  | 4/5        | changes requested | 1          | Missing Ladle static-client runtime license closure   |
| 3         | OS-635 targeted    | `tmp/reviews/targeted-os635/round-3.json`  | 5/5        | superseded        | 1          | Premature approval missed npm hidden-lock residue     |
| 2         | OS-635 standing    | `tmp/reviews/standing/os-635-round-2.json` | 4/5        | changes requested | 1          | Traversal-form root and hidden npm lock residue       |
| 3         | OS-635 standing    | `tmp/reviews/standing/os-635-round-3.json` | 5/5        | clean             | 0          | Independent npm residue and full final recheck        |
| 4         | OS-635 targeted    | `tmp/reviews/targeted-os635/round-4.json`  | 5/5        | clean             | 0          | Superseding residue reconstruction and final recheck  |
| 4         | OS-635 standing    | `tmp/reviews/standing/os-635-round-4.json` | 5/5        | clean             | 0          | Exact gzip closure and Linux GNU tar control          |
| 5         | OS-635 targeted    | `tmp/reviews/targeted-os635/round-5.json`  | 5/5        | clean             | 0          | Linux portability, isolation, and determinism recheck |
| 1         | OS-636 standing    | `tmp/reviews/standing/os-636-round-1.json` | 3/5        | changes requested | 2          | HTTP trust boundary and support envelope              |
| 1         | OS-636 targeted    | `tmp/reviews/targeted-os636/round-1.json`  | 3/5        | changes requested | 4          | Intake, versions, lifecycle, aggregate execution      |
| 2         | OS-636 standing    | `tmp/reviews/standing/os-636-round-2.json` | 5/5        | clean             | 0          | Trust, support, lifecycle, and script closure         |
| 2         | OS-636 targeted    | `tmp/reviews/targeted-os636/round-2.json`  | 5/5        | clean             | 0          | External-author workflow and artifact closure         |

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
| Hosted CI 31225715348                                                           | OS-632 split jobs    | expected failure     | verify green; visual stopped before tests on missing unzip |
| Fresh pinned-image unzip probe                                                  | OS-632 bootstrap     | pass                 | exact apt step installed `/usr/bin/unzip`                  |
| `bun run package:test`                                                          | OS-635 clean room    | pass                 | two full builds; 40 files; 13 stories; SHA `6e8b25d…fc13`  |
| `bun run format:check && bun run check && bun run test && bun run build`        | OS-635 candidate     | pass                 | 172 tests; package lifecycle and all builds green          |
| macOS Playwright/axe matrix (14 tests)                                          | OS-635 regression    | pass                 | unchanged fixture baselines and accessibility matrix       |
| Hosted CI 31228900314                                                           | OS-635 Linux probe   | expected failure     | visual green; clean-room tar PATH lacked external gzip     |
| Corrected OS-635 aggregate                                                      | OS-635 candidate     | pass                 | explicit gzip tool; artifact SHA unchanged                 |
| Archived clean checkout quickstart                                              | OS-636 source docs   | pass                 | frozen install; story URL and metadata verified            |
| Cross-checkout package comparison                                               | OS-636 reproducible  | pass                 | both roots SHA `545ae6a…b359`; 40 files; 13 stories        |
| Git-less export of 58d72ef format/check/test/build                              | OS-636 clean source  | pass                 | 172 tests; compatibility and both builds green             |
| Git-less export Playwright/axe and link audit                                   | OS-636 clean source  | pass                 | 14 browser checks; 21 Markdown files                       |
| `bun run format:check && bun run check && bun run test && bun run build`        | OS-636 final         | pass                 | 172 tests; package SHA `b8b2f756…c2479`                    |
| macOS Playwright/axe matrix (14 tests)                                          | OS-636 final         | pass                 | unchanged visual and accessibility baselines               |
| Hosted CI 31230755681                                                           | OS-636 PR            | pass                 | verify, visual, and GitGuardian green                      |
| Hosted CI 31230856034                                                           | OS-636 main          | pass                 | post-merge verify and visual green                         |
| OS-637 clean source/browser trial                                               | OS-637 first run     | pass                 | 13 stories; ownership; inert lifecycle; HMR observed       |
| OS-637 native probe before correction                                           | OS-637 first run     | expected failure     | leaked `BB_CLI`; four five-second native timeouts          |
| OS-637 fixed isolated native lane                                               | OS-637 correction    | pass                 | bb 0.35.1; build green; guarded Live handoff               |
| OS-637 second scratch rerun                                                     | OS-637 final trial   | pass                 | new roots; 13 stories; HMR; native build; uninstall        |
| OS-637 standing review round one                                                | OS-637 review        | changes requested    | 2/5; P1 source selector; P2 missing runbook                |
| OS-637 targeted review round one                                                | OS-637 review        | changes requested    | 2/5; same P1/P2 plus P3 uninstall evidence                 |
| OS-637 corrected production source/native rerun                                 | OS-637 correction    | pass                 | browser bb 0.35.1; 175 tests; SHA `0e5503f…d00e`           |
| OS-637 standing review round three                                              | OS-637 final review  | 5/5 clean            | zero P0-P3; literal process-tree shutdown passed           |
| OS-637 targeted review round four                                               | OS-637 final review  | 5/5 clean            | all six acceptance criteria passed                         |

## Prompt / Goal Alignment

- Checked by: coordinator.
- Result: pass; the goal-loop doctor accepts the packet.
- Missing from prompt: none.
- Fixes made: condensed the direct-start prompt and added the required
  Boundary, Verification, Review, Next Move, Stop Rules, and Persistence
  resume surfaces.

## Tracker / PR Log

| Item   | State       | Notes                                                 |
| ------ | ----------- | ----------------------------------------------------- |
| OS-627 | In Progress | Parent epic                                           |
| OS-629 | Done        | PR #6 merged at `7f364f1`; main CI 31216658339 green  |
| OS-633 | Done        | PR #7 merged at `7e11d89`; main CI 31218687904 green  |
| OS-634 | Done        | PR #8 merged at `f14afd3`; main CI 31222879164 green  |
| OS-632 | Done        | PR #9 merged at `9f2aa0c`; main CI 31226118637 green  |
| OS-635 | Done        | PR #10 merged at `544d9b1`; main CI 31229355120 green |
| OS-636 | Done        | PR #11 merged at `b2d5c20`; main CI 31230856034 green |
| OS-637 | In Progress | Clean-room external-author trial                      |
| OS-638 | Todo        | Blocked by OS-629/637; final ready PR only            |

## Follow-Ups

- OS-639 through OS-644 remain Backlog and `upstream-dependent`.
- A public license, npm publication, visibility change, and announcement require
  separate owner decisions after the local candidate review.

## Final State

Pending execution.
