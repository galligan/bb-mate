# Plugin Workbench host shell and supervised runtime

Date: 2026-08-10
Status: Slice 62A merged and reconciled; slice 62B active; slice 62C planned
Issue: #62
Parent: #21
Depends on: #54, #55, #56, and #57 (all merged)

## Outcome

Ship a real `bb-plugin-mate` package whose released `navPanel` lazily
supervises the exact packaged macOS-arm64 `bb-mate` runtime. The plugin stays a
thin public-contract adapter; the runtime owns its protocol and canonical
state. Missing, tampered, incompatible, or unsupported artifacts remain
actionable unavailable states and spawn nothing.

## Delivery shape

Deliver #62 as three merge-first slices:

1. **62A — supervised runtime protocol.** Add a standalone-safe `serve`
   command, one private inherited supervisor/liveness channel, a bounded public
   launch descriptor, authenticated capability handshake, and deterministic
   shutdown/orphan proof.
2. **62B — installed Plugin Workbench host.** Add `plugins/mate`, exact runtime
   package/stamp verification, installed-root resolution, lazy serialized
   supervision, released `navPanel`, skill, isolated bb 0.36 lifecycle proof,
   and an explicit target-admission-unavailable state.
3. **62C — runtime-owned target admission.** Admit only the current project's
   released-bb source through a private authenticated composition path, persist
   canonical source-first targets in the runtime catalog, and return only
   authorized opaque target projections to the plugin.

Issue #62 closes only after all three slices merge and reconcile. The third
slice is required because 62A intentionally exposes `targets: false`, opens no
catalog, and admits no trusted source path; 62B must not fill that gap with a
parallel inspection command or plugin-owned state.

## 62A protocol contract

- `bb-mate serve --port 0 --json --parent-pid <pid> --supervisor-fd 3` is the
  only supervised entrypoint. The host is fixed internally to numerical
  `127.0.0.1`; supervised mode exposes no caller-selected host option. It
  bypasses passive target inspection and rejects host overrides, missing JSON
  mode, invalid FDs, and unexpected positional targets.
- FD 3 carries one strict, bounded JSON line with schema/runtime/API
  expectations, a 32-byte base64url credential, principal ID, and bb-context
  ID. The writer keeps that same pipe open; extra bytes are a protocol error and
  EOF is the primary parent-death signal. No secret enters argv, environment,
  URLs, files, descriptor, stdout, stderr, or logs.
- Parent PID monitoring is secondary to liveness EOF. Signal, EOF, parent
  disappearance, startup failure, and normal shutdown converge on one
  idempotent graceful-stop path.
- Bind exact numerical `127.0.0.1`; port zero selects the listener port. Emit
  exactly one UTF-8 JSON descriptor line on stdout, bounded to 8 KiB, with exact
  schema/runtime/API versions, child PID, opaque runtime-instance ID, exact
  loopback base URL, and the finite capability document. Human diagnostics use
  bounded redacted stderr only.
- `GET /healthz` remains constant and unauthenticated. `GET
/v1/capabilities` requires the supervisor bearer and returns metadata and
  capabilities exactly matching the descriptor. Host/Origin/body/concurrency
  rules remain those of the runtime foundation. No target, browser bootstrap,
  MCP, object mutation, static UI, SSE, or WebSocket route is added.
- Compile with ambient dotenv/bunfig disabled. Managed launch clears
  `BUN_BE_BUN` and `BUN_OPTIONS`; direct invocation cannot claim protection
  from a parent that sets `BUN_BE_BUN` before app code.

## 62B host/package contract

- `plugins/mate` is `bb-plugin-mate` with `engines.bb >=0.36` and
  `engines.bbPluginSdk ^0.4.1`, released `navPanel`, backend
  `background.service`/`onDispose`, and a project-scoped skill. Harness remains
  unavailable while the public SDK package is E404.
- Build stages only `runtime/darwin-arm64/{bb-mate,manifest.json}` from the
  exact deterministic standalone output. Independent fresh-process builds in
  the workspace and a frozen checkout must be byte-identical; the compiler
  graph uses only a repository-relative virtual entry key and imports. The npm allowlist is exact and package
  inspection proves stamped frontend/backend artifacts, skill/docs, executable
  mode 0755, Mach-O arm64, size, version, API, SHA-256, and absence of source,
  node_modules, symlinks, traversal, or extra entries.
- The staged manifest remains `private: true`, includes the exact pinned Bun
  1.3.14 `LICENSE.md` bytes as `BUN_LICENSE.md`, and describes Bun's embedded
  LGPL-linked components accurately. The tgz is a local verification artifact,
  not approved for upload, registry publication, release, or external
  redistribution until issue #77's LGPL relink-material and complete
  third-party-license gate passes.
- The backend embeds the expected runtime SHA/size/arch/version/API plus the
  exact bounded runtime-manifest byte size and SHA-256. It resolves
  only the literal runtime path relative to built `import.meta.url`, verifies
  containment and identity immediately before spawn, and never consults cwd,
  PATH, HOME, inventory, Bun, bunx, or a global `bb-mate`.
- One lazy supervisor state machine serializes `ensure`/reuse/stop. Plugin load
  alone starts no process or listener. Concurrent nav/RPC demand shares one
  start. `background.service` owns capped crash restart; deterministic artifact
  failures become `NeedsConfigurationError`, not a custom restart loop.
- Spawn one process group with a minimized environment and inherited private
  channel. Enforce descriptor byte/time/schema/version/PID/base-URL/capability
  limits, then perform the authenticated capability handshake. Abort,
  `onDispose`, reload, disable, remove, server shutdown, crash, and orphan paths
  terminate the owned group and listener within a bounded grace/force window.
- Treat only a readable supervisor-channel `end` as normal liveness EOF; a
  close-only destruction is an error. Run the standalone supervision proof
  under an absolute pre-resolved Node executable so its extra-FD ownership
  matches the installed plugin rather than Bun's incompatible pipe wrapper,
  and await both frame delivery and writer teardown between sequential lanes.
- Frontend/RPC status and ensure inputs are strict empty objects. Runtime startup
  is project-independent in 62B because this slice admits no project source;
  project/source binding begins only when 62C can consume it. Projections contain
  only finite status enums, versions, and non-secret opaque context facts. Target discovery is explicitly unavailable
  pending 62C. Projections contain no
  paths, PID, hostname, command, environment, secret, bearer, base URL, browser
  URL, Connect fact, or topology conclusion. Browser launch stays visibly
  unavailable until #70.
- The panel status is an on-mount and post-action snapshot for 62B, not a
  realtime monitor; a later crash is observed on remount or the next explicit
  action until a released host subscription or bounded refresh is deliberately
  added.
- Package clean rooms build their own bounded temporary standalone through fresh
  child processes and thread that exact root through build, archive inspection,
  installed-cache inspection, and managed lifecycle proof. Hostile archive
  fixtures are emitted as canonical ustar bytes in JavaScript rather than
  depending on BSD/GNU tar option or padding behavior.

## TDD execution

1. [x] Add strict supervisor-frame and launch-descriptor contracts with bounds,
       unknown-field rejection, secret redaction, and version/capability
       equality tests.
2. [x] Add `serve` argument handling and ensure it bypasses inspection, binds
       only numerical loopback/port zero, prints one descriptor line, and keeps
       logs on stderr.
3. [x] Add bearer authentication, FD liveness, parent/signal shutdown, bounded
       request handling, and idempotent listener cleanup tests.
4. [x] Extend the moved empty-PATH standalone clean room to prove the private
       channel, descriptor/capability handshake, EOF/orphan cleanup, no checkout
       assets, and no leaked secret.
5. [x] Run focused, aggregate, package, standalone, hosted, and two independent
       5/5 review lanes; merge and reconcile 62A.
6. [x] Scaffold `plugins/mate` only from released 0.36 artifacts; add the exact
       package stamp/allowlist/resolver and adversarial pack/extract tests.
7. [x] Add the lazy supervisor, status RPC, released nav panel, and skill with
       race/crash/dispose/unavailable tests and no browser-launch claim.
8. [x] Prove the extracted package in a disposable bb 0.36 profile: install,
       idle-before-demand, one child, reload, disable, enable/redemand, crash,
       remove, graceful shutdown, forced parent loss, no orphan/listener, and
       no normal-profile mutation.
9. [ ] Run full local/hosted gates and two 5/5 review lanes; merge and reconcile
       62B while keeping #62 open.
10. [ ] Add, review, merge, and reconcile 62C runtime-owned current-project
        source admission and authorized opaque target listing; then close #62
        and update #21.

## Verification

- Focused CLI/runtime/protocol/supervisor/package/frontend tests while
  iterating.
- `bun run format:check && bun run check && bun run test && bun run build`
- `bun run visual:test` for 62B UI changes.
- `bun run compatibility:latest`
- `bun run package:inspect && bun run package:test`
- `bun run standalone:inspect && bun run standalone:test`
- Native `bb plugin types --check`, `bb plugin build`, exact tar inspection, and
  a disposable local-registry `npm:` install of the extracted managed package.
  Released bb intentionally retains immutable managed artifact bytes for later
  garbage collection after removal, so the proof requires those bytes to stay
  inert and hash-identical while registration, runtime, listener, and
  credentials are removed.
- Exact-head hosted checks, zero review threads, 5/5 standing and targeted
  reports, immutable merge SHA, and clean GitButler reconciliation per slice.

## Stop conditions

Stop before PATH/Bun/bunx fallback, chmod/postinstall repair, unsupported
platform claims, browser credentials or secret-bearing URLs, automatic host
browser control, target execution, native target lifecycle mutation, Connect,
MCP, publication/release/signing, upstream submission, or normal-profile
mutation. Stop 62B launch work if 62A is not merged or if packaged hash, mode,
architecture, installed-root containment, descriptor handshake, or cleanup
proof fails.

## Done

All three slices are merged to `main`; #62 and #21 are current; exact local, hosted,
package, standalone, and isolated lifecycle gates pass; two independent review
lanes score 5/5 with zero P0-P3 per slice; GitButler is clean/reconciled; and
the goal retrospective records exact proof without crossing release or browser
bootstrap boundaries.
