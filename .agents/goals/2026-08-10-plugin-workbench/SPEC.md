# Plugin Workbench execution specification

Date: 2026-08-10
Status: Ready for execution
Design record: `.agents/plans/2026-08-10-plugin-workbench-runtime.md`

## Outcome

Deliver as much of the Plugin Workbench program as current public bb 0.36
contracts permit. The independently shippable result is a self-contained
`bb-mate` runtime, a localhost Workbench UI, source-first development-target
discovery, durable authoring objects, agent-facing tools/MCP/skill surfaces,
and verified education/review workflows. If a public frontend-plugin contract
is consumable, also deliver the `bb-plugin-mate` host shell and `navPanel`
entry. If it is not, keep that shell explicitly upstream-blocked without
copying SDK code or importing `../bb`.

## Product boundary

- bb owns target-plugin scaffold, declarations, build, install, dev/reload,
  runtime, host chrome, and exact live rendering.
- BB Mate owns discovery, inspection, deterministic fixtures, the Workbench
  service and browser UI, authoring objects, captures, comparisons,
  orchestration, education, and agent handoff.
- The Workbench runtime is not a replacement runtime for plugins under
  development.
- Fixture is an approximation, Harness validates a released contract, and Live
  bb remains visual authority.

## Gate 0: released-artifact feasibility

Using isolated temporary projects/profiles and released bb 0.36 artifacts only,
produce a capability matrix with separate evidence rows for:

1. frontend `navPanel` scaffold/build;
2. backend package plus `background.service`/`onDispose` supervision;
3. native agent tool registration;
4. manifest and conditional skill registration;
5. mentions, thread panels, message actions, and composer mention/quote use;
6. path install, reload/disable/uninstall, and isolated-live proof.

Do not use the sibling checkout, copied generated types, vendored SDK code, or a
private package. Each conditional slice enters scope only when its own row is
green. Failed rows become upstream-dependent with exact evidence; successful
rows continue independently. The matrix may narrow scope but never weaken the
public-contract rule.

## Deliverable slices

1. **Standalone runtime** — compiled macOS arm64 executable with embedded lab
   assets, explicit source/standalone modes, no-global-Bun proof, deterministic
   metadata/story enumeration, and isolated binary clean-room tests.
2. **Runtime protocol** — `bb-mate serve`, port-zero launch descriptor,
   loopback-only authenticated API, health/capability/version handshake,
   graceful termination, parent-death handling, and deterministic storage.
3. **Domain model** — versioned schemas and services for development targets,
   sessions, surfaces, annotations, captures, comparisons, plugin briefs, and
   reviews, shared by CLI, HTTP, MCP, and any plugin adapter.
4. **Discovery and safety** — source-first candidates rooted in explicit project
   paths; installed inventory only reconciles identities; managed npm/git and
   builtin plugins are excluded by default; passive inspection executes no
   target code.
5. **Browser Workbench** — fast target picker, surface explorer, deterministic
   fixture states, annotations, before/after capture and comparison, review
   navigation, and honest unavailable states for Harness/Live.
6. **Agent loop** — local MCP tools/resources over the canonical domain API,
   one project-aware `plugin-workbench` skill, first-class stable object
   references for thread handoff where current public seams allow, and a paired
   prompt-to-plugin walkthrough.
7. **Host shell, conditional on Gate 0** — `bb-plugin-mate`, `navPanel` entry,
   visible Copy/Open browser handoff, checksum-verified runtime provisioning,
   serialized supervision, and isolated disable/reload/uninstall proof.
8. **Program closeout** — clean-room trial, full reviews, current issue graph,
   merged PRs, green main, candidate evidence, and draft-only release/upstream
   handoff material.

Released bb 0.36 evidence makes the conditional host path plausible: the
`bb-app` artifact contains frontend/server entrypoints, `navPanel`, typed
RPC/realtime, background service lifecycle, tools, conditional skills, mention
providers, composer mentions/quotes, thread panels, message actions, and
project/plugin inventory contracts. Gate 0 still decides consumability because
the separately installable `@bb/plugin-sdk@0.4.1` package is absent from npm.

## Required behavior

- A moved standalone executable works with an empty PATH and no readable
  checkout lab. Help, passive inspect, fixture UI, metadata, and all 13 current
  stories remain available.
- `serve --port 0 --json` emits one machine-readable launch descriptor on
  stdout; protocol logs use stderr. It binds loopback only and rejects invalid
  Host/Origin/auth/path inputs.
- All adapters operate through one versioned domain API; adapters do not own
  hidden parallel state.
- Stored paths are canonicalized against trusted roots. Mutable operations are
  explicit and narrowly authorized. Secrets never appear in URLs, logs,
  captures, or persisted project files.
- Annotation and capture metadata is deterministic and portable; screenshots
  use bounded retention while briefs and annotations are preserved by default.
- Before/after comparison is reproducible and clearly identifies fixture vs
  live provenance. Exact host-browser capture stays unavailable unless a
  released public seam exists.
- V1 captures Workbench-owned localhost documents only. Opening that URL is a
  visible Copy/Open link handoff that may honor bb's browser preference; it is
  not guaranteed automatic in-app tab control.
- Thread handoff uses released mentions, quotes, thread panels, message actions,
  and tool text/images. Generic plugin-owned draft attachments and timeline
  objects remain unavailable rather than being simulated.
- Remote/mismatched-host topology is detected and reported unavailable; V1 does
  not create an insecure proxy.
- The skill activates only for a discovered or explicitly selected development
  project and teaches the agent the fidelity and mutation boundaries.

## Quality and security constraints

- Define authenticated principals `supervisor`, `browser-session`,
  `plugin-adapter`, and `mcp-client` with least-privilege scopes. Bind every
  session, object, artifact, task, event stream, and replay handle to its
  principal, bb context, and target; opaque IDs never confer authority.
- Browser bootstrap uses a high-entropy, short-TTL, single-use code in a
  redacted opaque path. Redeem it atomically, remove it from history
  immediately, return `no-store`/`no-referrer`, and prefer a verified strict
  HttpOnly browser cookie; fall back only to a memory-only scoped header token.
  Never mint it before same-instance topology proof.
- V1 MCP support requires stdio. General Streamable HTTP, OAuth/DCR, legacy SSE,
  and remote clients are deferred. The stdio adapter uses a private authenticated
  domain connection; no HTTP MCP endpoint ships in V1.
- macOS arm64 is the first executable target. Other platforms are explicit
  unsupported states, not implied support.
- Internal proof may use unsigned exact hashes. Signing, notarization, and
  Gatekeeper proof are required before public binary distribution, outside this
  goal unless credentials and separate authority are supplied.
- Sanitize Bun re-exec/config inputs in supervised mode and disable ambient
  dotenv/bunfig behavior where standalone determinism requires it.
- Prefer an inherited private descriptor for runtime auth; otherwise use a
  mode-0600 temporary secret with unlink-after-read and crash cleanup.
- No arbitrary filesystem browsing, target-code execution during discovery,
  normal-profile mutation, Connect exposure, or sibling-checkout dependency.
- Treat target manifests and annotations as untrusted content, render them as
  text, bound bodies/images/events/logs, and keep V1 model-callable tools free
  of raw path/URL/shell/eval/auth fields and native/external/destructive actions.

## Issue and delivery model

Create focused GitHub issues beneath #21 for the slices that remain independent
after Gate 0. Use one coherent PR per mergeable slice or tightly coupled pair.
Record dependencies and upstream classification in issue bodies. When no
upstream issue exists, track a local BB Mate issue and reviewed draft proposal;
submission is not required or authorized. Update #21 so
the public roadmap describes Plugin Workbench and no longer implies the
Workbench service is a competing target-plugin runtime.

## Verification

- Iterate with focused Bun tests, contract tests, and browser tests.
- Every PR ready/merge gate runs `bun run format:check`, `bun run check`,
  `bun run test`, `bun run build`, and `bun run visual:test` when UI changes.
- Packaging/runtime gates additionally run `bun run package:inspect`, existing
  package clean-room tests, and a new empty-PATH standalone-binary lane.
- Compatibility gates run `bun run compatibility:latest` and preserve honest
  `engines.bb`/`engines.bbPluginSdk` declarations.
- Use isolated HOME/XDG/cache/prefix/plugin state for every native mutation.
- Hosted CI, review threads, issue state, and exact merged SHA are evidence,
  not inferred from local success.
- Security gates cover Host/Origin/CORS/auth matrices; bootstrap replay/history;
  principal/IDOR isolation; traversal/symlink escapes; stored XSS; PNG decode,
  hash, dimension, quota, dedupe, and reference deletion; supervisor hash,
  descriptor, crash/orphan/duplicate/shutdown behavior; MCP stdout purity,
  bounded JSON-RPC, session/replay binding, schema audit, and adapter parity;
  and fail-closed same-instance topology.

## Non-goals and stop boundaries

- Do not edit `../bb`, submit upstream issues/PRs, vendor unreleased contracts,
  publish npm versions, change npm tags, create Git tags/releases, announce a
  release, expose/pair Connect, or mutate normal user plugin state.
- Do not claim Intel, Linux, Windows, signed/notarized, Harness, Live parity, or
  generic host object attachment without direct proof.
- Do not import private browser IPC, use content scripts to reach private host
  DOM/state, or claim automatic open/focus/reuse/capture/control of bb browser
  tabs. Experimental thread-list/header APIs require a separate stability gate.
- Draft release notes and upstream proposals locally, then stop for owner
  approval before any external action.
