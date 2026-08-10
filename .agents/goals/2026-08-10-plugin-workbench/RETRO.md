# Plugin Workbench goal retrospective and evidence ledger

Date started: 2026-08-10
Status: Active

## Summary

The execution goal is active. Compatibility baseline #52 and spec/goal PR #53
are merged. Released-capability Gate 0 is locally complete with all six rows
passing; its review and merge gate is active.

## Readiness

Active. Prompt/doctor/formatting and packet reviews pass; #52 and #53 are
merged. Gate 0 admits all released host-plugin rows to downstream execution,
subject to its own 5/5 review, hosted CI, and merge gate.

## Baseline

- Repository: `/Users/mg/Developer/bb/bb-mate`
- Gate branch: `test/plugin-workbench/released-capability-gate`; issue #54.
- Current merge base: `59479253b2c0f6b465d5da870958267f846f42de`.
- Compatibility PR #52 merged from exact head
  `1b047598b52f49ed8e6e0f7dd88387ff02c10445` to baseline merge commit
  `fa02c6d0d7c4ffb2f8855029def1589ed7ce7824`; issue #51 is closed.
- Spec PR #53 merged from exact reviewed head
  `e48e0306f2eb01c167aca19ce349c5b54bfcfc80` through GitHub async request
  `3227e20c-b82b-4b20-9138-e7b17bd95d77`. Merge commit:
  `59479253b2c0f6b465d5da870958267f846f42de`.
- GitButler is clean with only the Gate 0 branch active.

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
- 2026-08-10: pinned spec PR #53 at
  `e48e0306f2eb01c167aca19ce349c5b54bfcfc80` after exact-head standing and
  targeted reviews both reached 5/5 with hosted checks green. Merged through
  GitHub async request `3227e20c-b82b-4b20-9138-e7b17bd95d77`; merge commit
  `59479253b2c0f6b465d5da870958267f846f42de`. `but pull` reconciled to a clean
  main workspace.
- 2026-08-10: opened Gate 0 #54 and foundation issues #55–#57 beneath #21.
  Disposable released-artifact probes classified rows A–F independently; all
  six passed against `bb-app@0.36.0` and generated SDK declarations `0.4.1`.

## Gate 0 released-capability matrix

| Row                   | Result | Admission evidence                                                                                                           |
| --------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| A frontend shell      | Pass   | `--app` scaffold, generated declarations, `navPanel`, type refresh, and stamped native frontend build                        |
| B backend supervision | Pass   | `background.service` and `onDispose` compile and native backend build                                                        |
| C native tools        | Pass   | Strict bounded Zod tool compiles, builds, and packs                                                                          |
| D skills              | Pass   | Manifest skill root and context-gated `bb.agents.configure` compile, build, and pack                                         |
| E thread/composer     | Pass   | Mention provider, thread/message actions, and composer quote/mention compile and build                                       |
| F lifecycle/live      | Pass   | Isolated path install, source, reload, disable, enable, reload, remove, shutdown, and no normal-profile plugin contamination |

The durable method and caveats are in
[`docs/plugin-workbench-capabilities.md`](../../../docs/plugin-workbench-capabilities.md).
The matrix admits the real plugin shell, supervisor, native tools/skill,
released thread references, and isolated lifecycle into downstream scope.

Gate 0 also fixed four implementation requirements: explicit scaffold dev-
dependency installation, a package `files` allowlist that includes `dist/`,
Node for the published isolated bb server entrypoint, and honest Harness
unavailability while `@bb/plugin-sdk@0.4.1` remains npm E404. It does not admit
automatic host-browser control, arbitrary live capture, generic thread
attachments, or remote loopback tunneling.

The executable graph is now #55–#67 beneath epic #21. The merge-first order is
domain/executable foundation (#55–#56), source discovery and host shell
(#57/#62), sessions/captures/thread references (#61/#59/#58), native tools/MCP
and education (#60/#67/#66), then integrated trial/review/handoff
(#65/#63/#64).

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
  language in the plan and `RETRO.md`. Round 5 standing and targeted reviews
  verified the correction at 5/5 with zero findings before merge.

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

Execution active; next gate is Gate 0 exact-head review, hosted CI, and merge,
then the domain and standalone-runtime foundation lanes.
