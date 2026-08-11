# Goal Execution Contract: bb-scoped Plugin Workbench inventory

Date: 2026-08-11
Status: Ready
Spec: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/SPEC.md`
Prompt: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/PROMPT.md`
Retro: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/RETRO.md`
Refs: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/REFS.md`

## Completion Horizon

`ready-pr`

Complete when the native redesign and bb-scoped all-project inventory are on
two fully pushed stacked PRs that move from draft to ready only after exact-head
hosted CI, standing review, fresh full-stack review, aggregate verification,
package and live released-bb proof are clean; tracker and packet evidence are
current; and the GitButler workspace preserves unrelated PR #73 without
uncommitted goal work.

Not complete when work is only local, the current redesign remains an
uncommitted mixed diff, one project still needs a manual `Open` action, scanning
can leave bb-authorized roots, exact-head checks/reviews are pending, the live
plugin has not been verified, documentation is stale, or the PR remains draft.

## Authority

- May create and maintain one focused GitHub issue beneath #21.
- May commit the current intended native redesign, create/stack focused
  GitButler branches, push, open a draft PR, address review feedback, resolve
  threads, and mark the PR ready after all gates pass.
- May rebuild and reload the already path-installed Mate plugin for live visual
  verification without removing/reinstalling it or altering settings/secrets.
- May use disposable HOME/XDG/BB_DATA_DIR/cache/registry profiles for package
  and lifecycle proof.
- May delegate bounded research, implementation, testing, and review work.
- May not merge, queue, publish, release, upload the private package, remove or
  reinstall the managed/path plugin, edit upstream bb, mutate PR #73, or change
  normal user project/plugin data beyond the authorized path-plugin reload.
- Needs user approval for merge, release/public redistribution, upstream bb
  work, destructive cleanup, or a materially different product model.

## Boundary

- In scope: current native-design diff; plugin backend/frontend; runtime/CLI
  discovery contracts; tests/fixtures/screenshots; packet/plan/design docs;
  focused issue/PR metadata; package/standalone stamps when executable inputs
  change; isolated lifecycle and live visual verification.
- Out of scope: browser bootstrap #70, redistribution #77, arbitrary filesystem
  browsing, target execution, preview implementation, persistent plugin-thread
  association, host-private APIs, release/merge.
- Do not touch: `../bb`; PR #73 branch/files; unrelated user dirt; normal bb
  settings/secrets; generated artifacts except through their owning scripts.

## Topology

Coordinator with delegated workers and a milestone stack. The coordinator owns
the goal contract, architecture synthesis, file-ownership boundaries,
GitButler, GitHub/tracker mutations, integration, live bb actions, review
dispositions, and final readiness. Workers own bounded research or explicitly
assigned non-overlapping files and return exact evidence.

Branch order:

1. `feat/plugin-workbench/native-project-browser`
2. `feat/plugin-workbench/bb-scoped-project-catalog`, stacked above the first

## Steps

1. Preserve the native redesign
   - Outcome: the current component-registry/native project-first UI, design
     document, fixtures, and visual baselines form one verified reversible
     commit/branch beneath the inventory work.
   - Scope: current uncommitted files only; no discovery-contract changes.
   - Gate: 71+ Mate tests, plugin check/build, 14+ visuals, format/diff, live
     treatment already observed, and GitButler diff audit.

2. Freeze the bb-scoped inventory contract
   - Outcome: one focused issue plus strict public/private DTOs define eligible
     projects, grouped per-project results, bounded errors, activity ordering,
     and no-path browser projection.
   - Scope: packet, tracker, backend/runtime contract tests.
   - Gate: red contract tests cover all-project load, source changes, project
     isolation, hostile metadata, caps, and private-field rejection.

3. Implement workspace-aware runtime discovery
   - Outcome: discovery accepts only canonical bb-authorized roots, inspects root
     and declared workspace package boundaries, shares global budgets fairly,
     and produces stable project-correlated results without target execution.
     One strict batch request uses ephemeral correlation keys and one shared
     128-root/2,048-entry/128-target budget.
   - Scope: runtime discovery and CLI/controller composition; no browser code.
   - Gate: focused runtime/CLI tests, traversal/symlink/swap/limit matrices,
     no-command sentinels, reopen/catalog stability, package checks.

4. Implement backend batch composition
   - Outcome: one bounded RPC starts/uses one supervised runtime, resolves and
     reattests all eligible bb sources, batches them privately, and projects
     every project with its own finite target state.
   - Scope: Mate backend schemas, project adapter, runtime client/supervisor,
     backend tests.
   - Gate: public SDK-only imports, strict no-path snapshots, fair 128-project
     cap, source-race handling, partial isolation, lifecycle/concurrency proof.

5. Deliver the all-projects native experience
   - Outcome: opening the Workbench automatically shows all project sections and
     plugin rows expanded; refresh is explicit; empty/partial/error states are
     accurate; plugin detail/back/thread navigation remains intact.
   - Scope: Mate frontend, stories, browser fixture, design/product docs.
   - Gate: unit/boundary/state cross-products, keyboard/axe, light/dark/narrow,
     deterministic screenshots, hostile labels, generation races.

6. Prove, review, and hand off
   - Outcome: final artifacts/stamps and package lifecycle are reconciled when
     runtime bytes change; released bb shows the intended live inventory; two
     review lanes are clean; draft PR becomes ready with exact evidence.
   - Scope: full repo, clean rooms, live path-plugin reload, hosted CI, packet,
     issue/PR metadata, GitButler reconciliation.
   - Gate: zero open P0-P2, reasonable P3s fixed or tracked, all local/hosted
     checks green, zero review threads, MERGEABLE/CLEAN, prompt/doctor green.

## Reviews

- Keep one standing reviewer across all milestones for continuity, prior
  finding disposition, privacy/security, UX contract, and exact-head judgment.
- Use fresh targeted reviewers for runtime discovery, plugin adapter/frontend,
  and final full stack. Reuse each inside its fix loop.
- Reviewers load `local-review`, write JSON beneath
  `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/tmp/reviews/`, score 5/5,
  and list P0-P3 findings. P0-P2 block readiness. Fix reasonable P3s or record a
  concrete tracker-backed disposition.

## Evidence Contract

- `RETRO.md` records prep decisions, delegated evidence, issue/branch/PR IDs,
  exact base/head SHAs, commands/counts, artifact hashes/sizes, privacy/security
  probes, visual/live observations, review reports/dispositions, hosted state,
  threads, prompt/doctor state, forbidden-action audit, and final GitButler
  status.
- Final chat identifies the ready PR, what the live experience does, exact
  verification/review state, and the merge/release boundary.

## Verification

- Focused: package-owned unit/contract tests for each changed surface.
- Package: `bun --filter @bb-mate/runtime check`, `bun --filter bb-mate check`,
  `bun --filter bb-plugin-mate check`, `bun --filter bb-plugin-mate test`, and
  `bun --filter bb-plugin-mate build` as applicable.
- Visual: `bun --filter bb-plugin-mate visual:test` and inspected baselines.
- Aggregate: `bun run format:check`, `bun run check`, `bun run test`,
  `bun run build`, `bun run visual:test`, `bun run compatibility:latest`, and
  `git diff --check`.
- Artifact/lifecycle when executable inputs change: `bun run standalone:test`
  and `bun run mate:package:test`; reconcile generated stamp, manifest, tgz, and
  PR evidence to the final exact head.
- External: rebuild/reload the existing path plugin; inspect the released bb
  remote/desktop-equivalent UI; exact-head hosted checks, zero threads,
  mergeability, issue truth, GitButler cleanliness, prompt check, and goal doctor.
- Prompt/goal alignment: coordinator confirms `PROMPT.md` carries the sequence,
  loop, checks, hard rules, stop rules, done/not-done, persistence, and resume
  surface; record result in `RETRO.md`.

## Next Move

- If a check fails, narrow to the owning milestone, preserve the failing
  fixture/log, fix with TDD, and rerun focused before aggregate checks.
- If progress stalls, change approach after three failures and continue every
  independent lane.
- If scope is unclear, apply the smallest public-SDK, bb-authorized-root,
  path-private interpretation; ask only when a choice would widen filesystem,
  normal-profile, upstream, merge, or release authority.

## Waiting State

- Waiting on: delegated workers/reviewers and hosted CI after a pushed head.
- How to check: collaboration mailbox for workers; `gh pr checks <pr>` and
  `gh pr view <pr> --json headRefOid,isDraft,mergeStateStatus,statusCheckRollup`.
- Heartbeat cadence: harvest workers at milestone boundaries; check CI after 30
  seconds, then no more than once per minute while state is unchanged.
- Continue when: bounded worker evidence is returned or exact-head required
  checks are terminal green.
- Stop when: a listed stop rule fires or external auth/service failure persists
  after three bounded attempts.
- Last checked: not started.

## Persistence

- Update `RETRO.md` at preparation, commit/PR, milestone review, aggregate,
  live-verification, and final-readiness boundaries.
- Resume surface: this packet, current `but status -fv`, GitHub #82 and its PR
  stack, live hosted checks, and the newest review JSON.

## Amendments

`GOAL.md` may be amended when execution reality changes. Record meaningful
changes in `RETRO.md`. Do not weaken the horizon, verification, review policy,
filesystem/privacy boundary, or source-control authority without user approval.

## Stop Rules

- Stop before arbitrary filesystem access, path disclosure, target-code
  execution, private bb imports/routes, upstream edits, normal-profile mutation
  beyond safe path-plugin reload, PR #73 mutation, merge, publish, or release.
- Stop if the released public SDK cannot authorize the required project roots
  or if grouped results require exposing raw paths/source IDs to the browser.
- Stop for conflicting user-owned changes that cannot be isolated, persistent
  external authentication failure, or a consequential product choice outside
  this spec after continuing all unaffected work.
