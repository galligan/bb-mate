# Goal Spec: OS-627 first independent feature wave

Date: 2026-08-07
Status: Ready

## Objective

Bring OS-628, OS-630, and OS-631 to review-ready PRs as the first independent
feature wave under OS-627, while keeping native bb authoritative and leaving
upstream-dependent work untouched.

## Context

The OS-623 foundation is merged at `762ba04` with green CI. The current
walking skeleton passively discovers one plugin, reads native metadata and bb
JSON, and labels Fixture, Harness, and Live separately. Preparation found that
OS-630 must reuse the richer OS-628 report core; OS-631 remains an independent
catalog/fixture slice.

## Scope

### In

- OS-628 actionable compatibility report and shared passive inspection core.
- OS-630 thin local CLI for discovery, inspection, workbench launch, native
  build/dev handoff, and Live guidance.
- OS-631 typed public frontend surface catalog and declaration coverage check.
- Tests, focused docs/help, goal evidence, PRs, CI/review follow-through, and
  Linear state needed to reach `ready-pr`.

### Out

- OS-629 and OS-632 through OS-644 except for noting their existing dependency
  boundaries.
- Any local replacement for unpublished SDK/harness behavior.
- Merge, land, publish, release, announcement, repository visibility, or
  upstream bb changes.
- Mutating live plugin installation, settings, secrets, runtime, or Connect.

## Source Of Truth

- `AGENTS.md` - repository boundaries and working style.
- `README.md` - bb versus BB Mate ownership and fidelity claims.
- `docs/architecture.md` - durable runtime and public-surface boundary.
- `.agents/plans/2026-08-07-native-plugin-preview.md` - completed foundation.
- Linear OS-627, OS-628, OS-630, and OS-631 - intent and acceptance criteria.
- Selected plugin public declarations - committed coverage input.
- `../bb` - read-only development cross-check only.

## Acceptance Criteria

- OS-628 provides versioned JSON plus a concise human formatter; every failed
  check has remediation and retains underlying native evidence.
- OS-630 consumes the OS-628 core and delegates lifecycle commands to native
  bb with exact process semantics.
- OS-631 has one typed 13-group catalog that drives fixture selection and a
  dedicated public-declaration coverage check.
- All three issue slices have focused tests, clean local reviews, green full
  repository checks, open ready PRs, and green PR CI.
- Linear records the discovered OS-628 → OS-630 dependency and current phase.

## Decisions

- Completion horizon is `ready-pr`; the user explicitly withheld landing.
- Topology is coordinator with bounded workers plus a two-branch stack for
  OS-628 → OS-630 and an independent OS-631 branch.
- Shared inspection code is justified now because workbench and CLI are two
  real consumers. Surface catalog code stays inside the workbench until OS-633
  proves a second consumer.
- Real live-plugin/Connect mutations are excluded from verification; use fakes
  and passive native reads.

## Risks

- OS-628 and OS-630 can duplicate or conflict if the extraction boundary is
  not established first.
- OS-631 and OS-628 may both touch `MateOverlay.tsx`; keep presentation changes
  minimal and reconcile deliberately.
- Native JSON contracts may expose less trust metadata than the issue wording
  suggests; report unknowns instead of inferring source behavior.
- PR CI and automated reviews are external waiting states.
