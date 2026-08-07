# Goal Execution Contract: OS-627 first independent feature wave

Date: 2026-08-07
Status: Ready
Spec: `.agents/goals/2026-08-07-os-627-first-wave/SPEC.md`
Prompt: `.agents/goals/2026-08-07-os-627-first-wave/PROMPT.md`
Retro: `.agents/goals/2026-08-07-os-627-first-wave/RETRO.md`
Refs: `.agents/goals/2026-08-07-os-627-first-wave/REFS.md`

## Completion Horizon

`ready-pr`

Complete when:

- OS-628, OS-630, and OS-631 each have an open ready PR with the intended base,
  green PR CI, resolved review threads, no open local-review P0-P2 findings,
  and Linear in the matching review state.
- Focused checks and `bun run format:check`, `bun run check`, `bun run test`,
  and `bun run build` pass on the relevant branches/stack.
- `RETRO.md` contains current source-control, tracker, verification, review,
  waiting-state, and forbidden-action evidence.

Not complete when:

- Work exists only locally, any PR remains draft, CI/review is pending, one
  issue is missing, or the stack/base relationship is wrong.
- A fixture is described as exact host rendering, Harness uses a copied or
  sibling-checkout fallback, or lifecycle behavior is reimplemented.
- The preserved handoff note is claimed, modified, or accidentally committed.

## Authority

- May commit: yes, only files required by OS-628, OS-630, OS-631, the active
  plan, and this goal packet.
- May push: yes, only named issue branches after focused and aggregate checks.
- May open PR: yes, as drafts first using GitButler.
- May mark ready: yes, only after local review and PR CI are green.
- May merge: no.
- May publish/release: no.
- May mutate Linear: yes, for the discovered dependency, phase comments, and
  issue state through In Review; not Done before merge.
- Needs user approval for: merge/land, publish/release, visibility changes,
  announcements, upstream edits, live plugin install/remove/reload/dev, secret
  or settings changes, and Connect exposure/configuration.

## Boundary

- In scope: OS-628, OS-630, OS-631; their tests/docs/help; goal evidence.
- Out of scope: other OS-627 sub-issues and all upstream-dependent work.
- Do not touch: `/Users/mg/Developer/bb/bb`, live plugin state, secrets,
  Connect configuration, or the preserved uncommitted handoff note.

## Topology

Coordinator with bounded read-only workers and centralized writes. OS-628 is
the base branch for stacked OS-630; OS-631 is independent from main. Standing
and targeted review lanes are reused through their respective fix loops.

## Steps

1. Shared compatibility core and report (OS-628)
   - Outcome: a Node-only shared inspection package, versioned check report,
     formatter, Vite adapter, and fixture-based tests.
   - Scope: passive manifests/artifacts/native state, engines, provenance,
     trust disclosure, and separate mode capabilities.
   - Gate: targeted tests, workbench compatibility, standing plus targeted
     review, aggregate checks, draft PR, then green PR CI.

2. Native-loop CLI (OS-630)
   - Outcome: a thin `bb-mate` CLI that consumes OS-628 and delegates to native
     bb without mutating Connect or implicitly installing plugins.
   - Scope: parser/help, target selection, process adapter, workbench launch,
     inspect/check/live orchestration, fake-binary tests.
   - Gate: stacked on OS-628; exact process/exit tests, standing plus targeted
     review, aggregate checks, draft PR, then green PR CI.

3. Public UI surface catalog (OS-631)
   - Outcome: a browser-safe typed 13-group catalog, catalog-derived sidebar
     scenarios, and Bun-only public-declaration coverage check.
   - Scope: registration/ownership/trust/mode/fixture/interaction contracts;
     no full launcher or Ladle stories.
   - Gate: independent branch; catalog/declaration tests, standing plus
     targeted review, aggregate checks, draft PR, then green PR CI.

4. Full-goal readiness
   - Outcome: correct branch/PR topology, current Linear, resolved reviews,
     green CI, and final evidence against the `ready-pr` horizon.
   - Scope: reconciliation and proof only; no landing.
   - Gate: standing reviewer plus fresh full-stack reviewer, zero open P0-P2,
     all PRs ready and green.

## Reviews

- Standing reviewer: continuity, shared contracts, stack correctness, prior
  finding follow-up, and final full-goal judgment.
- Targeted reviewer: one fresh reviewer per issue/risk surface, reused for that
  issue's fix loop.
- Fix all P0-P2 and reasonable P3 findings. Accepted residual P3s require a
  recorded disposition. Reports live under this packet's ignored `tmp/` path.

## Evidence Contract

- Record commands/results, report paths/scores, finding dispositions, branch
  and PR refs, CI URLs/states, unresolved-thread counts, Linear states/comments,
  and the forbidden-action audit in `RETRO.md`.
- Final transcript must prove all three PRs satisfy `ready-pr` and explicitly
  state that none were merged or landed.

## Verification

- Narrow package tests/checks first for each issue.
- OS-628: inspection report contract, native-error, engine, provenance, mode,
  trust, formatter, and Vite-adapter fixtures.
- OS-630: parser/discovery/process/orchestration tests using fake executables;
  no real install/dev/reload/Connect mutations.
- OS-631: catalog invariants, sidebar migration, and exact public-declaration
  key coverage.
- Every issue: `bun run format:check`, `bun run check`, `bun run test`, and
  `bun run build` before push/readiness.
- Prompt/goal alignment: run both goal-loop prompt checks and the packet doctor;
  record the result in `RETRO.md`.

## Next Move

- If a check fails: narrow to the smallest repro, fix within the owning issue,
  rerun focused verification, then broaden.
- If progress stalls: after three failures, change approach or ask a bounded
  worker to inspect evidence; do not repeat the same command path.
- If scope is unclear: choose the smallest behavior supported by Linear and
  public contracts; ask only when the decision changes authority or horizon.

## Waiting State

- Waiting on: delegated audit/review work, PR CI, and remote review threads.
- How to check: collaboration status for workers; GitHub PR/check/review state;
  Linear issue state and comments.
- Heartbeat cadence: check workers when expected work exceeds 10 minutes; poll
  CI/reviews at material state changes without noisy updates.
- Continue when: worker evidence is harvested, CI completes green, and review
  blockers are resolved.
- Stop when: access/auth is unavailable after confirmed retries, a required
  public contract cannot be satisfied without forbidden upstream/private code,
  or user authority is needed for a consequential action.
- Last checked: 2026-08-07 preparation; baseline CI green.

## Persistence

- Keep plan status and `RETRO.md` current at milestone boundaries. Resume from
  this `GOAL.md`, then `RETRO.md`, current `but status`, Linear, and PR state.

## Amendments

`GOAL.md` may be amended when execution reality changes. Record meaningful
changes in `RETRO.md`. Horizon, authority, review, and verification may not be
weakened without explicit user approval.

## Stop Rules

- Stop before merge, land, publish, release, visibility change, announcement,
  upstream edit, live plugin lifecycle mutation, or Connect mutation.
- Stop if required work would depend at runtime/test time on `../bb`, copied
  testing harness code, private bb application internals, or plugin execution
  during passive discovery.
- Stop for conflicting user-owned changes that cannot be isolated, persistent
  authentication/access failure, or an acceptance-criteria contradiction that
  materially changes scope or authority.
