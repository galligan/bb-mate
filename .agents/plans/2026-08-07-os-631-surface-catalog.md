# OS-631 — Public plugin UI surface catalog

## Outcome

Define one browser-safe, typed catalog for every public frontend registration
group exposed by bb's `PluginAppBuilder`. The workbench uses that catalog for
surface and fixture selection, while a Bun-only drift check compares the
catalog with the selected bb declaration file without importing sibling code.

## Boundaries

- Keep this change independent of OS-628 and the shared inspection work.
- Treat `../bb` as read-only declaration input for an explicit development
  check only. The workbench runtime and ordinary tests must not import it.
- Do not load plugin code or mount content scripts. Fixture previews remain
  deterministic approximations; live bb remains the visual authority.
- Model public authoring concepts, not private bb React or database types.
- Keep the existing sidebar thread-list scenario as the first implemented
  catalog fixture. Other groups may truthfully remain catalog-only.

## Contract

The catalog covers these thirteen registration groups from the public
`PluginAppBuilder` declaration:

1. `slots.homepageSection`
2. `slots.settingsSection`
3. `slots.navPanel`
4. `slots.threadPanelAction`
5. `slots.pendingInteraction`
6. `slots.sidebarFooterAction`
7. `slots.experimental_threadList`
8. `slots.experimental_threadHeaderAction`
9. `slots.fileOpener`
10. `slots.messageDirective`
11. `slots.messageAction`
12. `composer.customize`
13. `contentScripts.register`

Each entry records stable identity, public registration path, host/fixture
rendering responsibility, exclusivity, trust, fidelity, lifecycle, and typed
deterministic fixture scenarios. Content scripts explicitly require host-owned
mount/dispose lifecycle and are never previewed by ordinary discovery.

## Verification strategy

Use vertical TDD slices:

- RED/GREEN: catalog exposes thirteen stable unique groups and resolves a
  surface/scenario selection with deterministic fallback.
- RED/GREEN: the thread-list entry owns the current sidebar scenarios and is
  the renderable catalog selection used by the workbench.
- RED/GREEN: catalog metadata captures thread-list exclusivity and trusted
  content-script lifecycle/fidelity honestly.
- RED/GREEN: a Bun declaration parser compares the expected registration paths
  with an explicit `.d.ts` input and reports missing, stale, or newly exposed
  groups. Its normal test coverage uses the committed Linear plugin SDK
  declaration; the CLI retains an explicit-path mode for sibling cross-checks.

Then run the workbench's format check, typecheck, tests, and production build.

## Completion checklist

- [x] Thirteen public registration groups are cataloged exactly once.
- [x] Deterministic fixture contracts are typed and browser-safe.
- [x] Navigation/story selection derives from the catalog.
- [x] Existing sidebar thread-list scenarios are attached to its catalog entry.
- [x] Exclusivity, trust, lifecycle, and preview fidelity are explicit.
- [x] Bun-only declaration coverage fails for missing/stale/new registrations.
- [x] Normal tests check the committed `plugins/linear` SDK declaration.
- [x] No runtime/test fallback to or import from `../bb` exists.
- [x] Focused format, check, test, and build pass.

## Review follow-up

- [x] Public message-action and thread-list fixtures include required fields,
      loading/fallback states, and typed outcomes for every claimed action.
- [x] Declaration coverage classifies callable properties semantically across
      aliases, parentheses, callable objects, generics, unions, and
      intersections while failing closed on ambiguous or unresolved members.
