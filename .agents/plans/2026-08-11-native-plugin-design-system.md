# Native bb plugin design system and Workbench alignment

Date: 2026-08-11
Status: Complete

## Outcome

Reverse-engineer bb's live Settings surfaces into a concise, source-backed
design-system reference for independently shipped bb plugins, then restyle the
Plugin Workbench nav panel with the supported version-matched bb component
registry and host semantic theme tokens.

The result should feel native inside the released bb desktop and remote apps
without importing private app internals or turning BB Mate into a second UI
framework.

## Constraints

- Treat the live released bb host as visual authority and `../bb` as read-only
  source evidence.
- Use only public plugin SDK seams, vendored `@bb/*` registry components, and
  semantic classes compiled by `bb plugin build`.
- Do not import `apps/app/**` or unpublished `@bb/shared-ui` modules into the
  plugin.
- Preserve the existing runtime, admission, privacy, lifecycle, package, and
  no-publication contracts.
- Keep the change frontend-focused; no speculative browser-launch behavior.
- Preserve deterministic stories and real-browser axe/screenshot coverage.

## Work plan

1. [x] Audit every released Settings route and capture recurring layout,
       section, row, status, control, empty, progress, and warning patterns.
2. [x] Trace those patterns to upstream source and classify each as registry
       component, semantic-token composition, host-only private component, or
       unsuitable for plugin reuse.
3. [x] Write a durable design-system note with component mappings, spacing,
       typography, states, responsive behavior, accessibility, and anti-patterns.
4. [x] Add the version-pinned bb component-registry scaffold to `plugins/mate`
       and vendor only the components the Workbench actually needs.
5. [x] Refactor the Workbench into the native single-column page/section/row
       grammar and update unit, boundary, story, axe, and screenshot coverage.
6. [x] Verify focused plugin gates, native build, root checks, visual tests, and
       a live released-bb comparison before declaring the alignment complete.

## Results

- Audited the released Settings surfaces and traced their recurring grammar to
  the canonical bb source and version-pinned component registry.
- Added `docs/native-plugin-design-system.md` as the plugin-facing reference.
- Vendored only Button, Card, Badge, Tooltip, and Icon from the bb 0.36
  registry and composed the remaining Settings section/row grammar locally.
- Rebuilt Plugin Workbench as a native single-column settings surface, then
  refined it into a project-first resource list with compact runtime metadata,
  nested plugin rows, and native panel/thread navigation.
- Passed the final combined 71 plugin tests (350 assertions), plugin
  check/build, full workspace check and compatibility validation, root
  formatting, `git diff --check`, and all 14 real-browser screenshot/axe cases.
- Reloaded the existing path-installed plugin without reinstalling it. In the
  live released bb host, admitting the BB Mate project reached runtime
  `0.1.0-alpha.3` / API 2 and rendered the Linear and Plugin Workbench source
  targets in the new native treatment.

## Acceptance checks

- The design note distinguishes Live, source evidence, public registry seams,
  and private host-only components.
- Plugin Workbench uses no hard-coded neutral/status palette and no private bb
  imports.
- Controls come from the version-matched bb registry where available.
- The panel preserves every existing runtime/project/target state and action.
- Light/dark and narrow/wide visual cases remain deterministic and axe-clean.
- `bun --filter bb-plugin-mate check`, tests, build, visual tests, root format,
  and `git diff --check` pass.

## Stop conditions

Stop before editing `../bb`, widening the public SDK, introducing a shared UI
package for one consumer, changing runtime/backend behavior, installing or
publishing the plugin, or mutating the user's normal bb profile beyond the
already-authorized live visual verification surface.
