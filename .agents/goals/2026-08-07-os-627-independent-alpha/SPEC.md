# Goal Spec: OS-627 upstream-independent alpha

Date: 2026-08-07
Status: Ready

## Objective

Complete, test, review, and verify every remaining upstream-independent OS-627
issue through a reviewable local shareable-alpha handoff, while keeping native
bb authoritative and leaving OS-639 through OS-644 untouched.

## Context

The foundation and first feature wave are merged on `main` at `a637aa0` with
green CI. OS-628, OS-630, and OS-631 provide the passive inspection core, thin
native-loop CLI, and typed public surface catalog. Live Linear verification
shows OS-629, OS-633, OS-634, and OS-636 are unblocked; OS-632 and OS-635 follow
OS-633; OS-637 follows OS-632/634/635/636; and OS-638 follows OS-629/637.

Preparation found one useful soft dependency beyond Linear: OS-634 should
follow OS-633 so its launcher uses the story lab's scenario/theme/viewport
vocabulary, and OS-632 should follow OS-634 so visual and accessibility
baselines cover the finished overlay rather than a temporary state.

## Scope

### In

- OS-629 compatibility target data and precise drift checks.
- OS-633 catalog-complete deterministic Ladle surface lab.
- OS-634 linkable, accessible Mate launcher with explicit native handoffs.
- OS-632 bounded visual regression and accessibility coverage.
- OS-635 deterministic local package artifact and clean install proof.
- OS-636 external author, trust, security, support, and private-alpha policy.
- OS-637 simulated first-time-author clean-room trial and triaged report.
- OS-638 versioned local candidate packet, checksum, evidence, limitations,
  release proposal, and explicit go/no-go handoff.
- Tests, docs, plans, goal evidence, PR/CI/review follow-through, merges for
  prerequisite issues, and Linear hygiene needed to reach the final handoff.

### Out

- OS-639 through OS-644 and any local substitute for their upstream contracts.
- Editing or importing from `/Users/mg/Developer/bb/bb`.
- npm publication, tags/releases, repository visibility changes, announcement
  delivery, or merging the final OS-638 handoff PR.
- Authenticated Connect embedding or mutation of normal bb/plugin state.
- Claims that Fixture is exact host rendering or that Harness is available.

## Source Of Truth

- `AGENTS.md`, `README.md`, and `docs/architecture.md`.
- Linear OS-627 and OS-629/632/633/634/635/636/637/638.
- The completed first-wave goal and plan under `.agents/`.
- Public immutable bb release and registry artifacts for compatibility probes.
- `/Users/mg/Developer/bb/bb` only as read-only development evidence.

## Acceptance Criteria

- OS-629 through OS-637 are merged to `main`, Linear-complete, and proven by
  focused checks, aggregate Bun gates, local two-reviewer loops, and hosted CI.
- The surface lab has statically discoverable deterministic stories for every
  catalog surface and never mounts content scripts through ordinary discovery.
- The finished launcher is URL-stable, explicit about plugin/mode availability,
  keyboard accessible, responsive, and delegates lifecycle work to native bb.
- CI runs a small deterministic visual/a11y matrix with reviewable baselines,
  readable diffs, and honest fixture-versus-live claims.
- A versioned allowlisted tarball installs, runs fixture-only workflows, and
  uninstalls in a temporary environment without monorepo-relative assumptions.
- Public-facing docs disclose trust and mutation boundaries and record the safe
  private-alpha license state: no public license grant or publication decision.
- A reproducible no-secret clean-room trial has no open P0/P1 findings.
- OS-638 has a green ready PR containing the complete local candidate handoff;
  its exact artifact/checksum and commit are traceable, and the PR is not merged.

## Decisions

- Completion horizon is `ready-pr`: prerequisite issue PRs may merge after
  their gates, while OS-638 stops as the final reviewable approval surface.
- Centralized implementation follows `OS-629`, then the conflict-heavy
  `OS-633 -> OS-634 -> OS-632` chain, then `OS-635 -> OS-636 -> OS-637 -> OS-638`.
- Subagents may audit/review and write only packet-local ignored scratch review
  reports; source, source-control, tracker, and external writes stay centralized
  because the workbench files overlap heavily.
- The current private/no-license-grant posture is documented, not replaced by
  an inferred open-source license. Public licensing remains an owner decision.
- The clean-room trial uses a fixture-only/no-bb lane as mandatory proof. Any
  real native lane remains passive unless separately authorized.

## Risks

- Ladle, Playwright, axe, and browser dependencies are new and can expand CI;
  keep the matrix deliberately bounded and pin deterministic runtime inputs.
- Current package/workbench paths assume the monorepo and `workspace:*`; OS-635
  must establish an installed-package boundary without bundling bb or plugins.
- Launcher URLs must select only server-discovered candidates, never arbitrary
  filesystem paths supplied by a browser query.
- OS-636 commands cannot be finalized truthfully until OS-635 packaging lands.
- OS-638 contains release prose but that prose is evidence only, not authority
  to publish, publicize, tag, merge, or announce.
