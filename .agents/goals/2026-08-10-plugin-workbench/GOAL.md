# Goal execution contract: Plugin Workbench

Date: 2026-08-10
Status: Ready
Spec: `.agents/goals/2026-08-10-plugin-workbench/SPEC.md`
Prompt: `.agents/goals/2026-08-10-plugin-workbench/PROMPT.md`
Retro: `.agents/goals/2026-08-10-plugin-workbench/RETRO.md`
Refs: `.agents/goals/2026-08-10-plugin-workbench/REFS.md`

## Completion Horizon

`merged`

Complete when every slice proven downstream-independent by Gate 0 is merged to
`main`, its GitHub issue is closed/current, hosted CI and required reviews are
green, the final clean-room/full-stack verification passes, `main` and the
GitButler workspace are reconciled and clean, and `RETRO.md` contains exact
evidence. Work requiring an unavailable public bb contract is complete for this
goal when it is precisely isolated, linked to an existing upstream issue or a
local tracked draft proposal, and left open with an honest unblock condition.

Not complete while independent work is local-only, in an open PR, awaiting CI
or review, failing a clean-room lane, missing tracker/evidence reconciliation,
or leaving avoidable workspace branches/dirt.

## Authority

- May create/update/close GitHub issues under #21; commit, push, open draft
  PRs, mark ready, resolve review feedback, and merge independent PRs after all
  gates pass.
- May build unsigned local artifacts and use temporary isolated bb/plugin,
  HOME, XDG, cache, prefix, browser, and runtime state.
- May delegate bounded implementation, research, QA, security, and review work
  to subagents. The coordinator owns scope, source integration, GitButler,
  GitHub mutations, merges, and final acceptance.
- May prepare local draft release notes and upstream proposal text.
- May not publish/tag/release/announce, change repository or package visibility,
  edit upstream bb, submit upstream issues/PRs, expose/pair Connect, or mutate
  normal user plugin state.

## Boundary

- In: this repository, #21 and new child issues, existing compatibility PR #52,
  the design record and goal packet, all public-contract-independent code,
  tests, docs, reviews, merges, and isolated trial evidence.
- Conditional: each host plugin, supervision, native tool, skill, thread, and
  installed-live slice only when its own Gate 0 capability row passes.
- Out: `../bb` edits, #41–#46 implementation before their upstream contracts,
  public distribution/signing authority, Connect, normal user state.

## Topology

Milestone coordinator with bounded subagents. Parallelize read-only audits,
non-overlapping implementation, tests, and reviews; serialize conflict-heavy
integration, GitButler operations, issue mutations, and merges. Use focused
GitButler branches/PRs, normally reconciling `main` between dependency waves.

## Steps

1. Merge and reconcile the already-green bb 0.36 compatibility PR #52.
2. Merge this design/goal packet and update #21 plus the focused issue graph.
3. Run Gate 0's per-capability matrix against released bb 0.36 artifacts and
   freeze each independent row without weakening public-contract rules.
4. Deliver the standalone executable and no-Bun clean-room lane.
5. Deliver the supervised runtime protocol and versioned domain object API.
6. Deliver source-first discovery and the browser Workbench authoring loop.
7. Deliver annotations, captures/comparisons, review navigation, and stable
   thread-handoff objects available through current public seams.
8. Deliver MCP parity, the project-aware skill, Surface Explorer, and paired
   plugin walkthrough.
9. Deliver each host/plugin slice whose applicable Gate 0 rows passed; for
   failed rows, finish upstream-ready local contracts without submission.
10. Run isolated clean-room trial, standing and full-stack reviews, fix all
    blocking findings, merge every independent PR, reconcile main/issues, and
    leave an exact unpublished handoff.

Wave 0 may not begin HTTP/object implementation until the principal/scope
model, browser bootstrap exchange, and V1 stdio-only MCP boundary in `SPEC.md`
are represented by failing contract tests or an accepted executable contract.

## Reviews

- Keep one standing reviewer across milestones for product boundary, prior
  findings, issue dependencies, and evidence continuity.
- Use a fresh targeted reviewer per milestone, reused within that milestone's
  fix loop. Both milestone reports must score 5/5 and list P0–P3 findings before
  merge.
- P0–P2 block. Fix reasonable P3 findings or record a concrete disposition.
- Final acceptance requires the standing reviewer plus a fresh full-stack
  reviewer, both 5/5 with zero unresolved P0–P2.
- Store scratch reports under this packet's ignored `tmp/reviews/` directory.

## Evidence Contract

Maintain `RETRO.md` as the append-only operational ledger: Gate 0 evidence;
scope amendments; commands/results; build hashes/arch/modes; browser matrices;
security probes; review paths/scores/dispositions; branches/PRs/CI/threads;
issue changes; clean-room environment; exact merged SHAs; final workspace/main
state; and a forbidden-action audit.

## Verification

- Iterate with the smallest focused tests; broaden before ready and merge.
- Every ready/merge gate runs format, type/compatibility, aggregate tests, build,
  relevant visual tests, hosted CI, review-thread, and issue-state checks.
- Runtime/package milestones add artifact allowlist/hash/mode/arch inspection,
  existing package clean room, and an empty-PATH/no-checkout executable lane.
- Security milestones run the matrices enumerated in `SPEC.md`; final proof uses
  a clean checkout and isolated HOME/XDG/cache/prefix/plugin state.

## Next Move

Validate and merge the preparation baseline, then run Gate 0. Narrow failures
to the owning slice, change approach after three failed attempts, and continue
all work not affected by a conditional upstream seam.

## Waiting State

- Poll subagents at useful boundaries; poll hosted CI after 30 seconds and then
  at most every 60 seconds. Report only state changes or a concise heartbeat.
- Check hosted state with `gh pr checks <number>` and `gh pr view <number>
--json state,isDraft,mergeStateStatus,headRefOid,statusCheckRollup`. Continue
  when required checks are green and mergeability is clean; failures return to
  the owning slice. Persistent auth/service failure after bounded retries fires
  the whole-goal stop rule.
- Resume from this packet, `RETRO.md`, `but status --json`, live GitHub
  issues/PRs/checks, and the last exact merged SHA.
- If one approach fails three times, narrow or change it and record the result.

## Persistence

Keep this contract and `RETRO.md` current at milestone boundaries. Resume from
them, `but status --json`, live GitHub state, and the last exact merged SHA.

## Definition Of Done

- Gate 0 truthfully classifies every conditional capability row.
- Every downstream-independent issue is merged/closed with green hosted proof.
- The standalone arm64 runtime works without global Bun or checkout assets.
- The canonical domain API supports a safe, useful browser and agent authoring
  loop with deterministic fixture evidence and honest fidelity labels.
- Conditional host work is either isolated-live verified or explicitly
  upstream-blocked; no local substitute exists.
- Full tests and reviews pass; main/workspace are current and clean; unpublished
  candidate and proposal evidence is complete.
- Security matrices prove principal isolation, loopback rebinding defenses,
  bounded artifact handling, bootstrap secrecy/revocation, supervisor cleanup,
  MCP protocol purity, and fail-closed topology.

## Not Done

Local-only or ready-but-unmerged work; a compiled help command whose UI still
needs Bun/checkout assets; installed-plugin discovery leaking managed plugins;
parallel adapter state; missing auth/path/topology defenses; unreviewed captures
or skills; stale issues; pending CI; dirty workspace; or an unsupported seam
silently treated as shipped.

## Amendments

Record changes in `RETRO.md`. Gate 0 may narrow conditional work. Do not weaken
the horizon, authority, security model, public-contract boundary, review gates,
or verification without explicit user approval.

## Stop Rules

- Stop before any forbidden external/release/upstream/normal-profile action.
- Stop if independent work would require copied/private SDK code, target-code
  execution during passive discovery, arbitrary path access, non-loopback
  exposure, secret leakage, or unisolatable user-state mutation.
- Stop for persistent authentication/access failure, conflicting user-owned
  changes that cannot be isolated, or a consequential product choice outside
  the defaults in the spec. Continue all safe independent work first.
