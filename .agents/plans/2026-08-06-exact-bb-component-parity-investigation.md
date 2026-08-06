# Exact bb component parity investigation

## Goal

Determine the smallest supported way for BB Mate prototypes and future plugins to achieve exact visual parity with bb's production sidebar without coupling the standalone workbench to private application state.

## Success criteria

- Identify which production sidebar components, styles, tokens, and assets are reusable today.
- Document what `@bb/plugin-sdk/app` and the live plugin runtime expose to frontend plugins.
- Compare the installed bb 0.35.1 bundle with the canonical source checkout where useful.
- Recommend one thin, testable integration path before any UI implementation.

## Investigation

- [x] Trace the production sidebar component and style dependency graph.
- [x] Inspect the public plugin frontend API, UI kit, slots, and host-rendered surfaces.
- [x] Inspect installed plugin metadata and bundled desktop resources read-only.
- [x] Evaluate direct reuse, upstream extraction, and host-rendered/plugin-native alternatives.
- [ ] Verify the preferred path with an exact-component browser fixture before changing BB Mate UI.

## Findings

- bb 0.35.1 exposes `app.slots.experimental_threadList`, an exclusive plugin
  slot that replaces only the scrolling thread list. The host retains the real
  New Thread button, search, navigation rows, footer, theme, routing, dialogs,
  and split behavior.
- The slot reads the host's live sidebar cache and exposes normalized project,
  thread, environment, host, activity, indicator, pull-request, and split data
  plus host-owned actions.
- `@bb/plugin-sdk/app` is hooks-only. The former host UI kit was removed; normal
  plugins vendor version-matched components from bb's shadcn registry. The
  registry includes exact primitives, icons, motion, menus, and coarse-pointer
  sizing, but not bb's production `ProjectList`, `ProjectRow`, `ThreadRow`, or
  status glyph component.
- The bundled `t3sidebar` reference plugin uses the experimental slot and was
  built with bb 0.35.1 / plugin SDK 0.4.1. Its source demonstrates the intended
  adapter and styling approach, but it draws its own rows and indicators.
- The desktop bundle contains the exact compiled app CSS and JavaScript, but
  these hashed artifacts are not a supported component module boundary. Treat
  them as a version/parity oracle, not a dependency to scrape or hot-link.
- Preferred path: share one host-neutral sidebar list view between
  `apps/workbench` fixtures and a thin BB Mate plugin adapter using
  `experimental_threadList`. Let the real bb host render all surrounding
  sidebar chrome, and validate the shared view in both the workbench and the
  installed app.
- Browser-oracle validation is pending: the upstream Ladle command currently
  fails because `/Users/mg/Developer/bb/bb` has no installed `node_modules`.
  No dependencies were installed and the upstream checkout was not modified.

## Boundaries

- Do not edit `/Users/mg/Developer/bb/bb`.
- Do not modify the current BB Mate workbench UI during this investigation.
- Do not install, reload, enable, disable, or publish plugins.
- Preserve all unrelated worktree changes.
