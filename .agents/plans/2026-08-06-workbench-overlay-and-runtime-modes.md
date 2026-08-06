# BB-faithful workbench and Mate overlay

## Goal

Make the workbench feel like bb itself, with BB Mate controls living in a
small dev-tool overlay instead of a second application shell. Keep the view
portable between deterministic fixtures and the public bb plugin runtime.

## Success criteria

- The preview occupies the full viewport and uses bb's measured sidebar
  dimensions, typography, color tokens, icon family, and row rhythm.
- Workbench-only controls live in a dark rounded overlay that minimizes to one
  lower-right FAB.
- Fixture selection remains deterministic and keyboard accessible.
- The UI names live bb as a separate adapter-backed source; it does not pretend
  a cross-origin fetch is live plugin state.
- The implementation has a documented upstream-update path based on public bb
  packages/registry artifacts and a visual oracle, not imports from `../bb`.

## Design direction

- **Subject:** a visual instrumentation harness for bb plugin authors.
- **Palette:** bb surface `#fbfbfb`, bb foreground `#525252`; Mate coal
  `#121418`, raised graphite `#1b1e24`, steel border `#303640`, paper text
  `#f5f7fa`, signal blue `#8cb4ff`.
- **Type:** Inter Variable for bb and HUD controls; ui-monospace for adapter and
  version/status details.
- **Layout:** bb owns the viewport. Mate floats above it in the lower-right.
- **Signature:** the compact source light and thin signal-blue edge turn the
  overlay into a small instrumentation module rather than another settings
  panel.

```text
+---------------- bb interface -----------------------------+
| sidebar |                                       composer   |
|         |                                                  |
|         |                             +------------------+ |
|         |                             | MATE  fixture  o | |
|         |                             | source / state   | |
|         |                             | scenario         | |
|         |                             +------------------+ |
+------------------------------------------------------------+

collapsed:                                             ( M )
```

## Adapter boundary

```text
deterministic scenarios -> SidebarView <- bb plugin SDK live adapter
                                ^
                           Mate overlay
```

- `apps/workbench` supplies the fixture adapter.
- A plugin consumer supplies normalized data from
  `experimental_useSidebarThreads` and related action hooks.
- The standalone workbench must not fetch or iframe an authenticated Connect
  client. Those origins and sessions are not a supported data contract.

## Work

- [x] Introduce the full-viewport bb-faithful shell.
- [x] Add the fixture adapter and scenario switching.
- [x] Initialize shadcn/Base UI for Mate-only controls and add the smallest
      required primitives.
- [x] Add the dark popover/FAB overlay.
- [x] Verify typecheck, tests, build, and visual behavior through bb Connect.
- [x] Document the upstream synchronization and live-adapter path.
- [x] Reconcile composer and sidebar primitives against the current installed
      bb source and a direct live-render comparison.

## Verification

- `bun --filter @bb-mate/workbench check`
- `bun --filter @bb-mate/workbench test`
- `bun --filter @bb-mate/workbench build`
- Visual inspection at `https://galligan--5173.getbb.app/` at 1170×727
- Direct geometry and screenshot comparison against `https://galligan.getbb.app/`
  and the installed `/Applications/bb.app` client.
- Verified the overlay minimizes to one FAB and the scenario select updates the
  rendered project/thread fixture.

## Boundaries

- Do not edit `/Users/mg/Developer/bb/bb`.
- Do not scrape or import hashed desktop application modules.
- Do not install/reload a plugin or publish packages in this slice.
- Preserve unrelated GitButler and Linear plugin worktree changes.
