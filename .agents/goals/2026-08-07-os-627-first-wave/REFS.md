# Goal References: OS-627 first independent feature wave

## Repo Guidance

- `AGENTS.md` - native bb ownership, passive discovery, Harness gate, Bun, plans.
- `README.md` - ownership table, commands, fidelity language, selection behavior.
- `docs/architecture.md` - runtime boundary and current public registration groups.

## Tracker

- `OS-627` - epic and alpha exit criteria.
- `OS-628` - actionable compatibility report.
- `OS-630` - thin native plugin development loop CLI.
- `OS-631` - public UI surface catalog and fixture contract.
- `OS-629`, `OS-633`, `OS-634` - downstream boundaries, not in scope.

## Source Files

- `apps/workbench/plugin-inspection-server.ts` - current combined discovery/inspection/Vite adapter.
- `apps/workbench/src/plugin-inspection.ts` - current unversioned browser schema.
- `apps/workbench/src/plugin-inspection-server.test.ts` - walking-skeleton fixtures.
- `apps/workbench/src/scenarios.ts` - current sidebar-only special case.
- `apps/workbench/src/components/MateOverlay.tsx` - current target/mode/scenario controls.
- `plugins/linear/types/bb-plugin-sdk.d.ts` - selected plugin public declaration fallback for committed coverage.

## Docs / ADRs / Notes

- `.agents/plans/2026-08-07-native-plugin-preview.md` - completed walking skeleton.
- `.agents/plans/2026-08-07-os-627-first-wave.md` - active plan.
- `.agents/notes/2026-08-07/handoff-202608071030-223a1ed0.md` - preserved user-owned handoff note; do not commit as goal work.
- `/Users/mg/Developer/bb/bb/packages/plugin-sdk/src/app-contract.ts` - read-only development cross-check.
- `/Users/mg/Developer/bb/bb/packages/server-contract/src/api/plugins.ts` - read-only native JSON cross-check.

## PRs / Branches

- `os-628-expand-plugin-inspection-into-an-actionable-compatibility` - planned base branch.
- `os-630-ship-a-bb-mate-cli-for-the-native-plugin-development-loop` - planned stack child of OS-628.
- `os-631-define-the-public-bb-plugin-ui-surface-catalog-and-fixture` - planned independent branch.
- <https://github.com/get-bb/bb/issues/1134> - open SDK publication blocker; no local substitute.

## Commands

- `but status --json` - workspace, stack, base, and preserved dirt.
- `bun run format:check` - repository format gate.
- `bun run check` - repository type/static gate.
- `bun run test` - repository test gate.
- `bun run build` - repository build gate.
- `gh run list --branch main` - baseline CI proof.

## Prompt

- `.agents/goals/2026-08-07-os-627-first-wave/PROMPT.md` - initial prompt used to start and resume the target goal.

## Review Reports

- `.agents/goals/2026-08-07-os-627-first-wave/tmp/reviews/` - ignored scratch reports during execution; not committed.
