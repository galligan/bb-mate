# Linear plugin migration

## Outcome

Move the existing `bb-plugin-linear` working tree from Grid into BB Mate as
`plugins/linear`, preserving its `bb-plugin-linear` package name, `linear`
plugin id, saved settings, cache, and mention-usage state.

## Steps

- [x] Confirm BB Mate's plugin workspace and publishing conventions.
- [x] Move the exact source working tree, including current tracked and
      untracked changes, into `plugins/linear`.
- [x] Align package scripts, test imports, and lockfiles with the Bun
      workspace without changing plugin behavior.
- [x] Keep the currently installed path functional without removing the
      plugin, because `bb plugin remove` deletes saved settings and secrets.
- [x] Run the plugin tests, typecheck, build, live reload, and BB Mate's
      repository checks.
- [x] Inspect the final Git state in both repositories and document the
      compatibility path.

## Verification

- `bun run test`: 23 tests passed across the workbench and Linear plugin.
- `bun run check`: every workspace typecheck passed.
- `bun run build`: the workbench and Linear plugin built successfully.
- Targeted Prettier check: all migration-owned files passed.
- `bb plugin reload linear`: the installed plugin returned to `running` with
  its original plugin id and saved configuration.

The repository-wide format check still reports the unrelated, pre-existing
untracked plan `.agents/plans/2026-08-06-dispatch-bb-integration.md`. This
migration deliberately leaves that file untouched.

## Safety note

The installed bb version has no public command to retarget an installed path
plugin. Removing and reinstalling would delete the saved Linear API key. The
migration therefore keeps a compatibility symlink at the old Grid path while
the canonical files live in BB Mate.
