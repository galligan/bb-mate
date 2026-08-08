# OS-638 shareable-alpha release handoff

## Outcome

Assemble a traceable, reviewable local-alpha candidate with every owner decision
and upstream limitation explicit, then leave a green ready PR unmerged for Matt.

## Slice

1. Inventory the landed independent roadmap, current package/version/license
   state, compatibility target, trial evidence, installation lifecycle, and
   upstream-dependent OS-639 through OS-644 issues.
2. Write one release-handoff document containing the version/changelog
   proposal, candidate commit and artifact checksum, compatibility matrix,
   limitations, lifecycle and recovery instructions, proposed release and
   announcement copy, and explicit go/no-go decisions.
3. Build the artifact from the exact candidate commit and run CI-equivalent,
   static-lab, visual/accessibility, content, and clean-room lifecycle gates.
4. Obtain standing and fresh targeted review, fix every P0-P2 and reasonable P3,
   then open a draft PR and follow hosted CI and review threads.
5. Promote the PR to ready only when green, then stop with it unmerged and keep
   OS-638 In Progress pending the owner's release decisions.

## Boundaries

- The original goal loop must stop before merging. Do not publish to npm, tag,
  create a release, change repository visibility, send an announcement, or
  choose a public license.
- Do not edit upstream bb or implement OS-639 through OS-644 locally.
- Do not install a plugin or mutate Connect, normal bb state, secrets, or an
  existing developer environment.
- Label Fixture as approximation, Harness as unavailable pending the official
  SDK testing package/adapter, and Live bb as visual authority.
- Treat `UNLICENSED` as the current private-candidate state and an explicit
  owner decision, not as a public-license selection.

## Verification

- Confirm every independent OS-627 sub-issue is Done and list upstream-dependent
  issues separately with rationale.
- Run `bun run format:check && bun run check && bun run test && bun run build`.
- Run `bun run visual:test`, `bun run package:inspect`, and
  `bun run package:test` from the exact candidate.
- Record artifact version, candidate commit, file/story counts, and SHA-256.
- Audit all handoff links, claims, lifecycle commands, rollback steps, decision
  owners, and stop rules.
- Complete standing and fresh targeted review, then hosted CI and thread audit.

## Progress

- [x] Inventory landed, deferred, version, license, compatibility, and support state.
- [x] Write the complete traceable release handoff and owner decision checklist.
- [x] Run candidate artifact, aggregate, visual, content, and clean-room gates.
- [x] Complete standing and fresh targeted review with no open P0-P3.
- [x] Open a draft PR, obtain green hosted gates, mark ready, and stop unmerged.

## Completion

Complete for this goal loop when OS-638 has a green ready PR with a fully
traceable local-alpha handoff and no unresolved review thread, while the PR and
issue remain unmerged/In Progress at the explicit owner decision boundary.

## Post-ready owner authorization

The original goal loop completed at its required unmerged boundary. On
2026-08-08, Matt explicitly authorized merging PR #13 after additional local
review passes. That later authorization does not permit npm publication, a
public-license choice, tagging or release creation, a visibility change, an
announcement, upstream bb edits, or normal plugin/Connect mutation.
