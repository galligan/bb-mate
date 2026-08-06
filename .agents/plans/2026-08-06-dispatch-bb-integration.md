# Dispatch / bb Integration

Status: research — no implementation committed

## Outcome

Decide how bb and [dispatch](https://github.com/outfitter-dev/dispatch) should relate for
cross-agent communication, given that both already drive the Codex App Server and that
dispatch's Claude control path is its weakest seam.

This plan records findings and a proposed experiment. It does not commit to building
anything. Dispatch-side changes are tracked separately; this plan scopes the bb side.

## Findings (verified 2026-08-06)

Verified by process inspection on this machine. Re-check with
`pgrep -fl "app-server"` and tracing parents with `ps -o pid,ppid,command`.

- **bb spawns `codex app-server` directly.** Two instances (PIDs 33056, 36427) were
  children of bb's host-daemon (PID 32633). bb is on the app-server protocol, not
  wrapping the Codex CLI. bb's Codex threads are therefore real app-server threads with
  thread IDs in the shared `~/.codex` store.
- **bb spawns per client, not per daemon.** Two concurrent app-servers under one bb
  daemon. Dispatch ADR-0002 runs exactly one app-server with a router demuxing by
  `threadId`, and rejects the alternative by name: _"Spawn-per-client (like the SDK) —
  no shared event bus; can't do cross-lane triggers cleanly."_
- **Multi-writer over shared `~/.codex` is already the de facto state.** bb's two, plus
  ChatGPT.app's own two (PIDs 32164, 50968), plus a `codex app-server proxy` over SSH to
  `mini.local`. Dispatch ADR-0005 left write rungs locked because this case was
  unverified; reality has outrun the verification, not disproven it.
- **bb launches Claude Code as a non-interactive Agent SDK session** —
  `--output-format stream-json --input-format stream-json`, `CLAUDE_CODE_ENTRYPOINT=sdk-cli`,
  no TTY. bb owns the pipe exclusively.
- **bb has a first-class mention API**, `bb.ui.registerMentionProvider()`. Prior art:
  `bb-plugin-linear` registers Linear issue mentions on `#` with a search cache and a
  usage store for recency ranking.

## Analysis

### The recursion tension mostly dissolves for Codex

Lane 1 (bb as dispatch's backend) makes dispatch depend on bb. Lane 2 (a bb plugin using
dispatch) makes bb depend on dispatch. Doing both naively yields `bb → dispatch → bb`.

Because bb's Codex threads are app-server threads in the shared store, dispatch does not
need to reach them _through_ bb. It can discover and attach them the way it attaches
desktop Codex threads. The topology becomes `dispatch → app-server ← bb`, meeting at the
store rather than through each other.

### Claude is the case that justifies a backend selector

The two Claude control paths are different capability classes, not competing
implementations of one thing:

- **bb** gives _exclusive ownership_. ADR-0026 found persistent stream-JSON stays coherent
  "while it remained the exclusive owner" — which is bb's model by construction. Reliable
  for owned/headless lanes. Retires the zmx hardening dependency ADR-0026 flagged
  (raw send unacknowledged, can exit zero after loss).
- **zmx cockpit / Agent View** gives _human-coexistent_ control — reaching a Claude session
  a person is also driving. bb cannot do this; its model forbids a second client.

A per-provider backend selector encodes that distinction rather than hedging on it.

### Scoping bb-as-backend to Claude

Extending lane 1 to Codex would make dispatch inherit spawn-per-client, losing the shared
event bus that cross-lane triggers depend on. Keep Codex native to dispatch.

## Candidate lanes

1. **bb as a per-provider backend in dispatch.** Best fit for _owned_ lanes (ADR-0005's
   full-read/write tier — no external writer, matching bb's exclusive ownership).
   Gaps versus dispatch's Codex path: no `rollback`, `compact`, or `inject_items`; goals
   only partial (`bb thread clear-goal`, Codex-only); bb's CLI is wait/poll-shaped
   (`bb thread wait --status|--event`) rather than an event stream, though the plugin SDK
   has realtime and could bridge it. Adds a dependency on the bb server and stacks bb's
   per-machine `maxPermissionMode` under dispatch's lane authority ladder.
2. **A bb plugin using dispatch.** Most independent — no dispatch changes; shells out to
   `dispatch --json` or speaks the control socket. Buys bb what it structurally lacks:
   discover/attach desktop Codex threads, rollback, goals, inject. Constrained by
   ADR-0005: attached lanes are read-mostly by default, so realistically observation of
   external agents plus writes on dispatch-owned lanes.
3. **`@`-mentioning threads across both namespaces.** Best supported of the three, but a
   resolver over whatever backends exist — a veneer until something underneath sees both.
   Dispatch's ref scheme is conveniently ready: ADR-0019's `<source><payload4><mixer>`
   already varies `source` by provider (`0` = Codex) and separates stable identity from
   mutable `@handles`. ADR-0013's `@mini:builder` gives the cross-machine form.

Dispatch's inbox/queueing model is dispatch-side and independent of all three.

## Decisions

- Direction for Codex is **attach, not delegate** — but gated on the multi-writer question
  below, not assumed.
- bb-as-backend stays **scoped to Claude**, to avoid dispatch inheriting spawn-per-client.
- A Claude backend selector is warranted on capability grounds (exclusive vs. coexistent),
  independent of how the Codex question resolves.

## Next action: run the ADR-0005 spike with bb as the second writer

ADR-0005 left write rungs locked partly because the spike could not cleanly distinguish
"safe" from "racy" (its assumption #3). The second writer was desktop Codex — a GUI that
cannot be scripted or stepped. bb's second writer is scriptable (`bb thread tell`,
`bb thread wait --event`, `bb thread show --json`), which makes the experiment tractable.

Run in ADR-0005's ladder order:

1. **Observation only** (tests assumption #2). bb owns a Codex thread and writes turns; a
   second app-server connection resumes it read-only. Does event fan-out reach the
   observer live? Does the observer's `thread/items/list` match `bb thread log`?
   ADR-0005's Phase-1 spike found cross-process observation was _not_ live — re-test now
   that the writer is instrumentable.
2. **Interleaved writes** (idle-only-write rung). Alternate turns bb → observer → bb.
   After each, read full history from both sides and from the persisted rollout in
   `~/.codex`. Failure signature to watch for is ADR-0026's Claude result: both turns
   report success but continue from divergent histories, and one side's turn is absent
   from the other's later reads.
3. **Concurrent writes** (full-write rung). Both mid-turn simultaneously. Expect breakage;
   the value is knowing the failure mode.

## Acceptance checks

- Spike step 1 produces a documented yes/no on live cross-process observation.
- Spike step 2 produces a documented yes/no on history divergence under interleaved writes.
- Result either clears ADR-0005's locked rungs or documents why they stay locked.
- No bb or dispatch code changes are made before the spike reports.

## Open questions

- Does bb spawn one app-server per thread, per project, or per environment? Two were
  observed; the partition was not determined.
- Can a bb plugin subscribe to app-server events directly, or must it poll bb's CLI
  surface? Determines whether lane 1 can supply dispatch with a real event stream.
- How do the two identity models reconcile — dispatch refs/handles versus bb thread
  IDs/names — and which owns naming when a thread is visible in both?
