# Plugin Workbench and `bb-mate` runtime specification

Date: 2026-08-10  
Status: Proposed; research complete, implementation goal not started  
Primary roadmap: [galligan/bb-mate#21](https://github.com/galligan/bb-mate/issues/21)  
Compatibility baseline: `bb-app@0.36.0`, `@bb/plugin-sdk@0.4.1`  
Related open work: [#41](https://github.com/galligan/bb-mate/issues/41),
[#42](https://github.com/galligan/bb-mate/issues/42),
[#43](https://github.com/galligan/bb-mate/issues/43),
[#45](https://github.com/galligan/bb-mate/issues/45), and
[#46](https://github.com/galligan/bb-mate/issues/46)

## Outcome

Ship **Plugin Workbench** as an installable bb plugin backed by a
self-contained `bb-mate` executable. A plugin author should be able to open the
Workbench from bb's top-level sidebar, see only source plugins they are actually
developing, explore the public plugin surface catalog, collaborate with an
agent on a plugin brief, run a deterministic browser workbench, record semantic
annotations and before/after captures, and move durable Workbench objects into
the current thread.

The `bb-mate` runtime is the single engine behind the browser UI, Plugin
Workbench, CLI, bb-native agent tools, and MCP. Native bb remains authoritative
for plugin scaffolding, declaration refresh, build, install, update, dev/reload,
host UI, and live plugin execution.

## Executive decisions

1. The user-facing bb plugin is named **Plugin Workbench**. Its proposed package
   name is `bb-plugin-mate`; its backend executable remains `bb-mate`.
2. `bb-mate` becomes a true self-contained executable. The current npm package
   is a bundled Bun script plus static assets, not a standalone executable.
3. Plugin Workbench supervises an exact compatible `bb-mate` binary. A global
   `bb-mate` installation is optional, never required.
4. The runtime domain API is canonical. The browser, plugin RPC handlers,
   native agent tools, MCP server, and CLI are adapters over the same services.
5. Development targets are discovered from trusted source roots. Installed
   plugin inventory enriches those targets but never populates the default
   development list.
6. The top-level `navPanel` is the Workbench home, education, and session-control
   surface. The visual lab remains a localhost page opened in bb's browser.
7. Page-owned annotations and captures are deliverable downstream. Exact host
   browser capture and arbitrary plugin-owned thread objects remain optional
   upstream enhancements, not blockers for the first goal.
8. Workbench state is represented by first-class domain objects with stable,
   opaque IDs and compact thread references.
9. Start with one substantial `plugin-workbench` skill. Split it only after
   usage proves distinct instruction sets are needed.
10. The first supported topology is same-machine bb desktop/server/runtime.
    Remote-host support must be detected and reported honestly until bb exposes
    a supported tunnel or browser-control contract.

## Why this is not a competing plugin runtime

The word “runtime” refers to the Plugin Workbench service: it serves fixture
pages, inspects supported metadata, stores Workbench objects, coordinates
captures, and exposes agent adapters. It does **not** load or execute target
plugin entrypoints as a substitute for bb.

| Native bb owns                                 | `bb-mate` owns                                         |
| ---------------------------------------------- | ------------------------------------------------------ |
| Plugin scaffold and dependency setup           | Source discovery and passive inspection                |
| SDK declarations and build toolchain           | Deterministic surface catalog and fixtures             |
| Install, update, remove, dev/reload            | Workbench sessions and browser launch descriptors      |
| Plugin server/frontend execution               | Semantic annotations, captures, and comparisons        |
| Host routing, chrome, state, and exact visuals | Compatibility explanations and native handoffs         |
| Live runtime and browser internals             | CLI, MCP, and plugin-tool adapters over Workbench data |

Fixture remains an approximation, Harness remains the official public behavior
contract when distributed, and Live bb remains the visual authority.

## Verified baseline

### Repository and release state

- The GitButler workspace was clean on 2026-08-10.
- The applied compatibility branch is `feat/bb-compatibility/adopt-0-36`; PR
  [#52](https://github.com/galligan/bb-mate/pull/52) is ready, mergeable, and
  green at hosted head `9bcd96305804c06a88816b796ae7a1fc0669990b`.
- npm stable `bb-app` is `0.36.0`.
- npm publishes `bb-mate@0.1.0-alpha.1` and `0.1.0-alpha.2`; `alpha` points to
  alpha.2 and `latest` to alpha.1.
- Upstream SDK distribution issue
  [get-bb/bb#1134](https://github.com/get-bb/bb/issues/1134) and scaffold
  production-dependency issue
  [get-bb/bb#1133](https://github.com/get-bb/bb/issues/1133) remain open.

This spec must be reconciled with `main` after PR #52 lands. It must not be
folded into or change the scope of PR #52.

### Current BB Mate package

`scripts/build-local-package.ts` currently runs:

```sh
bun build apps/cli/src/bin.ts --target=bun --minify --outfile apps/cli/dist/cli.js
```

The public package contains `dist/cli.js` and `dist/lab/**`. Its manifest
declares `engines.bun >=1.3.14`. The installed executable therefore still
requires Bun.

### Disposable compile probe

Research on 2026-08-10 ran the current entrypoint through:

```sh
bun build apps/cli/src/bin.ts --compile --minify --outfile <temp>/bb-mate
```

Observed results:

- compilation completed successfully;
- output was a 61 MB arm64 Mach-O executable;
- `bb-mate --help` worked;
- passive inspection worked against bb 0.36.0;
- `bb-mate dev` failed as a compiled program;
- `import.meta.url`-relative packaged-lab detection did not find a lab copied
  beside the executable;
- the fallback source path treated `process.execPath` (the compiled `bb-mate`
  itself) as the Bun executable, so it re-executed itself with `run --cwd` and
  rejected the option.

Conclusion: adding `--compile` is necessary but insufficient. The compiled
entrypoint needs explicit runtime/source mode separation, executable-relative
asset resolution or embedded assets, and a no-Bun clean-room service test.

### Current bb plugin surfaces

The public 0.36 SDK supports the relevant building blocks:

- `navPanel`, rendered as a top-level sidebar row beside Extensions and other
  plugin panels; rows are reorderable and hideable;
- settings, homepage, thread-panel, sidebar-footer, message-action,
  message-directive, file-opener, experimental thread-header, and experimental
  thread-list surfaces;
- composer actions, banners, plus-menu items, and mentions;
- plugin RPC and realtime signals;
- background services and schedules;
- plugin-native agent tools, manifest skills, and per-project agent
  configuration;
- plugin source inspection, reload, install, enable, and disable through the
  public bb SDK.

Important gaps in the released contract:

- no plugin API explicitly opens/focuses/reuses an in-app browser tab;
- no public plugin API captures or controls a browser `WebContentsView`;
- no annotation-enricher registration surface was found;
- no generic user-authored plugin object attachment exists for threads;
- a `messageDirective` is an assistant/nested-agent rendering surface, not a
  general user-message attachment;
- `bb plugin dev` is native CLI behavior, not a public SDK method for starting
  and supervising a dev loop.

Ordinary HTTP links currently follow the user's in-app-browser preference and
default to the bb browser on desktop. The first release may use that behavior,
but should label it as a launch handoff rather than a guaranteed browser-control
contract.

### Current bb browser direction

The upstream `plans/bb-browser.md` proposes `bb browser open/list/snapshot/click/
type/eval/close` over explicitly owned browser targets. Its status is “not
started” in the inspected checkout. The plan correctly rejects a production
remote-debugging-port integration and keeps Electron internals host-owned.

Plugin Workbench should adopt that public CLI/API if and when it ships. It must
not import `@bb/desktop-contract`, reach into Electron preload objects, or expose
a CDP port as a local substitute.

## Scope

### In scope for the downstream goal

- A compiled, self-contained `bb-mate` executable for the supported native
  host, with a reviewable platform expansion path.
- A versioned loopback runtime API and supervised process lifecycle.
- Source-first development-target discovery and installed-source reconciliation.
- The `bb-plugin-mate` Plugin Workbench package and its supported bb surfaces.
- Workbench sessions, annotations, captures, comparisons, plugin briefs, and
  review collections.
- A browser-owned annotation/capture bar for deterministic Fixture pages.
- Compact references into threads through the best released plugin surfaces.
- Native bb agent tools and one project-aware `plugin-workbench` skill.
- An MCP adapter over the runtime API.
- Surface Explorer and an agent-paired prompt-to-plugin walkthrough.
- Focused, aggregate, clean-room, security, accessibility, visual, and isolated
  live-bb verification.
- Documentation, issue decomposition, review evidence, and a goal packet.

### Out of scope for the downstream goal

- Editing `../bb` or importing any private bb application/browser contract.
- Reimplementing scaffold, build, install, update, dev/reload, or target plugin
  execution.
- Copying `@bb/plugin-sdk/testing` or claiming Harness availability before its
  public distribution is usable.
- Exact capture/control of arbitrary bb browser tabs without a public contract.
- A remote debugging port or broad arbitrary-JavaScript agent tool.
- Automatically treating managed npm/Git/builtin installations as development
  targets.
- Remote-host proxy/tunnel invention.
- Publishing `bb-plugin-mate`, publishing a new `bb-mate`, changing npm tags,
  creating a GitHub release/tag, or announcing the work without separate owner
  approval.
- Automatically creating or submitting upstream proposals.

## Product language

Use these names consistently:

| Name              | Meaning                                                        |
| ----------------- | -------------------------------------------------------------- |
| Plugin Workbench  | Installed bb plugin and user-facing product surface            |
| `bb-plugin-mate`  | Proposed npm identity of Plugin Workbench                      |
| BB Mate           | Project/repository and broader authoring companion             |
| `bb-mate`         | Runtime executable and CLI                                     |
| Workbench runtime | Local `bb-mate serve` process, never the target plugin runtime |
| Surface Explorer  | Educational catalog of public plugin contribution surfaces     |
| Workbench object  | Session, annotation, capture, comparison, brief, or review     |

Avoid “Mate plugin” in public UI where “Plugin Workbench” is clearer. “Powered
by bb-mate” is appropriate in diagnostics and runtime settings.

## System architecture

```text
┌──────────────────────────────── bb ────────────────────────────────┐
│                                                                    │
│  Plugin Workbench navPanel      Thread/composer/message surfaces   │
│              │                              │                      │
│              ├──────── public plugin RPC/realtime ─────────────┐   │
│              │                                                 │   │
│  Native agent tools + skill                                    │   │
│              │                                                 │   │
└──────────────┼─────────────────────────────────────────────────┼───┘
               │                                                 │
               ▼                                                 ▼
       Plugin backend/supervisor ───────────► bb-mate runtime API
                                                         │
            ┌────────────────────────────────────────────┼──────────┐
            │                                            │          │
            ▼                                            ▼          ▼
   localhost Workbench page                      MCP adapter      CLI
   in bb's built-in browser
```

The runtime is the sole owner of domain behavior. Adapters validate and
translate context; they do not create their own target/session/object stores.

## Runtime executable and distribution

### Executable contract

The runtime command surface should grow without breaking the existing commands:

```text
bb-mate inspect [path] [--json]
bb-mate dev [path] [--host 127.0.0.1] [--port 5173]
bb-mate check [path]
bb-mate live [path]
bb-mate serve [path] [--host 127.0.0.1] [--port 0] [--json]
bb-mate mcp [--stdio | --runtime <descriptor>]
```

`dev` remains the foreground human CLI. `serve` is the supervised service
entrypoint and must:

- default to `127.0.0.1` and port `0`;
- accept a trusted-root target path only from the spawning process, never from a
  browser query string;
- accept `--parent-pid` and exit after the supervisor disappears;
- accept an authentication secret by 0600 file descriptor/path, not a URL;
- emit one JSON launch descriptor on stdout, then reserve stdout for protocol
  output when requested;
- send human logs to stderr;
- handle SIGINT/SIGTERM and abort active work cleanly;
- report `version`, `apiVersion`, `pid`, `baseUrl`, target identity, and
  capabilities;
- refuse an incompatible plugin/runtime API handshake.

Example descriptor:

```json
{
  "schemaVersion": 1,
  "runtimeVersion": "0.2.0",
  "apiVersion": 1,
  "pid": 12345,
  "baseUrl": "http://127.0.0.1:53122",
  "capabilities": {
    "annotations": true,
    "captures": true,
    "comparisons": true,
    "harness": false,
    "liveBrowserCapture": false
  }
}
```

Do not include bearer tokens or filesystem paths in the descriptor logged to a
normal terminal. A supervisor-only descriptor may carry the authentication-file
path over a private pipe.

### Asset strategy

The first implementation must choose one of these verified approaches:

1. Import the Workbench HTML entry into a Bun full-stack executable so Bun
   embeds the frontend asset graph.
2. Generate an explicit embedded asset manifest and serve the byte payloads from
   the executable.

Shipping a binary beside an untracked `dist/lab` directory is not considered
self-contained. Preserve deterministic story enumeration and content hashing in
either design.

### Plugin provisioning

For the first macOS release, `bb-plugin-mate` should include the exact compatible
runtime artifact in its package allowlist. The plugin backend resolves the
runtime relative to its installed package root and verifies a recorded SHA-256
before launch.

This avoids:

- a hidden global npm mutation;
- PATH ambiguity;
- plugin/runtime version skew;
- network dependency after plugin installation;
- a separate first-run package-manager prompt.

A later multi-platform distribution may use platform-specific optional packages
selected by a small package-owned resolver. Do not add that abstraction until a
second supported native platform is real.

### `bunx` fallback

If the packaged binary is missing or unsupported and `bun` is already
available, Plugin Workbench may offer an explicit recovery action using the
plugin's exact compatible version:

```sh
bunx bb-mate@<exact-version> serve ...
```

This is not the normal path and not a fallback for machines without Bun. The UI
must explain network use, selected version, and how to copy the command instead
of executing it automatically.

### Lifecycle and updates

- The plugin registers one background supervisor service.
- Opening Plugin Workbench ensures one compatible runtime per bb server/user
  context, reusing a healthy process.
- Runtime startup is lazy; plugin load alone should not start a listener.
- The supervisor serializes start/stop/restart and prevents duplicate processes.
- Plugin reload/disable/shutdown aborts the service and terminates its child.
- Runtime crashes use bounded restart behavior; repeated failures become a
  visible diagnostic, not an infinite loop.
- Plugin updates carry their compatible runtime. No independent silent runtime
  auto-updater exists in V1.
- Uninstall removes the packaged executable. User-created Workbench data is
  preserved by default and may be deleted only through an explicit destructive
  action.

## Runtime domain API

The internal domain service is transport-neutral. HTTP and MCP adapters call
typed service methods rather than each other.

Minimum HTTP surface:

```text
GET    /healthz
GET    /v1/capabilities
GET    /v1/targets
POST   /v1/sessions
GET    /v1/sessions/:id
PATCH  /v1/sessions/:id/state
GET    /v1/sessions/:id/annotations
POST   /v1/sessions/:id/annotations
GET    /v1/annotations/:id
POST   /v1/sessions/:id/captures
GET    /v1/captures/:id
POST   /v1/comparisons
GET    /v1/comparisons/:id
POST   /v1/briefs
GET    /v1/briefs/:id
GET    /v1/events
```

The exact HTTP routes are not a public stability promise until documented as
such. Domain object schemas and `apiVersion` are the compatibility contract.

Use realtime events for status reconciliation and interaction convenience, not
as the only source of truth. The plugin and page must refetch after reconnect.

## Development-target model

### Discovery rule

> Source discovery creates candidates. Native installation provenance describes
> candidates. Installation inventory never creates default candidates.

Trusted candidate sources, in order:

1. A manifest at or beneath the current thread environment's workspace root.
2. Other ordinary plugin packages beneath that same bounded root.
3. An explicit path selected by the user and recorded as an opaque recent target.
4. A previously pinned development root that still passes containment and
   manifest validation.

Never recursively scan the user's home directory or derive arbitrary browser-
supplied paths.

### Installation reconciliation

For each discovered source candidate, compare canonical identity against native
bb's public source report:

| Native source                        | Development interpretation                                      |
| ------------------------------------ | --------------------------------------------------------------- |
| Exact matching `path:` realpath      | Ready for native live handoff                                   |
| Different `path:`                    | Source mismatch; show both safe labels, require explicit relink |
| `npm:` or `git:` with same plugin ID | Managed copy installed; source is not linked                    |
| Builtin with same ID                 | Reserved/conflicting identity                                   |
| Not installed                        | Fixture/inspection ready; show native path-install handoff      |

Do not remove/reinstall a managed or path plugin automatically. Removal can
delete plugin settings, schedules, and secrets. Provide native commands and
explain consequences.

### Target object

```ts
interface DevelopmentTarget {
  id: string; // opaque
  displayName: string;
  displayPath: string; // redacted/relative
  manifest: {
    pluginId: string;
    version: string;
    hasServer: boolean;
    hasApp: boolean;
  };
  workspace: {
    projectId?: string;
    environmentId?: string;
    rootKey: string;
  };
  native: {
    status: "exact-path" | "other-path" | "managed" | "builtin" | "absent";
    pluginId?: string;
  };
  capabilities: {
    fixture: boolean;
    harness: boolean;
    live: boolean;
  };
}
```

No serialized browser/API representation includes an absolute source root.

## Plugin Workbench bb surfaces

### Top-level `navPanel`

This is the primary destination and should contain:

- **Continue developing**: current target, active session, recent source
  targets, and unresolved reviews;
- **Create a plugin**: agent-paired walkthrough, prompt-to-plugin handoff, and
  Surface Explorer;
- runtime health/version and a quiet setup diagnostic;
- Fixture/Harness/Live capability truth;
- explicit source-versus-installed status;
- a launch/focus action for the localhost Workbench.

It must not render the full mock bb interface inside the plugin route.

### Thread surfaces

| Surface                           | Use                                                                       |
| --------------------------------- | ------------------------------------------------------------------------- |
| Experimental thread-header action | Open/focus the Workbench session for this thread                          |
| Thread-panel action               | Session state, compatibility, annotations, captures, and review checklist |
| Composer plus-menu                | Insert a Workbench object reference or start a guided capture             |
| Mention provider                  | Search annotations, captures, comparisons, briefs, and surfaces           |
| Message action                    | Open a referenced object or send selected feedback into a session         |
| Message directive                 | Rich assistant-authored Workbench cards                                   |
| Settings section                  | Runtime path/version/status, storage, fallback, diagnostics, and privacy  |

Use the experimental thread-header surface only behind an honest bb version
gate. The stable thread-panel action is the fallback.

### Agent surfaces

- Register a small set of native tools that call the runtime API.
- Use plugin agent configuration to expose them only when the project contains
  or explicitly selects a development target.
- Include the `plugin-workbench` skill in the plugin package.
- Do not expose generic shell, filesystem, browser-eval, or target-plugin
  execution tools.

### Surfaces intentionally deferred

- Content scripts do not reach the native browser `WebContentsView` and are not
  part of the annotation bridge.
- Homepage content is optional and should not duplicate the top-level panel.
- A file opener is useful only if a durable exported Workbench file format gains
  a real second workflow.
- Replacing the bb thread list is unrelated to Plugin Workbench itself.

## Browser and annotation loop

### Downstream V1

The Workbench page owns the annotation interaction because it owns the rendered
Fixture DOM. The bb browser is the viewport.

1. Plugin Workbench creates or resumes a thread-associated session.
2. The runtime issues an authenticated one-time browser bootstrap URL.
3. A normal HTTP link opens according to bb's browser preference.
4. The Workbench page exchanges the one-time token for a strict same-site
   session cookie and removes the token-bearing path from history.
5. The user or agent selects a surface/scenario/theme/viewport.
6. Inspect mode highlights Workbench-owned DOM and captures semantic metadata.
7. The user adds a comment/severity and creates an annotation.
8. The runtime persists the annotation and broadcasts its opaque ID.
9. The plugin inserts or renders a compact reference in the thread.
10. An agent resolves full evidence through a native tool or MCP resource.

Do not place bearer tokens in query parameters, fragments copied into chat, or
referrers.

### Annotation schema

```ts
interface WorkbenchAnnotation {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  createdAt: string;
  author: { kind: "user" | "agent"; displayName?: string };
  target: {
    developmentTargetId: string;
    surfaceId: string;
    scenarioId: string;
    mode: "fixture" | "harness" | "live";
    stateUrl: string;
    theme: string;
    viewport: { width: number; height: number; deviceScaleFactor: number };
  };
  selection: {
    bounds: { x: number; y: number; width: number; height: number };
    role?: string;
    accessibleName?: string;
    states?: string[];
    diagnosticDomPath?: string;
    componentName?: string;
    source?: { displayPath: string; line?: number };
    tokens?: Record<string, string>;
  };
  feedback: {
    comment: string;
    severity?: "note" | "minor" | "major" | "blocking";
    desiredBehavior?: string;
  };
  evidence: {
    captureId?: string;
    elementCropId?: string;
    compatibilityReportId?: string;
  };
  status: "open" | "addressed" | "verified" | "wont-fix";
}
```

DOM paths are diagnostic and never the durable identity of an element. Stable
surface/scenario/object IDs and normalized bounds are canonical.

### Agent-assisted navigation

Domain tools should support bounded operations such as:

- list and describe surfaces;
- open a known surface/scenario;
- switch theme/viewport/mode;
- focus a known annotation;
- list unresolved annotations;
- request a Fixture capture;
- compare two compatible captures;
- prepare a review summary.

Do not ship unrestricted JavaScript evaluation. When bb's scoped browser API
exists, adopt its owned-target model rather than inventing a second automation
channel.

## Captures and comparisons

### Capture object

```ts
interface WorkbenchCapture {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  createdAt: string;
  fidelity: "fixture" | "harness" | "live";
  state: {
    surfaceId: string;
    scenarioId: string;
    stateUrl: string;
    theme: string;
    viewport: { width: number; height: number; deviceScaleFactor: number };
  };
  revision?: { kind: "worktree" | "git"; label: string; sha?: string };
  image: {
    artifactId: string;
    mediaType: "image/png";
    width: number;
    height: number;
    sha256: string;
  };
  label?: string;
}
```

### Comparison object

```ts
interface WorkbenchComparison {
  schemaVersion: 1;
  id: string;
  beforeCaptureId: string;
  afterCaptureId: string;
  diffCaptureId?: string;
  changedPixelRatio?: number;
  annotationIds: string[];
  summary?: string;
  verdict?: "improved" | "regressed" | "changed" | "no-visible-change";
}
```

A strict pixel comparison requires matching surface, scenario, fidelity, theme,
viewport, DPR, font set, motion preference, locale, and timezone. Mismatches
must fail or produce a clearly labeled non-pixel side-by-side comparison.

### Fidelity

- Fixture capture is deterministic regression evidence, not live proof.
- Harness capture becomes available only through the official public testing
  package and an upstream-backed adapter.
- Live capture is authoritative only when a supported bb browser/snapshot API
  captures the real host surface.

The first goal should not bundle a full browser solely for screenshots. Prefer
Workbench-page capture for Fixture and adopt bb's public snapshot path when it
ships. If page capture cannot faithfully render a surface, mark capture
unavailable instead of overstating it.

## First-class Workbench objects

### Domain objects

| Object              | Purpose                                               | Thread-worthy      |
| ------------------- | ----------------------------------------------------- | ------------------ |
| `DevelopmentTarget` | Source and native-provenance relationship             | Usually indirect   |
| `WorkbenchSession`  | Target and current preview state                      | Summary            |
| `Surface`           | Public plugin contribution contract                   | Usually in a brief |
| `Annotation`        | Semantic visual feedback                              | Yes                |
| `Capture`           | Immutable visual evidence                             | Yes                |
| `Comparison`        | Before/after and optional diff                        | Yes                |
| `PluginBrief`       | Intent, surfaces, trust, states, and acceptance       | Yes                |
| `Review`            | Collection of annotations/comparisons and disposition | Yes                |

Every thread-worthy object exposes a compact reference:

```ts
interface WorkbenchObjectReference {
  schemaVersion: 1;
  kind:
    | "session"
    | "annotation"
    | "capture"
    | "comparison"
    | "plugin-brief"
    | "review";
  id: string;
  title: string;
  summary: string;
  resourceUri: string; // bb-mate://<kind>/<id>
  snapshot: { createdAt: string; status?: string };
}
```

The runtime holds the full object. The thread reference contains enough
immutable summary to remain intelligible when the runtime is offline.

### Released-SDK thread path

Until bb has generic plugin objects:

- a mention provider supplies user-authored typed references;
- the composer plus-menu inserts the selected mention/reference;
- native agent tools resolve it;
- assistant responses may emit a Workbench `messageDirective` card;
- message actions reopen the object in the thread panel or Workbench.

Do not pretend that this is a native attachment. Document the limitation.

### Proposed upstream thread-object seam

After the downstream object model proves useful, propose a generic API similar
to:

```ts
composer.attachPluginObject({
  kind: "bb-mate.annotation",
  id,
  title,
  summary,
  icon: "MessageSquare",
});

app.slots.threadObject({
  kind: "bb-mate.annotation",
  component: AnnotationCard,
});
```

Desired properties: visible before send, usable in user and assistant messages,
durable across reload/fork/quote, typed in agent context, safe fallback when the
plugin is disabled, and no unbounded plugin JSON embedded into provider prompts.

## MCP and agent integration

### Architecture rule

MCP is an adapter, not a second store or lifecycle manager. It calls the same
domain services as native plugin tools and CLI commands.

### MCP resources

```text
bb-mate://targets/<id>
bb-mate://surfaces/<id>
bb-mate://sessions/<id>
bb-mate://annotations/<id>
bb-mate://captures/<id>
bb-mate://comparisons/<id>
bb-mate://briefs/<id>
bb-mate://reviews/<id>
```

Resources return bounded structured data and resource links for binary images.
Absolute source roots, secrets, bearer tokens, and raw environment dumps are
excluded.

### MCP/native tools

Start read-heavy:

```text
workbench_list_development_targets
workbench_get_target
workbench_list_surfaces
workbench_describe_surface
workbench_get_session
workbench_set_preview
workbench_list_annotations
workbench_get_annotation
workbench_capture_fixture
workbench_compare_captures
workbench_prepare_plugin_brief
```

Classify operations:

| Class                    | Examples                                      | Policy                                         |
| ------------------------ | --------------------------------------------- | ---------------------------------------------- |
| Read                     | inspect target, list surfaces, get annotation | Model may call                                 |
| Session-local reversible | set scenario/theme/viewport, focus annotation | Model may call with visible status             |
| Artifact creation        | capture, comparison, brief draft              | Model may call; record provenance              |
| Native mutation          | build, install, dev/reload                    | Explicit user gesture/approval; delegate to bb |
| External/thread mutation | send object, publish, create issue            | Never infer authority                          |

### Transports

- `bb-mate mcp --stdio` lets an MCP client launch an adapter process.
- V1 MCP delivery is stdio only. The adapter authenticates to the canonical
  domain service over a private local connection; it does not expose HTTP MCP.
- General Streamable HTTP MCP, OAuth/DCR, and legacy SSE are deferred until a
  separate security/conformance contract proves request auth, Origin handling,
  principal-bound sessions, and replay isolation.

### `plugin-workbench` skill

The plugin package should include one skill teaching agents:

- source-first target discovery and provenance reconciliation;
- the public surface catalog and intent-based selection;
- Fixture/Harness/Live claims;
- Workbench navigation and annotation tools;
- before/after capture discipline;
- native bb scaffolding/build/install/dev ownership;
- safe handling of paths, secrets, network, and full-trust plugins;
- the agent-paired plugin walkthrough;
- how to record a Plugin Brief and verification evidence;
- when an unavailable public contract must stop the workflow.

Activate tools/skills only for a project with a discovered or explicitly
selected development target. Do not inject Workbench instructions into every bb
thread globally.

## Surface Explorer and plugin-design walkthrough

### Surface Explorer

Turn the existing 13-surface catalog into an educational product rather than a
raw API list. Group by user intent:

1. Find or enter something: nav panel, homepage section, sidebar action.
2. Work within a thread: thread header, thread panel, pending interaction.
3. Extend composing and conversation: composer, mention, message action,
   message directive.
4. Open content: file opener.
5. Run background behavior: service, realtime, agent tool, skill.

Each surface page includes:

- what problem it solves and when not to use it;
- where it appears in bb;
- host-owned versus plugin-owned chrome;
- public props/context and version/experimental status;
- layout, accessibility, trust, and failure constraints;
- deterministic scenarios and a live Fixture preview;
- applicable Harness/Live coverage;
- concise example patterns and upstream source links;
- “Use this surface in my brief.”

The catalog remains generated/validated against the recorded public contract so
education does not silently drift from support.

### Agent-paired walkthrough

1. **Intent** — What should become easier inside bb?
2. **User and moment** — Who needs it, and in which bb context?
3. **Surface recommendation** — Agent proposes the smallest supported surface
   set and explains tradeoffs.
4. **State design** — User and agent explore deterministic loading, empty,
   success, failure, compact, and accessibility states.
5. **Trust review** — Filesystem, network, secrets, background work, and
   external services are declared.
6. **Plugin Brief** — Workbench records intent, selected surfaces, scenarios,
   trust, compatibility, and acceptance criteria.
7. **Native creation** — Hand the brief to bb's prompt-to-plugin/scaffold flow;
   do not generate a competing scaffold.
8. **Fixture iteration** — Annotate and compare host-neutral visual states.
9. **Harness validation** — Use only the official public testing contract.
10. **Live validation** — Path-install and run native `bb plugin dev` in an
    isolated or explicitly approved profile.
11. **Review** — Resolve annotations and attach a before/after comparison.
12. **Handoff** — Agent records implementation, limitations, verification, and
    release readiness.

## Storage and retention

Use a runtime-owned SQLite database plus content-addressed artifact files under
an explicit BB Mate data root. Proposed precedence:

1. `BB_MATE_DATA_DIR` when set by an intentional launcher/test;
2. platform application-data convention;
3. XDG data convention where applicable.

Requirements:

- database migrations are append-only and transactional;
- image/artifact filenames use opaque IDs or hashes, never source paths;
- object deletion is explicit and cascades only documented dependent artifacts;
- capture binaries have configurable retention with a conservative default;
- plugin uninstall preserves user-created data by default;
- Settings offers export, storage location, size, and explicit delete-all;
- no secret, environment dump, authenticated page content, or arbitrary project
  file is captured by default;
- exported review bundles include a manifest, hashes, redacted paths, and
  fidelity labels.

## Security and trust model

### Runtime listener

- Loopback only; reject `0.0.0.0` in packaged/plugin-managed mode.
- Validate Host and Origin to prevent DNS rebinding.
- Use supervisor and browser-session credentials with different scopes.
- Use one-time browser bootstrap credentials and strict cookies.
- Require JSON content type/custom headers for mutations.
- Bound request bodies, strings, event queues, image sizes, and logs.
- Rate-limit authentication and mutation failures.
- Set CSP, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff`, and restrictive permissions policy.

### Filesystem and target safety

- Browser requests name opaque target/object IDs only.
- Canonical realpaths are resolved server-side against trusted roots.
- Reject symlink escapes and path traversal before reads.
- Passive discovery never imports target code or runs package scripts.
- Native lifecycle commands require explicit target provenance and user intent.
- Sanitize `BB_CLI`/re-exec selectors before native invocation as existing code
  does.

### Agent safety

- Tool schemas are bounded and descriptive.
- Model-controlled tools do not accept shell command strings or arbitrary paths.
- Mutating tools return actionable errors rather than silently retrying.
- Native/external/destructive actions have explicit confirmation boundaries.
- Every object/capture records author, tool, timestamp, target, and fidelity.

### Host topology

The plugin backend/runtime may run on a different machine from the bb desktop
browser. `localhost` is therefore not universally meaningful.

V1 behavior:

- prove the server/runtime and active desktop are the same reachable host;
- otherwise mark browser launch unavailable with an actionable explanation;
- continue passive target/compatibility work where safe;
- do not automatically expose the runtime through Connect or a custom proxy.

Remote support requires a public bb-owned tunnel, scoped browser command, or
equivalent authenticated host bridge.

## Proposed upstream seams

These are enhancements after the downstream loop proves demand. They are not
included as edits to `../bb` in the first goal.

### Browser open/focus/reuse

```ts
useBbBrowser().open({
  url,
  threadId,
  reuseKey: `bb-mate:${sessionId}`,
  reveal: true,
});
```

Required behavior: owned target identity, thread scoping, user-visible control,
focus/reuse semantics, cancellation, and actionable unavailable errors.

### Browser capture/annotation enrichment

Prefer a bounded cooperative provider over raw `webContents` or eval access:

```ts
browserAnnotations.registerEnricher({
  id: "plugin-workbench",
  origins: [runtimeOrigin],
  enrich(captureContext) {
    return boundedWorkbenchMetadata;
  },
});
```

bb owns the screenshot, selection coordinates, user gesture, and browser target.
The provider contributes only bounded semantic metadata for its approved origin.

### Thread objects

Provide typed plugin-owned attachments with host fallback, composer visibility,
user/assistant support, durable rendering, and bounded agent-context references.

## Verification strategy

### Runtime executable

- Compile twice and require deterministic payloads where platform toolchains
  permit; otherwise explain and isolate known signature variance.
- Run in an environment with no `bun` on `PATH`.
- Prove help, inspect, `serve`, Fixture metadata, 13-story enumeration, health,
  graceful shutdown, and crash cleanup.
- Prove the executable does not read the sibling checkout or source workbench.
- Verify SHA-256, package allowlist, architecture, executable mode, and macOS
  signing/notarization policy before public distribution.

### Runtime API and objects

- Schema round trips and version rejection.
- Authentication, Origin/Host, CORS, CSRF, rate, and size limits.
- Trusted-root containment and symlink escape tests.
- Object migration, persistence, reconnect, export, retention, and deletion.
- Concurrent start/session/capture serialization.

### Plugin Workbench

- Official plugin app/backend contract tests where publicly available.
- Nav-panel, settings, thread-panel, composer, mention, directive, and tool
  behavior through the supported SDK test surface.
- Native build/type checks with the pinned bb 0.36 target.
- Exact path/managed/mismatch/absent target fixtures.
- Runtime missing, incompatible, crashed, remote, and unauthenticated states.

### Browser UI

- Keyboard/focus, screen-reader labels, reduced motion, contrast, compact
  viewport, and overlay restoration.
- Deterministic surface/scenario/theme/viewport URL state.
- Annotation selection, resize/scroll normalization, and stale selection.
- Capture fidelity labels and comparison mismatch rejection.
- Existing visual/a11y matrix plus focused annotation/capture baselines.

### Agent and MCP

- Native tool and MCP adapters produce the same domain results.
- Resources never disclose absolute roots or tokens.
- Read/reversible/mutating authority boundaries are enforced.
- Stdio writes protocol only to stdout and logs only to stderr.
- Fresh-context skill eval completes target discovery, surface selection,
  annotation resolution, comparison, and native handoff without inventing APIs.

### Live proof

Use an isolated bb profile and disposable source plugin. Do not touch normal
plugin state. Prove:

1. native install of `bb-plugin-mate` candidate;
2. top-level Plugin Workbench row and panel;
3. source-only target discovery;
4. managed installed plugins excluded from the development list;
5. runtime initialization and browser launch;
6. annotation creation and thread reference;
7. agent retrieval through a native tool;
8. before/after Fixture comparison;
9. native target-plugin build/dev handoff;
10. plugin disable/uninstall stops the runtime and preserves user data by
    default.

Current aggregate repository gate remains:

```sh
bun run format:check
bun run check
bun run test
bun run build
bun run visual:test
```

Add package/executable clean-room gates to CI before claiming completion.

## Acceptance criteria

- A clean machine can install Plugin Workbench through native bb and start the
  packaged `bb-mate` runtime without global Bun or `bb-mate`.
- Plugin Workbench appears as a top-level, reorderable/hideable sidebar row.
- The default target list contains only trusted source candidates, not all
  installed plugins.
- Exact path, managed copy, mismatched path, builtin conflict, and absent native
  states are distinguished correctly.
- A thread-associated localhost session opens through the best supported bb
  browser handoff and reports when that topology is unavailable.
- The user can explore the complete public surface catalog and create a Plugin
  Brief with agent assistance.
- The Workbench can create, persist, reopen, and resolve annotations, Fixture
  captures, comparisons, briefs, and reviews.
- A user can reference Workbench objects in the thread through released plugin
  surfaces, with limitations documented.
- Native bb tools and the MCP adapter resolve the same canonical objects.
- One bundled skill guides a fresh agent through discovery, surface choice,
  annotation, before/after verification, and native lifecycle handoff.
- All security, clean-room, accessibility, visual, package, native-build, and
  isolated-live gates pass.
- Documentation names Fixture/Harness/Live honestly and distinguishes the
  Workbench runtime from bb's plugin runtime.
- No implementation depends on `../bb`, private app/browser contracts, copied
  SDK code, arbitrary target execution, or normal user plugin-state mutation.

## Proposed implementation waves

These should become focused GitHub issues under #21 after spec review. Issue
numbers are intentionally not invented here.

### Wave 0 — Contract and executable proof

1. **Compile a no-Bun `bb-mate` runtime executable**
   - Separate source and packaged execution modes.
   - Embed the surface lab.
   - Add runtime descriptor and clean-room executable proof.

2. **Define the runtime API and Workbench object schemas**
   - Domain service, versioning, storage, authentication, events, and migrations.

These may proceed in parallel after agreeing the executable asset contract.

### Wave 1 — Installed control plane

3. **Ship `bb-plugin-mate` as Plugin Workbench**
   - Nav panel, settings, supervisor, compatibility handshake, packaging.

4. **Add source-first development-target discovery**
   - Thread/workspace roots, explicit targets, native provenance reconciliation.

The plugin shell may start after the API schema is stable. Runtime provisioning
depends on the executable proof.

### Wave 2 — Review objects and browser loop

5. **Add Workbench sessions and semantic annotations**
6. **Add deterministic captures and before/after comparisons**
7. **Integrate Workbench objects with thread surfaces**

Thread integration depends on stable object schemas. Capture and annotation UI
may proceed in parallel once session state is stable.

### Wave 3 — Agents and education

8. **Expose native Workbench agent tools and the `plugin-workbench` skill**
9. **Expose the runtime through an MCP adapter**
10. **Build Surface Explorer and the agent-paired Plugin Brief walkthrough**

All three use the same domain services. MCP does not block the native bb tool
path.

### Wave 4 — Integrated proof and handoff

11. **Run the clean-room Plugin Workbench trial**
12. **Complete security, accessibility, visual, agent, and isolated-live review**
13. **Prepare package/release and upstream-proposal handoffs**

Stop before publication, upstream submission, or announcement without owner
approval.

## Goal conversion

After owner review, convert this plan into:

```text
.agents/goals/YYYY-MM-DD-plugin-workbench/
├── GOAL.md
├── SPEC.md
├── PROMPT.md
├── REFS.md
└── RETRO.md
```

### Proposed completion horizon

`merged-independent-work`

Complete when all downstream-independent waves are merged to `main`, their
GitHub issues are current/closed, aggregate and clean-room gates are green, the
installed Plugin Workbench loop passes in an isolated bb profile, local reviews
have no open P0-P2 findings, and a local release candidate plus upstream seam
proposals are ready for owner review.

Not complete while any independent issue is local-only, the compiled executable
still requires Bun, managed installed plugins leak into default development
targets, thread objects cannot be resolved by agents, capture fidelity is
overstated, runtime security gates fail, or the isolated end-to-end trial is
incomplete.

### Proposed authority boundary

The eventual goal packet should state explicitly whether it may create issues,
commit, push, open/merge PRs, and update issue state. This plan grants none of
those external permissions by itself.

Even with implementation authority, stop before:

- publishing either npm package;
- changing npm dist-tags;
- creating Git tags or GitHub releases;
- editing or opening PRs against upstream bb;
- exposing/pairing Connect;
- mutating normal user plugin state;
- adding remote-host proxies;
- announcing the release.

### Review topology

For the goal packet, use:

- one standing doctrine/security reviewer across all waves;
- one targeted reviewer for each issue through its fix loop;
- a fresh executable/package reviewer for Wave 0 and the release candidate;
- a fresh agent/MCP security reviewer for Wave 3;
- a fresh full-stack reviewer for the final isolated trial;
- 5/5 clean reviews with no open P0-P2 before each merge, following the
  repository's existing goal-loop convention.

### Evidence ledger

`RETRO.md` should record:

- exact base/head/PR/CI provenance per issue;
- runtime platform, size, hashes, signature, package contents, and no-Bun proof;
- target-discovery fixtures and live provenance results;
- API/object schema versions and migration evidence;
- security and topology tests;
- annotation/capture/comparison artifact IDs and fidelity;
- native/MCP tool parity and fresh-context skill evals;
- isolated bb profile and disposable target-plugin evidence;
- review rounds/findings/dispositions;
- forbidden-action audit and remaining upstream seams.

## Documentation changes expected during implementation

- Update `README.md` to introduce Plugin Workbench without displacing the
  current CLI quickstart until the plugin is actually available.
- Amend `docs/architecture.md` with the runtime/control-plane split.
- Amend `docs/trust-model.md` with listener, object storage, MCP, agent-tool, and
  process-supervision operations.
- Add a runtime/package document covering compiled artifacts and fallback.
- Expand `docs/plugin-author-guide.md` with Surface Explorer, Plugin Brief,
  annotation, capture, and native handoff flows.
- Add exported schema/reference docs only after schemas stabilize.
- Preserve this plan as the design record; mark it complete rather than deleting
  it.

## Risks and mitigations

| Risk                                             | Mitigation                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| “Runtime” sounds like a bb replacement           | Use Workbench runtime language and enforce the ownership table               |
| Compiled asset resolution differs from scripts   | Dedicated compiled entrypoint and no-Bun binary tests                        |
| 61 MB binary bloats plugin installs              | Measure; start macOS-only; do not add platform abstraction prematurely       |
| Browser link preference is disabled              | Visible copy/open fallback and proposed public browser-open seam             |
| Plugin server and desktop are different hosts    | Detect topology; disable localhost launch; no insecure proxy                 |
| Installed inventory pollutes development targets | Source-first discovery; installation only reconciles candidates              |
| Path plugin relink destroys user data            | Never auto-remove/reinstall; explicit native handoff and warning             |
| MCP becomes a parallel implementation            | Transport-neutral domain service and adapter parity tests                    |
| Agent tools become arbitrary automation          | Domain-specific schemas, no eval/shell/path strings, explicit mutation gates |
| Screenshot claims exceed fidelity                | Store fidelity on every capture and reject invalid comparisons               |
| Thread references break while runtime is off     | Include bounded immutable snapshot and safe renderer fallback                |
| Browser/API upstream plans change                | Capability negotiation, released-contract gates, deletable adapters          |
| Goal becomes too broad                           | Focused issues/waves, dependency graph, per-issue review and merge gates     |

## Open product questions for goal kickoff

1. Should V1 preserve Workbench data indefinitely by default, or use a bounded
   capture-retention policy while preserving briefs/annotations?
2. Should the first macOS binary be signed/notarized before internal Plugin
   Workbench testing, or only before a public `bb-plugin-mate` candidate?
3. Should the first goal include drafting upstream browser/thread-object issues,
   or stop with locally reviewed proposal text for separate owner approval?

None of these questions blocks Wave 0 research or the downstream object/API
design. They should be decided before release packaging and goal authority are
finalized.

## Research references

### BB Mate

- `README.md`
- `docs/architecture.md`
- `docs/trust-model.md`
- `docs/local-package.md`
- `apps/cli/src/bin.ts`
- `apps/cli/src/commands.ts`
- `apps/cli/src/surface-lab-server.ts`
- `apps/workbench/src/surface-catalog.ts`
- `apps/workbench/src/components/MateOverlay.tsx`
- `packages/inspection/`
- `.agents/goals/2026-08-07-os-627-independent-alpha/`

### Upstream bb read-only evidence

- `packages/plugin-sdk/src/app-contract.ts`
- `packages/plugin-sdk/src/backend-contract.ts`
- `packages/sdk/src/areas/plugins.ts`
- `packages/server-contract/src/api/plugins.ts`
- `apps/app/src/components/plugin/PluginNavSidebarItems.tsx`
- `apps/app/src/components/secondary-panel/BrowserTabContent.tsx`
- `packages/desktop-contract/src/browser.ts` (private host evidence only)
- `plans/bb-browser.md` (proposal, not released contract)

### Public specifications

- [Bun standalone executables](https://bun.sh/docs/bundler/executables)
- [Bun macOS code signing](https://bun.sh/docs/guides/runtime/codesign-macos-executable)
- [MCP server primitives](https://modelcontextprotocol.io/specification/2025-11-25/server/index)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

## Next move

Review this spec with the owner, resolve the three kickoff questions, reconcile
the plan onto post-#52 `main`, create the focused GitHub issue graph under #21,
then generate and validate the goal packet. Do not begin implementation waves or
external issue/upstream mutations merely because this plan exists.
