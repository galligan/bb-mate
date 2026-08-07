/goal From `/Users/mg/Developer/bb/bb-mate`, execute `.agents/goals/2026-08-07-os-627-first-wave` to `ready-pr`.

## Read First

- Repo guidance, active plan, and packet `SPEC.md`, `GOAL.md`, `REFS.md`
- Live Linear OS-627/628/630/631 and `but status`

## Objective

Bring OS-628/630/631 to green, ready PRs without landing or upstream substitutes.

## Authority

- Commit, push, open drafts, mark ready after gates, and update Linear through In Review.
- Never merge/land/publish/release, edit `../bb`, or mutate visibility, live plugins, settings, secrets, or Connect.

## Boundary

- In: three issues, tests/docs/help, evidence, PR/review/CI/Linear follow-through.
- Out: other OS-627 work, live mutations, unpublished Harness implementation.
- Preserve `.agents/notes/2026-08-07/handoff-202608071030-223a1ed0.md` as user-owned dirt.

## Sequence

1. OS-628: extract passive inspection; add versioned JSON/human reports, actionable checks, native evidence, engines, provenance, trust, and separate mode claims.
2. OS-630 stacked on OS-628: add `bb-mate` discovery, inspect, explicit host/port workbench launch, native build checking, and live handoff. Spawn without a shell; preserve cwd/output/signals/exit; never install implicitly or mutate Connect.
3. OS-631 from main: add a typed 13-group browser catalog, move sidebar scenarios into thread-list, and fail declaration coverage on unknown/stale groups.
4. Reconcile PRs, reviews, CI, and Linear; stop before landing.

## Loop

Per issue: define success; implement its slice; run narrow checks then `bun run format:check`, `bun run check`, `bun run test`, `bun run build`; use standing plus targeted reviews; fix P0-P2/reasonable P3s; open a GitButler draft; wait for green CI/resolved threads; mark ready; record evidence.

## Hard Rules

- Native bb owns lifecycle/runtime. BB Mate discovers, inspects, fixtures, orchestrates, and hands off.
- Passive discovery never imports plugin code. Harness resolves only official selected-plugin testing subpaths; never copy/import from `../bb`.
- Fixture is approximate, Harness behavioral, Live bb visual authority; host actions are outcomes, not replica chrome.
- OS-631 catalog data stays out of OS-628 schemas. Workbench and CLI share one inspection core.

## Verification

- OS-628: schema/report, engine/native-error/provenance/trust/mode/formatter/Vite fixtures.
- OS-630: parser/discovery/process/orchestration tests with fake executables; no real lifecycle mutation.
- OS-631: catalog invariants, sidebar migration, exact selected-plugin declaration coverage.
- All: aggregate Bun commands, green PR CI, resolved threads.

## Review

- Reuse one standing reviewer across the goal and one targeted reviewer per issue fix loop.
- Reach zero open P0-P2; record residual P3s. Finish with standing plus fresh full-stack review.

## Evidence Contract

- Update `RETRO.md` with commands/results, review reports/scores/dispositions, branch/PR refs, CI URLs, thread counts, Linear state, amendments, and forbidden-action audit.
- Final proof names three ready PRs and confirms none landed.

## Stop Rules

- Stop for actions outside authority, unisolatable user dirt, persistent access failure, or a contract requiring private/upstream-dependent code.
- After three failures on one path, change approach and record evidence.

## Definition Of Done

- Three open ready PRs: OS-628→OS-630 stack plus independent OS-631; green CI; resolved threads; zero open local P0-P2.
- Focused/aggregate checks pass; Linear shows dependency/In Review; `RETRO.md` has current proof.

## Not Done

- Local-only work, drafts, pending CI/review, missing scope, private SDK fallbacks, or merged/landed code.

## Next Move

- Narrow failures, fix the owning branch, re-review, broaden. Amend `GOAL.md` and `RETRO.md` without weakening horizon/authority/gates.

## Persistence

- Use state-change heartbeats. Resume from `GOAL.md`, `RETRO.md`, `but status`, Linear, PRs.

Continue until done unless a stop rule fires.
