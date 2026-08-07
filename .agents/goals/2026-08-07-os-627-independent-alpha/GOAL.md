# Goal Execution Contract: OS-627 upstream-independent alpha

Date: 2026-08-07
Status: Ready
Spec: `.agents/goals/2026-08-07-os-627-independent-alpha/SPEC.md`
Prompt: `.agents/goals/2026-08-07-os-627-independent-alpha/PROMPT.md`
Retro: `.agents/goals/2026-08-07-os-627-independent-alpha/RETRO.md`
Refs: `.agents/goals/2026-08-07-os-627-independent-alpha/REFS.md`

## Completion Horizon

`ready-pr`

Complete when OS-629 through OS-637 are merged to `main` with their Linear
issues Done, and OS-638 is an open ready PR with green CI, resolved review
threads, zero open local-review P0-P2 findings, a traceable local candidate,
and current evidence in `RETRO.md`.

Not complete while work is local-only, a prerequisite PR/CI/review is pending,
the clean-room trial has an open P0/P1, the candidate lacks an artifact or
checksum, or the final handoff PR has been merged.

## Authority

- May commit, push, open drafts, mark ready, and merge OS-629 through OS-637
  after their issue-specific verification, review, and hosted-CI gates.
- May create local package archives, temporary isolated install environments,
  deterministic screenshots/diffs, checksums, and static site builds.
- May update Linear at phase boundaries through Done for merged prerequisites
  and In Review for OS-638.
- May passively read public registry data and native bb status/version output.
- May not merge OS-638, publish packages, create tags/releases, change
  visibility, send announcements, choose a public license, edit upstream bb,
  expose/pair Connect, or install/dev/reload/remove plugins in normal bb state.
- Needs user approval for any real native trial that mutates bb/plugin/Connect
  state and for any public license, publication, visibility, or release action.

## Boundary

- In scope: OS-629 and OS-632 through OS-638, their code/tests/docs/evidence,
  dependency-correct PRs, hosted follow-through, merges, and tracker hygiene.
- Out of scope: OS-639 through OS-644, upstream/private fallbacks, public release.
- Do not touch: `/Users/mg/Developer/bb/bb`, secrets, authenticated sessions,
  normal plugin state, or Connect configuration.

## Topology

Central coordinator with bounded audits and reviews. Reviewers may write only
ignored packet-local scratch reports; source, VCS, tracker, and external writes
remain centralized. Implementation is sequential across conflict-heavy files.
Each issue uses its Linear branch name and a focused PR. OS-633, OS-634, and
OS-632 form an incremental dependency chain; later branches start from
reconciled `main` after their blockers merge.

## Steps

1. Compatibility alarm (OS-629)
   - Outcome: one reviewable target data file, deterministic human/JSON check,
     precise CI failures, focused tests, and manual live remeasurement runbook.
   - Gate: public immutable inputs only; focused and aggregate checks; standing
     and targeted reviews; ready/green PR; merge and Linear Done.

2. Surface lab (OS-633)
   - Outcome: Ladle static/serve workflow, explicit stories and deterministic
     adapters for every catalog surface, richer bounded states, and completeness
     tests; content-script discovery remains unmounted.
   - Gate: no bb/Connect/secrets/sibling dependency; static build and browser
     smoke proof; two-reviewer loop; ready/green PR; merge and Linear Done.

3. Mate launcher (OS-634)
   - Outcome: URL-stable plugin/surface/scenario/mode/theme/viewport controls,
     discovered-candidate validation, accurate prerequisites, accessibility,
     responsiveness, and explicit CLI/native handoffs.
   - Gate: interaction and URL tests plus browser QA; no authenticated iframe or
     implicit mutation; two-reviewer loop; ready/green PR; merge and Linear Done.

4. Visual and accessibility regression (OS-632)
   - Outcome: checked-in bounded browser matrix and baselines, deterministic
     fonts/viewport/motion, readable diffs, axe plus keyboard/focus/contrast and
     overlay interaction checks, measured replica geometry, update runbook.
   - Gate: fast PR CI, static Ladle enumeration, reviewable baseline update,
     two-reviewer loop; ready/green PR; merge and Linear Done.

5. Clean local package (OS-635)
   - Outcome: versioned allowlisted tarball and installed-package asset lookup;
     help, fixture inspection, surface-lab start, uninstall, and content scans in
     isolated temporary prefixes.
   - Gate: no absolute path/symlink/secret/sibling/bundled-plugin dependency;
     artifact/checksum proof; two-reviewer loop; ready/green PR; merge and Done.

6. External author contract (OS-636)
   - Outcome: verified quickstart, ownership/fidelity/trust/mutation matrix,
     compatibility/support/deprecation policy, CONTRIBUTING and SECURITY, and
     documented private-alpha/no-public-license-grant decision boundary.
   - Gate: every command verified against clean checkout or artifact; security
     review plus targeted docs review; ready/green PR; merge and Linear Done.

7. Clean-room trial (OS-637)
   - Outcome: reproducible isolated first-time-author simulation using only the
     artifact/docs, with times, versions, successes, failures, decisions, and
     concrete follow-ups recorded without secrets.
   - Gate: mandatory fixture/no-bb lane; all P0/P1 fixed and trial rerun; full
     aggregate and candidate checks; ready/green PR; merge and Linear Done.

8. Local alpha handoff (OS-638)
   - Outcome: version/changelog proposal, exact tarball/checksum/commit,
     compatibility matrix, trial and CI evidence, known limitations, install /
     update / uninstall / rollback guidance, proposed release copy, and go/no-go.
   - Gate: all independent blockers complete; standing plus fresh full-stack
     review; green hosted CI and resolved threads; ready PR; stop before merge.

## Reviews

- Keep one standing reviewer across milestones for doctrine, dependency, and
  prior-finding continuity.
- Use one fresh targeted reviewer per issue, reused through that issue's fix
  loop. Fix all P0-P2 and reasonable P3 findings; record residual P3 rationale.
- OS-637 additionally treats trial P0/P1 findings as blocking and requires rerun.
- Finish OS-638 with the standing reviewer plus a fresh full-stack reviewer.
- Store scratch reports beneath this packet's ignored `tmp/` directory.

## Evidence Contract

Record commands/results, report paths/scores/dispositions, branches/PRs/CI,
thread counts, Linear states/comments, artifact version/path/checksum/content
scan, trial environment and timings, baseline/diff results, goal amendments,
and a forbidden-action audit in `RETRO.md`.

## Verification

- Iterate with the smallest relevant tests and runtime probe.
- Before every ready PR and merge run `bun run format:check`, `bun run check`,
  `bun run test`, and `bun run build` on the intended branch/stack.
- Use public immutable artifacts and fake probe inputs for drift unit tests.
- Use fixed browser/DPR/locale/timezone/color/motion/font inputs for snapshots.
- Use `mktemp -d` with isolated HOME/XDG/cache/prefix for packaging and trial.
- Do not use a fake bb binary as evidence of real Live behavior.
- Validate this packet with both goal-loop prompt checks and the packet doctor.

## Next Move

Narrow failures, fix the owning issue, rerun focused checks/review, then broaden.
After three failures on one path, change approach and record the evidence.
Start downstream work only after its blockers are merged and `main` reconciled.

## Waiting State

- Waiting on: bounded review work, hosted CI, and remote review threads.
- Check workers through collaboration status; CI with `gh pr checks`; PR state
  with `gh pr view --json`; unresolved threads with the GitHub GraphQL API; and
  tracker state through live Linear issue reads.
- Heartbeat cadence: check once after 30 seconds, then at most every 60 seconds
  while pending; report only state changes or a concise ten-minute heartbeat.
- Continue when current blockers are green/resolved and `main` is reconciled.
- Stop when access remains unavailable after verified retries, public/private
  contracts cannot satisfy the issue, or consequential authority is required.
- Last checked: preparation on 2026-08-07; clean `main` and CI green.

## Persistence

Keep the active plan and `RETRO.md` current at milestone boundaries. Resume
from this file, `RETRO.md`, `but status`, live Linear, and GitHub PR state.

## Amendments

Record meaningful execution changes in `RETRO.md`. Do not weaken the horizon,
authority, review model, or verification gates without explicit user approval.

## Stop Rules

- Stop before OS-638 merge, any publish/tag/release/visibility/announcement,
  public-license choice, upstream edit, authenticated Connect use, or normal
  plugin lifecycle mutation.
- Stop if Fixture requires plugin execution, Harness needs copied/private code,
  a URL can inspect arbitrary paths, or package/trial evidence depends on local
  checkout symlinks, secrets, or absolute paths.
- Stop for unisolatable user-owned changes, persistent authentication failure,
  or acceptance criteria that require an unavailable public upstream contract.
