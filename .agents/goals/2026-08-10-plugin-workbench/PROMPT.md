/goal Execute `.agents/goals/2026-08-10-plugin-workbench` in `/Users/mg/Developer/bb/bb-mate` to `merged`.

## Read First

Repo guidance, packet, design record, GitButler, live GitHub.

## Objective

Merge all Workbench/runtime slices released bb permits; track gaps without private substitutes.

## Authority

Delegate work/review; coordinator owns VCS/GitHub/merges. Maintain #21. Never publish/release, change visibility, submit upstream, expose Connect, or mutate normal state.

## Boundary

In: bb-mate, #21, #52, independent work. Host work needs a green Gate row. Out: `../bb`, #41–46, distribution, Connect, normal state.

## Sequence

1. Merge/reconcile #52; merge packet; update #21/issues.
2. Isolated released-bb Gate rows: nav; supervision; tools; skills; thread/composer; lifecycle/live. No private SDK/`../bb`.
3. Standalone arm64 runtime; embedded assets; empty-PATH/no-checkout proof.
4. Secure `serve`, versioned objects/storage, lifecycle/topology.
5. Source discovery + browser authoring/review.
6. stdio MCP + skill + released thread references.
7. Passed host rows or tracked local proposal drafts.
8. Clean-room trial, fixes, merges, reconciliation, handoff.

## Loop

Per milestone: prove; delegate; implement; review 5/5; fix P0-P2/reasonable P3; clear CI/threads; merge; reconcile; log.

## Hard Rules

- bb owns target runtime/Live; Workbench owns authoring. Fixture approximates; Harness needs release.
- Passive source-first discovery runs no target code and excludes managed/builtin installs.
- One API owns state. Loopback/trusted roots/explicit mutation; no secret leaks; remote fails closed.
- Before HTTP/objects, test principals, single-use bootstrap, stdio MCP. IDs never authenticate; scope all state.
- Model tools have no raw path/URL/shell/eval/auth/destructive actions. Bound inputs.
- macOS arm64 only; other platform/signing claims unavailable.

## Verification

Every ready/merge: focused checks; `bun run format:check`; `bun run check`; `bun run test`; `bun run build`; conditional `bun run visual:test`; green CI/threads/issues. Also run `bun run compatibility:latest`; packaging adds `bun run package:inspect`, `bun run package:test`, and its new empty-PATH lane. Security runs isolated.

## Review

Milestones need standing + targeted 5/5, zero P0-P2, logged P3. Final adds fresh full-stack 5/5.

## Evidence Contract

Log Gate matrix, amendments, commands/artifacts, security/browser/reviews, PR/CI/issues, clean room, merged SHAs, forbidden-action audit in `RETRO.md`.

## Definition Of Done

Independent issues merged/closed; loop verified; host rows proven/tracked; evidence current; main/GitButler clean.

## Not Done

Local/open PR, pending gate, checkout-dependent binary, unsafe state, stale issue/dirt, or false claim.

## Next Move

Narrow/fix/recheck/review/broaden; reconcile after merges. Change approach after three failures.

## Stop Rules

Stop before forbidden actions or for private contracts, arbitrary paths, non-loopback exposure, leaked secrets, unisolatable state. Continue other safe work; never weaken contract without approval.

## Persistence

Resume from packet, `RETRO.md`, GitButler, GitHub, merged SHA. Continue until done or stop rule.
