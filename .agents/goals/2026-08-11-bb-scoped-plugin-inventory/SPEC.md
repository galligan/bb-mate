# Goal Spec: bb-scoped Plugin Workbench inventory

Date: 2026-08-11
Status: Ready for execution

## Objective

Make Plugin Workbench open as an immediately useful, native inventory of every
eligible local project already known to bb and every source plugin discoverable
inside those projects. bb's registered project sources define the filesystem
boundary; workspace manifests focus discovery inside each source root; the
browser receives no filesystem paths.

## Context

The current native redesign accurately lists eligible bb projects but requires
an `Open` action before discovering one project's plugins. Its generic recursive
scan also spends bounded depth on irrelevant directories such as source UI,
stories, and packaged runtime assets, which can produce an incomplete-scan
warning even when every plugin was found.

The released bb 0.36 public SDK already provides the authoritative project
inventory, each project's local source records, the primary host identity, and
public thread navigation. The existing Mate backend already resolves exactly
one local source on the primary host and keeps its path private. This goal
extends that trusted boundary instead of introducing arbitrary filesystem
browsing or a browser-side scanner.

## Scope

### In

- Preserve, commit, and deliver the current uncommitted native
  component-registry redesign, compact runtime status, `Toolbox` icon,
  project/plugin resource treatment, target detail route, and public thread
  actions on a ready PR as an isolated first milestone.
- Replace one-project admission with one bounded inventory operation over all
  eligible local projects returned by bb.
- Treat bb's primary-host local project sources as the only top-level roots.
- Resolve candidate package directories from root package metadata and declared
  workspace patterns before passive plugin inspection.
- Show all projects expanded by default, with their discovered plugins, honest
  per-project empty/partial/unavailable states, and no `Open`/admit toggle.
- Retain stable target detail/back navigation and project-scoped thread actions.
- Use public project/thread activity only as an ordering hint if the released
  contract proves bounded and reliable; never hide an eligible registered
  project solely because it is inactive.
- Update source-backed design/product documentation, deterministic fixtures,
  unit/contract tests, real-browser screenshot/axe coverage, package evidence,
  tracker state, and live released-bb verification.

### Out

- Scanning `$HOME`, repository parents, arbitrary user-selected paths, remote
  host sources, installed-plugin caches, or directories bb has not registered.
- Executing target code, package manager scripts, builds, installs, reloads, or
  native inventory during passive discovery.
- Editing `../bb`, importing private bb application modules, or recreating bb's
  Add Project dialog.
- Browser preview/bootstrap, plugin-to-thread persistence, archived-thread
  recovery, target execution, npm publication, external redistribution,
  release, merge, or changes to PR #73.

## Source Of Truth

- `AGENTS.md` - repository boundaries and verification commands.
- `plugins/mate/types/bb-plugin-sdk.d.ts` - released public project and app API.
- `plugins/mate/src/backend/project-adapter.ts` - current primary-host source
  authorization boundary.
- `plugins/mate/src/backend/plugin.ts` - current status/admit RPC composition.
- `apps/cli/src/runtime-target-controller.ts` - runtime admission/discovery
  composition.
- `packages/runtime/src/discovery/` - passive bounded discovery and catalog.
- `.agents/plans/2026-08-11-project-first-workbench.md` - completed native
  project-first redesign that this goal preserves and advances.
- `docs/native-plugin-design-system.md` - live/source-backed UI grammar.
- GitHub #21 - open Plugin Workbench roadmap.
- GitHub #82 - focused bb-scoped all-project inventory child issue.

## Acceptance Criteria

- Opening Plugin Workbench performs one bounded refresh and renders every
  eligible primary-host bb project with its plugin rows already visible.
- No project row requires expansion or an `Open` action to reveal plugins.
- Discovery never crosses outside canonical bb-authorized source roots and does
  not walk unrelated package subtrees once workspace/package boundaries are
  known.
- Root plugins and declared workspace packages are detected across supported
  npm/Bun/pnpm workspace declarations; unsafe, escaping, control-bearing,
  symlinked, excessive, or malformed patterns fail closed with path-free state.
- A project with no source plugins stays visible with a quiet, accurate empty
  state. One project's partial/failure state does not hide other projects.
- Public browser snapshots, bundles, logs, errors, screenshots, and RPC results
  contain no source paths, source IDs, host IDs, data roots, tokens, ports, PIDs,
  commands, or environment values.
- Plugin detail, Back, refresh, existing-thread, and new-thread actions continue
  to use released bb public navigation/thread seams.
- The current native design remains component-registry based, responsive,
  keyboard-usable, axe-clean, and visually verified in released bb.
- Focused tests, package checks/build, root check/test/build/format/compatibility,
  visual tests, standalone/package clean rooms when runtime bytes change, hosted
  CI, and two clean local-review lanes pass.

## Decisions

- bb's registered primary-host project sources are the hard allowlist. Activity
  may affect ordering but never filesystem authority.
- Registered eligible projects remain visible even when idle; "in use" is a
  ranking signal, not the default inclusion rule.
- The runtime owns filesystem discovery and target catalog state. The plugin
  backend owns bb project/source resolution and public project grouping. The
  browser owns presentation and client-only target selection.
- Paths move only through the authenticated backend-to-runtime channel and are
  absent from public DTOs.
- Workspace-aware discovery is manifest-driven and passive. It does not invoke
  npm, Bun, pnpm, glob shells, or target code.
- Use one strict batch admission on the existing authenticated v2 target route,
  with ephemeral correlation keys, at most 128 project groups, and one global
  2,048-entry/128-target budget. Sequential one-root admissions are rejected
  because they reset limits and can repeatedly pressure the persistent catalog.
- Support root plugins, npm/Bun `package.json` workspace arrays/object package
  arrays, and bounded `pnpm-workspace.yaml` package patterns. Malformed or
  unsupported declarations inspect the root only and produce honest partial
  state; there is no recursive fallback.
- If multiple bb projects resolve to the same canonical source root, scan it
  once and fan the same path-free projections into each project group.
- The first slice uses ordinary registered projects, matching released bb's
  default project list. Personal-project inclusion remains a separate decision.
- Runtime readiness remains compact supporting metadata. A healthy runtime is
  not the primary page object.
- The completion horizon is `ready-pr`; merge and release require separate
  owner approval.

## Risks

- A batch scan can amplify I/O. Global project, workspace, manifest, byte,
  concurrency, and time budgets must be shared fairly rather than reset per
  project.
- Workspace syntax differs across package managers. Support only precisely
  parsed declarations with tests; return an honest bounded fallback/partial
  state for unsupported declarations rather than widening recursion.
- Project lists or sources can change during a scan. Re-fetch and compare the
  private source identity before admission, and generation-guard browser
  responses.
- Automatically starting the runtime on panel load is an intentional product
  change required by the all-project inventory; teardown and reload behavior
  must remain bounded and proven.
- The existing native redesign is user-reviewed but uncommitted. It must be
  isolated before overlapping backend/runtime edits so provenance and rollback
  remain clear.
