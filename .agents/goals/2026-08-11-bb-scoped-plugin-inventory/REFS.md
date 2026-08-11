# Goal References: bb-scoped Plugin Workbench inventory

## Repo Guidance

- `AGENTS.md` - public-SDK, plugin/runtime, verification, and documentation boundaries.
- `/Users/mg/.agents/skills/goal-loop/SKILL.md` - packet and execution contract.
- `/Users/mg/.config/codex/skills/delegate-goal/SKILL.md` - delegated lane mechanics.
- `/Users/mg/.agents/skills/local-review/SKILL.md` - review gate.

## Tracker

- `https://github.com/galligan/bb-mate/issues/21` - open Plugin Workbench roadmap.
- `https://github.com/galligan/bb-mate/issues/62` - completed host shell and target admission.
- `https://github.com/galligan/bb-mate/issues/70` - browser bootstrap/preview, out of scope.
- `https://github.com/galligan/bb-mate/issues/77` - redistribution compliance, out of scope.
- `https://github.com/galligan/bb-mate/issues/82` - focused all-project inventory implementation.
- `https://github.com/galligan/bb-mate/pull/73` - unrelated applied lane to preserve.

## Source Files

- `plugins/mate/types/bb-plugin-sdk.d.ts` - released project, thread, navigation, and app contracts.
- `plugins/mate/src/backend/project-adapter.ts` - project/source authorization.
- `plugins/mate/src/backend/plugin.ts` - public RPC composition.
- `plugins/mate/src/backend/workbench-contract.ts` - public snapshot schema.
- `plugins/mate/src/backend/runtime-target-client.ts` - authenticated runtime target client.
- `plugins/mate/src/frontend/plugin-app.tsx` - panel orchestration/navigation.
- `plugins/mate/src/frontend/workbench-panel.tsx` - native project/plugin presentation.
- `apps/cli/src/runtime-target-controller.ts` - source admission/discovery/catalog refresh.
- `packages/runtime/src/discovery/` - trusted-root discovery and target catalog.

## Docs / ADRs / Notes

- `.agents/plans/2026-08-11-native-plugin-design-system.md` - native UI milestone.
- `.agents/plans/2026-08-11-project-first-workbench.md` - current project-first milestone.
- `.agents/plans/2026-08-11-plugin-workbench-target-admission.md` - existing source admission contract.
- `.agents/plans/2026-08-10-development-target-discovery.md` - existing discovery safety model.
- `docs/native-plugin-design-system.md` - live/source-backed plugin UI grammar.
- `.agents/goals/2026-08-10-plugin-workbench/RETRO.md` - merged 62B/62C evidence and remaining #70/#77 boundaries.

## PRs / Branches

- `gitbutler/workspace` - synthetic shared worktree; use `but` for VCS writes.
- `feat/plugin-workbench/native-project-browser` - current native redesign and
  packet; first required PR.
- `feat/plugin-workbench/bb-scoped-project-catalog` - required inventory PR,
  stacked above the native project-browser branch.

## Commands

- `but status -fv` / `but diff` - preserve exact lane and uncommitted ownership.
- `bun --filter bb-plugin-mate test` - plugin contract/UI tests.
- `bun --filter bb-plugin-mate check` - plugin type safety.
- `bun --filter bb-plugin-mate build` - released native plugin build.
- `bun --filter bb-plugin-mate visual:test` - real Chromium screenshot/axe gate.
- `bun run check`, `bun run test`, `bun run build`, `bun run visual:test` - aggregate gates.
- `bun run standalone:test`, `bun run mate:package:test` - executable/package lifecycle gates.
- `bun run compatibility:latest` - released/latest bb compatibility.
- `bun run format:check`, `git diff --check` - formatting/diff integrity.

## Prompt

- `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/PROMPT.md` - initial direct-start goal prompt.

## Review Reports

- `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/tmp/reviews/` - active standing and targeted JSON reports.
