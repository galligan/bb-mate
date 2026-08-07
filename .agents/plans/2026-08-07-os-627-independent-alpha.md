# OS-627 upstream-independent alpha

## Outcome

Complete and merge every remaining upstream-independent prerequisite through
OS-637, then prepare OS-638 as the green, review-ready local-alpha approval
surface without publishing, publicizing, or editing upstream bb.

## Current status

Preparation complete; direct-start goal packet validated and ready to execute.

- Baseline: clean `main` at `a637aa061f7fd7eb09a28dffc9b4a7aede2fa4c0`.
- Main CI: run 31206636916 green.
- Included: OS-629 and OS-632 through OS-638.
- Excluded: OS-639 through OS-644 (`upstream-dependent`).
- Harness remains capability-gated because `@bb/plugin-sdk` is unpublished.
- Goal: `.agents/goals/2026-08-07-os-627-independent-alpha/GOAL.md`.

## Execution waves

1. OS-629 compatibility alarm from current main; merge after full gates.
2. OS-633 surface lab; merge after static/browser/full gates.
3. OS-634 complete launcher on reconciled main; merge after interaction QA.
4. OS-632 visual/a11y coverage over the finished lab and launcher; merge.
5. OS-635 local packaging and isolated install/uninstall proof; merge.
6. OS-636 verified author/trust/security/support docs and private license state;
   merge without publication or visibility changes.
7. OS-637 isolated first-time-author trial; fix all P0/P1 and rerun; merge.
8. OS-638 assemble exact candidate/handoff evidence; stop at ready green PR.

Each issue receives a focused plan before implementation, one standing and one
targeted review loop, aggregate Bun gates, hosted CI/thread follow-through, and
Linear phase updates. Source-control and tracker writes remain centralized.

## Constraints

- Native bb owns scaffold/build/install/dev/reload/runtime and Connect.
- Fixture remains approximate; Harness remains public-contract gated; Live bb
  remains the visual authority.
- No runtime/test dependency on `/Users/mg/Developer/bb/bb`, private app code,
  copied SDK harnesses, authenticated sessions, or normal plugin state.
- Browser target selection must be bounded to discovered candidates.
- Package/trial proof uses isolated temporary paths and no secrets or symlinks.
- No npm publish, public license inference, tag/release, visibility change,
  announcement delivery, or OS-638 merge.

## Completion

Complete at `ready-pr` when OS-629 through OS-637 are merged and Done, OS-638
is open ready/green/resolved but unmerged, all local and hosted gates pass, the
candidate artifact/checksum/commit and clean-room report are traceable, and the
goal retro contains a final forbidden-action audit.
