# Goal References: OS-627 upstream-independent alpha

## Repo Guidance

- `AGENTS.md` - native ownership, fixture/Harness/Live boundaries, Bun, plans.
- `README.md` - current workflows, ownership table, and fidelity language.
- `docs/architecture.md` - runtime, inspection, and public-surface boundaries.
- `.agents/goals/2026-08-07-os-627-first-wave/` - completed precursor evidence.

## Tracker

- OS-627 - parent epic and alpha exit criteria.
- OS-629 - compatibility target and drift alarm.
- OS-633 - Ladle story lab; blocks OS-632 and OS-635.
- OS-634 - complete Mate launcher; blocks OS-637.
- OS-632 - deterministic visual/a11y coverage; blocks OS-637.
- OS-635 - clean local package; blocks OS-637.
- OS-636 - author/trust/support docs; blocks OS-637.
- OS-637 - clean-room trial; blocks OS-638.
- OS-638 - shareable-alpha handoff; final approval surface.
- OS-639 through OS-644 - upstream-dependent Backlog, excluded.

## Current Source Surfaces

- `package.json` and `.github/workflows/ci.yml` - aggregate gates.
- `apps/workbench/package.json` and `bun.lock` - lab/browser dependencies.
- `apps/workbench/src/surface-catalog.ts` - catalog completeness authority.
- `apps/workbench/src/surface-fixtures.ts` and `thread-list-fixtures.ts` -
  deterministic fixture inputs.
- `apps/workbench/src/App.tsx`, `components/MateOverlay.tsx`, and `styles.css` -
  launcher and measured preview surface.
- `apps/workbench/plugin-inspection-server.ts` - discovered target boundary.
- `apps/cli/` and `packages/inspection/` - installed CLI/runtime dependencies.
- `plugins/linear/package.json` - example engine ranges and native bb pin.

## Public / Read-only Evidence

- Native `bb --version` and passive JSON/status commands.
- npm metadata for `bb-app`; unpublished `@bb/plugin-sdk` probe.
- Immutable `get-bb/bb` release-tag raw artifacts and public registry index.
- `/Users/mg/Developer/bb/bb/apps/app/package.json` and `.ladle/` - read-only
  workflow-shape comparison only; never copied or imported.

## Planned Branches

- `os-629-add-explicit-bb-version-registry-and-visual-drift-checks`
- `os-633-add-a-ladle-story-lab-for-every-plugin-owned-ui-surface`
- `os-634-complete-the-mate-overlay-as-the-plugin-surface-scenario-and`
- `os-632-add-deterministic-visual-regression-and-accessibility`
- `os-635-package-bb-mate-for-clean-room-local-installation`
- `os-636-write-the-external-plugin-author-guide-trust-model-and`
- `os-637-run-a-clean-room-external-developer-bb-mate-alpha-trial`
- `os-638-prepare-the-bb-mate-shareable-alpha-release-handoff`

## Verification Commands

- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run build`
- `but status --json`
- goal-loop `check-goal-prompt --no-placeholders`
- goal-loop `goal-loop-doctor`

## Review Reports

- `.agents/goals/2026-08-07-os-627-independent-alpha/tmp/reviews/` - ignored
  scratch reports used during execution.
