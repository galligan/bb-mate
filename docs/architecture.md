# Architecture

## Repository boundary

BB Mate is downstream of bb. The sibling `../bb` checkout is the live reference for public plugin SDK contracts and host behavior, but it is not part of this Bun workspace.

## Workbench

`apps/workbench` renders deterministic approximations of bb states in an ordinary browser. Its job is fast visual iteration, comparison, and discussion without booting the desktop app or manufacturing real repository state.

Fixtures should describe product state rather than mirror private bb database or React types. Adapters can translate those fixtures into components. This keeps prototypes stable when upstream internals change.

The workbench puts the bb surface directly in the viewport. Workbench controls
belong in the collapsible Mate overlay, not in a permanent wrapper around the
prototype. The overlay uses vendored shadcn/Base UI source and has its own dark
theme; bb-facing views use bb's typography, icon family, and measured semantic
tokens.

`SidebarListView` is the current host-neutral seam. The workbench supplies its
model from deterministic scenarios. A future plugin adapter can supply the same
model from `experimental_useSidebarThreads` and related public action hooks,
while bb continues to render the actual New Thread, search, navigation, and
footer chrome around the slot.

## Upstream alignment

Exactness has two levels:

1. In standalone fixture mode, the live bb Connect client is the visual oracle.
   Measured tokens and screenshot comparisons keep the replica honest, but it is
   still a replica.
2. In live plugin mode, bb itself renders the host chrome and provides state
   through `@bb/plugin-sdk/app`. This is the production-exact surface and should
   be the final validation environment for plugin UI.

Stay attached to upstream through supported versioned boundaries:

- Every plugin declares honest `engines.bb` and `engines.bbPluginSdk` ranges.
- Plugin UI primitives are vendored through the bb component registry version
  that matches the target bb release. Use the shadcn CLI's `--dry-run` and
  `--diff` flow when updating; do not copy raw application files.
- Hugeicons and bb-facing type/token choices track the versions used by the
  target bb release.
- The sibling `../bb` checkout and installed Connect client are read-only
  contract/visual references. Hashed desktop assets are never imported.

A follow-up should automate upstream drift detection: record the target bb and
plugin SDK release, compare the bb registry manifest and the small set of
measured sidebar tokens, then fail a dedicated parity check when they move.

## Runtime sources

The source control in the Mate overlay represents adapters, not a browser data
fetch:

- **Fixtures** are always available in `apps/workbench`.
- **Live bb** becomes available when the view is mounted by a bb plugin and the
  public SDK adapter is present.

Do not proxy, scrape, or iframe an authenticated bb Connect session to simulate
live state. Even when a client can be displayed, cross-origin content is not a
state/action contract and cannot safely drive plugin behavior.

### Plugin inspection

The workbench dev server may inspect one explicit plugin directory. Inspection
is data-only: it reads the ordinary package manifest, native
`dist/server.meta.json` and `dist/app.meta.json`, and the JSON output of native
bb commands. It must not evaluate the plugin entrypoint, mount a content script,
or introduce a BB Mate manifest.

The official SDK frontend collector currently exposes these registration
groups, which define the eventual surface inventory:

- homepage and settings sections
- navigation panels and thread-panel actions
- composer customizations and pending interactions
- sidebar footer actions and thread-list replacements
- thread-header actions and file openers
- message directives and message actions
- trusted content scripts

Component registrations can receive deterministic behavior through
`loadPluginApp` and `renderSlot`. Content scripts require the explicit
`mountPluginContentScripts` lifecycle and must never be mounted during ordinary
discovery. Host-rendered actions still require live bb for their real chrome.

Until `@bb/plugin-sdk` is publicly installable, the workbench exposes Harness as
an unavailable capability. The sibling checkout is not a fallback dependency.
[get-bb/bb#1134](https://github.com/get-bb/bb/issues/1134) is the upstream
publication tracker.

Scaffold dependency installation remains native bb behavior. BB Mate does not
repair generated packages after the fact;
[get-bb/bb#1133](https://github.com/get-bb/bb/issues/1133) and draft
[PR #1135](https://github.com/get-bb/bb/pull/1135) own that fix.

## Plugins

Each directory under `plugins/` is an independent package. A plugin owns its manifest, backend entry, optional frontend entry, tests, assets, and version. Local development uses path installation so bb loads the package in place.

Plugin UI can share host-neutral components with the workbench once a second consumer proves the boundary. Code that imports `@bb/plugin-sdk/app` stays inside the plugin adapter or entrypoint because that runtime only exists inside bb.

## Distribution

bb supports managed npm installation with `bb plugin install npm:<package>@<range>`. The intended release model is independent npm packages published from `plugins/*` by CI. Git monorepo subdirectory installation is proposed upstream in [get-bb/bb#1097](https://github.com/get-bb/bb/issues/1097).
