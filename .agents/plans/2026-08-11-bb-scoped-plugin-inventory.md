# bb-scoped Plugin Workbench inventory

Date: 2026-08-11
Status: Complete; final executable head local/package/Live/hosted/review proof
is green, with only the docs-head administrative ready transition remaining.
Issue: [#82](https://github.com/galligan/bb-mate/issues/82)
Goal: `.agents/goals/2026-08-11-bb-scoped-plugin-inventory/`

## Outcome

Plugin Workbench opens as a native inventory of every eligible ordinary bb
project on this machine and every source plugin passively discoverable within
those projects. Projects are always expanded. The UI has no project `Open`,
accordion, or protocol-level “admit” concept.

bb's public project registry is the hard filesystem allowlist. Workspace
metadata narrows inspection within each registered root. Activity can bring a
project toward the top, but an idle eligible project remains visible.

## Product flow

```text
Open Plugin Workbench
  → read eligible projects from bb
  → start/confirm one supervised Mate runtime
  → revalidate every private source record
  → perform one globally bounded multi-root scan
  → return grouped path-free project/plugin states
  → render all project sections and plugin rows
  → open a plugin detail in panel history
  → return with Back; open/create project tasks through bb public actions
```

Healthy runtime identity stays one quiet metadata line. Refresh remains the
Settings-style icon control and is the only explicit rescan action after initial
load.

## bb project boundary

The backend uses only released bb 0.36 public contracts:

- `bb.sdk.system.config()` supplies `primaryHostId` and the private plugin data
  directory.
- `bb.sdk.projects.list({ include: "threads" })` supplies ordinary registered
  projects, local sources, and visible activity facts.
- `bb.sdk.projects.get({ projectId })` revalidates a captured source immediately
  before it crosses the authenticated runtime boundary.

A project is eligible only when it has exactly one `local_path` source whose
`projectId` matches and whose `hostId` is the primary host. Invalid IDs, labels,
paths, ambiguous sources, remote sources, or source changes fail closed.

Visible, non-deleted task activity determines only ordering:

1. active work first;
2. newest visible task update next;
3. bb's native list order for ties.

Personal projects are not included in this slice because released bb omits them
by default and their source policy is distinct.

## Private batch contract

The existing authenticated, absent-Origin `POST /v2/targets/admit` route becomes
one multi-root operation; runtime API remains 2.

Request shape:

```ts
{
  schemaVersion: 2;
  sources: Array<{
    projectKey: OpaqueCorrelationKey;
    sourcePath: AbsoluteNormalizedPrivatePath;
  }>;
}
```

Response shape:

```ts
{
  schemaVersion: 2;
  state: "ready" | "partial";
  groups: Array<{
    projectKey: OpaqueCorrelationKey;
    state: "ready" | "partial";
    targets: DevelopmentTargetProjection[];
  }>;
}
```

`projectKey` is ephemeral correlation metadata, never authority. The runtime
still mints trusted-root keys. The backend strips all private correlation before
forming the browser snapshot. Duplicate canonical roots are scanned once and
their path-free target projections fan out to each registered project group.

One request shares global limits: 128 projects/roots, 2,048 visited entries,
128 candidates/targets, bounded workspace and manifest bytes, the existing
256-KiB transport body, and existing request/concurrency deadlines. Sequential
one-root admissions are explicitly rejected because they reset budgets and can
pressure the global catalog repeatedly.

## Workspace-aware passive discovery

For each trusted root:

1. Inspect the root itself as a possible plugin package.
2. Read root `package.json` and, when present, bounded
   `pnpm-workspace.yaml` without following links.
3. Accept documented npm/Bun workspace arrays, Bun object `packages` arrays,
   and pnpm `packages` include/exclude patterns.
4. Reject absolute/drive/home/traversal/control/backslash patterns, unsupported
   YAML features, excessive counts/bytes/nesting, and escaping matches.
5. Traverse only literal ancestors or directories that can still match a
   declared include; apply exclusions before candidate inspection.
6. Inspect only the root and matched workspace package boundaries. Never enter
   unrelated `src`, stories, build output, caches, `node_modules`, or the
   packaged Mate runtime unless a safe declaration explicitly names a package
   boundary there.
7. Reuse existing canonical-root, directory-attestation, `O_NOFOLLOW`, manifest
   bounds, entrypoint containment, and one-use inspection transitions.

Malformed or unsupported workspace configuration does not trigger generic
recursive fallback. The root is still inspected and that project's result is
honestly partial. No package-manager executable, manifest module, lifecycle
script, build, install, or target entrypoint runs.

Yarn/Lerna/Nx/Rush-specific configuration beyond supported `package.json`
workspaces is not part of this slice.

## Public snapshot v3

The plugin RPC remains two explicit operations:

- `status({})`: read-only, does not start the runtime or scan.
- `refresh({})`: the sole runtime-demand and inventory edge; initial panel load
  calls it automatically after the safe status boundary.

Runtime API identity remains 2; only the plugin browser snapshot becomes schema 3. It removes the global `targets` catalog and gives every project its own
finite scan state:

```ts
{
  schemaVersion: 3;
  runtimeState: RuntimeState;
  reason: RuntimeReason | null;
  runtimeVersion: string | null;
  apiVersion: 2 | null;
  canStart: boolean;
  browserLaunch: "unavailable";
  projects:
    | { state: "unavailable"; items: [] }
    | {
        state: "ready" | "partial";
        items: Array<{
          id: ProjectId;
          label: SafeLabel;
          activity: {
            active: boolean;
            lastThreadUpdatedAt: number | null;
          };
          scan:
            | { state: "not_scanned"; items: [] }
            | { state: "ready" | "partial"; items: TargetSummary[] }
            | {
                state: "unavailable";
                reason:
                  | "source_changed"
                  | "scan_failed"
                  | "capacity_reached";
                items: [];
              };
        }>;
      };
}
```

All schemas are strict, bounded, unique, and cross-state coherent. Browser
parsing independently rejects paths, source/host/root keys, auth/topology,
process/environment facts, unknown keys, and impossible runtime/project states.

## Native presentation

- Project headers are noninteractive list structure, not buttons.
- Plugin rows are the only `Open <plugin>` controls and navigate to stable
  `projects/:projectId/targets/:targetId` panel subroutes.
- Ready-empty: `No development plugins found.`
- Partial with results: `Scan incomplete. Available plugins are shown.`
- Partial empty: `Scan incomplete. No plugins were found within the safety limits.`
- Per-project unavailable: `Plugins unavailable. Reload Workbench data to try again.`
- One project's state never hides a successful sibling.
- Reload retains the prior catalog while busy and generation-guards stale
  responses.
- Detail distinguishes task loading, ready-empty, and unavailable; a vanished
  deep-linked plugin gets finite Back/reload recovery instead of silently
  falling through to the root.

## Work plan

1. [x] Isolate native registry/project-first foundation in draft PR #83.
2. [x] Create #82, goal packet, batch/root/workspace decisions, and delegated
       implementation/review topology.
3. [x] Implement workspace-aware inspection with global fairness and hostile
       manifest/pattern/symlink tests.
4. [x] Implement strict grouped runtime transport and CLI controller behavior.
5. [x] Implement project activity/source revalidation and snapshot-v3 backend.
6. [x] Implement always-expanded grouped frontend and deterministic visual/axe
       states.
7. [x] Reconcile generated runtime/package identity and run isolated lifecycle.
8. [x] Rebuild/reload the path plugin and verify released bb live behavior.
9. [x] Resolve final standing/targeted review findings and reconcile tracker/PR
       truth on the replacement executable head. The docs-only readiness head
       must pass exact-head review and hosted checks before PR #84 moves from
       draft to ready; no merge is authorized.

PR #84 replacement implementation
`d6196e864ef506eaeb5a63e71fdfdaba0f8fa9de` is stacked on PR #83 head
`06ee8ae4943bcbc61fb2302196ef370d12f18726`. Its 709-test aggregate,
standalone, managed-package, build/check/format, and 14+20 visual/axe gates are
green. Exact executable/evidence head
`a69fe031c43f5eb20f5c0ca43fe394f15f2a4b4a` has passed its Live, hosted, and
review gates: both reviews are clean 5/5 and hosted verify/visual/standalone are
terminal success. The final docs-only head is governed by the same exact-head
checks before the administrative ready transition.

## Verification and stop lines

The exact ladder lives in `GOAL.md` and `PROMPT.md`. At minimum: focused
inspection/runtime/CLI/backend/frontend tests; package checks/build; real
Chromium screenshots/axe; root format/check/test/build/visual/compatibility;
standalone and Mate package clean rooms when runtime bytes change; live released
bb; exact-head hosted CI; two clean local-review lanes; prompt/doctor; clean
GitButler state with PR #73 unchanged.

Stop before arbitrary filesystem access, browser-visible paths, target code,
private/upstream bb imports or edits, normal-profile mutation beyond path-plugin
reload, plugin removal/reinstall, PR #73 mutation, merge, publication, or release.
