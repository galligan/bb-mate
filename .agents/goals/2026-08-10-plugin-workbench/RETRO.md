# Plugin Workbench goal retrospective and evidence ledger

Date started: 2026-08-10
Status: Active

## Summary

The execution goal is active. Compatibility baseline #52 is merged; spec/goal
PR #53 is in its exact-head review and hosted-CI gate.

## Readiness

Active. Prompt/doctor/formatting and packet reviews pass; #52 is merged. PR #53
must clear exact-head 5/5 review and hosted gates before Gate 0 begins.

## Baseline

- Repository: `/Users/mg/Developer/bb/bb-mate`
- Design branch: `docs/plugin-workbench/spec`; PR #53.
- Current reviewed head before final fixes: `0e6a4ab93919a63273e2c508f3cd0efa3af84aea`.
- Merge base: `fa02c6d0d7c4ffb2f8855029def1589ed7ce7824`.
- Compatibility PR #52 merged from exact head
  `1b047598b52f49ed8e6e0f7dd88387ff02c10445` to baseline merge commit
  `fa02c6d0d7c4ffb2f8855029def1589ed7ce7824`; issue #51 is closed.
- GitButler is clean with only the spec branch active.

## Preparation findings

- A disposable compile probe proved Bun can produce a standalone macOS arm64
  Mach-O and run help/passive inspection. Packaged `dev` failed because current
  asset lookup did not find the lab and `process.execPath` was then reused as if
  it were Bun. This is an implementation gap, not a failed compiler bet.
- Current package clean-room proof intentionally supplies Bun and therefore does
  not prove no-Bun execution. The goal adds a separate binary lane.
- `@bb/plugin-sdk` was not publicly resolvable during preparation and upstream
  get-bb/bb#1134 remained open. A real frontend plugin therefore requires Gate
  0 before it may enter independent scope.
- The bb 0.36 npm artifact does contain the intended manifest, nav panel,
  RPC/realtime, background service, tools/skills, mention, composer, panel,
  message action, project, and plugin inventory declarations/runtime. It does
  not expose public automatic browser open/focus/capture/control or generic
  thread attachments. Workbench-owned page capture and mention/panel/tool
  references remain the honest downstream path.
- Security audit required Wave 0 contracts for four least-privilege principals,
  a single-use clean-history browser bootstrap after same-instance proof, and
  stdio-only V1 MCP. General HTTP/OAuth MCP, remote topology, arbitrary live
  capture, model-callable native/external mutation, and artifact import are
  deferred to reduce V1 risk.

## Goal Amendments

- Packet review clarified Gate 0 from one frontend verdict to a per-capability
  matrix. This preserves rather than narrows the original maximum-independent-
  work objective.
- V1 MCP is stdio only. The design record's optional HTTP MCP route was removed
  after security review; Streamable HTTP/OAuth remains deferred.

## Execution Log

- 2026-08-10: created the packet from the accepted design record and four
  bounded preparation audits.
- 2026-08-10: activated the direct execution goal. Found one unresolved P2 on
  compatibility PR #52, added workflow-level serialization in commit
  `1b047598b52f49ed8e6e0f7dd88387ff02c10445`, ran the full local gates, replied
  and resolved the thread, and waited for hosted `verify`, `visual`, and
  GitGuardian checks to pass.
- 2026-08-10: pinned #52 at `1b047598b52f49ed8e6e0f7dd88387ff02c10445`
  and merged it through GitHub async request
  `0e8c1b42-73b9-4d40-9980-242ab10cf1ce`. Merge commit:
  `fa02c6d0d7c4ffb2f8855029def1589ed7ce7824`. `but pull` removed the integrated
  compatibility branch and rebased the clean spec branch. Issue #51 closed.

## Review Log

- Runtime/packaging, public bb seam, security/MCP, and goal-scope audits
  completed read-only during preparation. Findings were incorporated into the
  packet.
- Packet review round 1: standing 3/5 and targeted 3/5, changes requested. Fixed
  the collapsed Gate 0, HTTP-MCP contradiction, #1133 mislabel, missing exact
  commands/CI transitions, per-milestone 5/5 ambiguity, and prompt headroom.
- Packet review round 2: standing 3/5 and targeted 4/5, changes requested. Fixed
  the remaining unconditional Streamable HTTP test, built-in-browser claim,
  singular Gate 0 wording, and prompt maintenance margin. Historical scratch
  reports are archived outside the active doctor path after durable summary.
- Packet review round 3: standing 5/5 and targeted 5/5, both clean with zero
  open P0-P3. Active reports: `tmp/reviews/standing/round-3.json` and
  `tmp/reviews/targeted-packet/round-3.json`. Superseded rounds 1–2 are scratch-
  archived at `/tmp/bb-mate-plugin-workbench-reviews-20260810/`.
- PR #53 exact-head review round 4 found stale pre-activation/current-state
  language in the plan and `RETRO.md`; fixes are in progress before re-review.

## Verification Log

- `check-goal-prompt --no-placeholders`: passed at 3,216/4,000 characters.
- `goal-loop-doctor`: passed with both active round-three reports clean.
- `bun run format:check`: passed for the reviewed packet and design record.
- PR #52 final local gate: `bun run format:check && bun run check && bun run
test && bun run build && bun run compatibility:latest` passed; package clean
  room produced 41 files, 13 stories, SHA-256
  `de6174f733c8a76fdc4b7e117ff2499a47d55e918e02150fecb9337384e0e843`.

## Evidence ledger

Append milestone entries with date/time, exact head/base, commands, results,
review reports/findings/dispositions, PR/CI/thread state, issue changes, and
merge/reconciliation proof.

## Prompt / Goal Alignment

The prompt carries the `merged` horizon, conditional Gate 0, authority,
forbidden actions, review model, verification, done/not-done, and persistence.

## Forbidden-action audit

No npm publication/tag, Git tag/release, visibility change, announcement,
upstream edit/submission, Connect exposure, or normal-profile mutation during
preparation.

## Final State

Execution active; next gate is PR #53 merge, then Gate 0.
