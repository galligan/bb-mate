# OS-634 Mate overlay launcher

## Outcome

Turn the lower-right Mate overlay into the reload-stable control point for the
surface lab while keeping the bb-facing fixture full-viewport and every native
or state-changing handoff explicit.

## Slice

1. Define one typed URL-state contract for plugin/workspace, surface, fixture,
   mode, theme, and viewport selections; catalog and inspection remain the data
   authorities, with deterministic fallbacks for invalid or stale links.
2. Extend the dark shadcn/Base UI overlay with responsive, keyboard-accessible
   controls and exact Fixture/Harness/Live availability reasons. Disabled modes
   remain unselectable.
3. Add explicit launch, compatibility-check, and native live-handoff actions
   through the existing bb-mate CLI boundary. Preserve native output and never
   fetch or iframe Connect content.
4. Keep multiple-plugin discovery explicit and avoid introducing a BB Mate
   manifest or automatic normal-plugin/Connect mutation.
5. Add focused URL-state, selection, availability, accessibility, and action
   interaction tests, then browser-smoke the full overlay and minimized FAB.

## Boundaries

- Native bb continues to own build, install, dev/reload, and runtime.
- Fixture is always the browser approximation. Harness requires both a resolved
  official contract and an upstream-backed adapter; contract resolution alone
  is not launcher availability. Live requires a proven native frontend target
  and renders only an explicit native handoff, never Fixture output.
- Opening a local fixture lab is reversible; build/live handoffs must be
  visibly explicit and preserve command output.
- No authenticated Connect fetch/iframe, upstream source import, SDK copy,
  hidden manifest, secret access, or automatic plugin installation.
- Reuse the existing catalog, fixture adapters, inspection report, CLI, and UI
  primitives; do not add a second orchestration system.

## Verification

- Focused URL-state and overlay interaction tests.
- Local browser smoke for reload-stable links, keyboard access, responsive
  layout, unavailable-mode explanations, and minimized FAB.
- `bun run format:check && bun run check && bun run test && bun run build`.
- Standing plus fresh targeted review; fix all P0-P2 and reasonable P3.
- Draft PR, hosted CI/review threads, ready/merge, main CI, Linear Done.

## Progress

- [x] Add the typed, canonical URL state and collision-free plugin selection.
- [x] Add honest Fixture/Harness/Live rendering and explicit native handoffs.
- [x] Make the browser session allowlisted, stale-safe, and path-redacted.
- [x] Cover mounted interactions, history, async races, responsive layout, and
      focus behavior with tests and browser QA.
- [x] Complete aggregate gates and standing/fresh-targeted review at 5/5.
- [x] Land PR #8, verify main CI 31222879164, and move OS-634 to Done.

## Completion

Complete when the overlay owns every accepted lab selection and explicit
handoff, its links reload deterministically, unavailable modes fail honestly,
all local/hosted gates are green, OS-634 is merged/Done, and the workspace is
clean.
