/goal In `/Users/mg/Developer/bb/bb-mate`, execute `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/` to `ready-pr`.

## Read First

- `AGENTS.md`; packet `SPEC.md`, `GOAL.md`, `REFS.md`; project-first plan.
- Live #21/#82, PR #73, open PRs, and `but status -fv`.

## Objective

Inventory eligible ordinary bb projects and source plugins. bb-registered primary-host sources alone authorize roots; workspaces focus passive discovery; browser state stays path-free.

## Authority

- Commit/push `feat/plugin-workbench/native-project-browser`, then stack `feat/plugin-workbench/bb-scoped-project-catalog`; open drafts and mark ready only after all gates.
- Maintain #82, use clean rooms, and reload the plugin.
- Do not merge, queue, publish, release, edit `../bb`, alter PR #73, remove/reinstall the plugin, or expose private paths.

## Boundary

- In: native diff, batch discovery, app/runtime, tests/visuals/docs, artifacts, #82/PRs, live proof.
- Out: #70 preview/bootstrap, #77 distribution, target execution, persistent plugin-task links, upstream/private APIs.

## Sequence

1. Isolate and verify the native registry redesign.
2. Freeze grouped project/plugin contracts with red tests.
3. Add one authenticated batch scan: 128 roots, 2,048 entries, 128 targets; root plus safe npm/Bun/pnpm workspaces; no recursive fallback.
4. Revalidate bb sources and return per-project path-free states.
5. Render all projects/plugins expanded; retain detail/Back/task navigation.
6. Reconcile artifacts, live bb, reviews, docs/tracker, CI, and ready PRs.

## Loop

Delegate non-overlapping work; TDD; run focused checks; obtain standing and targeted `local-review` JSON; fix P0-P2 and reasonable P3s; record evidence/amendments in `RETRO.md`; advance only when clean.

## Verification

- Mate check/test/build and visual test.
- Scanner/admission tests; `bun --filter @bb-mate/runtime check`; `bun --filter bb-mate check`.
- `bun run format:check && bun run check && bun run test && bun run build && bun run visual:test && bun run compatibility:latest`.
- If runtime bytes change: `bun run standalone:test && bun run mate:package:test`.
- `git diff --check`; live reload; hosted checks; zero threads; MERGEABLE/CLEAN; prompt check and goal doctor.

## Hard Rules

- Activity only orders; it never authorizes roots or hides idle eligible projects.
- Never scan outside canonical bb roots, execute target/package-manager code, or expose private paths/IDs/auth/topology/process/env data.
- Use public bb SDK and the existing supervised boundary; preserve unrelated work and PR #73.

## Stop Rules

Stop only for forbidden filesystem/privacy/upstream/profile/merge/release action, unisolatable changes, persistent auth failure, or a consequential choice outside the spec. Continue unaffected work.

## Definition Of Done

- Initial load shows all eligible projects and plugin rows with no project Open/admit controls.
- Per-project states preserve siblings; detail/Back/task flows remain accessible.
- Two exact-head review lanes are 5/5 with zero open P0-P2; local/package/live/hosted proofs pass; packet/tracker/PRs are current and ready but unmerged.

## Evidence Contract

Record issue/PR SHAs, checks/counts, hashes, security probes, live/visual proof, reviews, hosted state, threads, and final GitButler/forbidden-action audit in `RETRO.md`. Final chat links ready PRs and states merge/release boundaries.

## Next Move

Narrow failures to their owner and change approach after three failures. Prefer the smallest public-SDK, bb-root, path-private interpretation; ask only before widening authority/scope.

## Not Done

Local-only changes, draft PRs, pending CI/review, stale artifacts/docs, manual project opening, or dirty goal work.

## Persistence

Resume from this packet, `RETRO.md`, `but status -fv`, #82/PRs, checks, and review JSON. Poll workers at milestones and CI after 30 seconds, then once per minute.

Keep going until the definition of done is satisfied unless a stop rule fires.
