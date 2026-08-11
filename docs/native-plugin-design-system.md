# Native bb plugin interface system

Status: working reference for bb Plugin Studio plugin surfaces

This document reverse-engineers bb's current interface grammar from the live
bb 0.36 Settings surfaces and the corresponding upstream source. Live bb is
the visual authority. Upstream private components are reference material, not
a plugin API; plugins should vendor the matching public registry components
and compose them with the same semantic tokens.

## Product direction

Plugin Studio is a source-plugin control surface for bb plugin developers.
Its single job is to show every eligible local bb project and its passively
discoverable source plugins, then provide a stable place to move between those
plugins, their project tasks, and—when the public handoff exists—their live
previews. Projects are expanded inventory, not controls: opening Workbench
performs one bounded refresh across bb's registered project roots. Runtime
health is supporting operational context, not the page's primary object.

The intended visual character is bb itself: quiet, compact, semantic, and
operational. Its one distinctive element is the machine-style runtime identity
line—a status dot, a plain-language state, and compact version metadata. It
should feel borrowed from Settings → Machines because it describes another
owned local runtime, but it should remain as quiet as connection metadata in a
resource row.

## Sources and implementation boundary

- Live reference: `getbb.app` Settings routes in bb 0.36, audited 2026-08-11.
- Source reference: `../bb/apps/app/src/components/settings/`,
  `../bb/apps/app/src/views/SettingsView.tsx`, and
  `../bb/apps/app/src/views/MachineSettingsView.tsx`.
- Layout reference: `../bb/apps/app/src/components/ui/page-shell.tsx` and
  `../bb/apps/app/src/components/ui/settings-section.tsx`.
- Supported component source: the version-pinned BB registry in
  `../bb/packages/plugin-registry/r/`.
- Plugin authoring contract: `bb plugin new --app` vendors starter components;
  `npx shadcn add @bb/<name>` adds release-matched source using the registry URL
  pinned in `components.json`.

Do not import `apps/app`, `@bb/shared-ui`, or other private workspace packages
from a downstream plugin. The host owns the plugin title bar and gives a
`navPanel` a zero-padding, full-bleed body; the plugin owns its scrolling and
inner page geometry.

## Core grammar

### Page shell

- Use one vertical scroll owner for the entire panel.
- Center content at approximately 760 px (`max-w-[760px]`).
- Use compact page insets: 16 px normally, 20 px at the medium breakpoint.
- Separate major sections with 24 px of vertical space.
- Let the host title bar name the plugin. Do not repeat a large page title.

### Section

The dominant unit is a small heading outside a bordered card:

```text
Section title                              optional quiet action
Optional one-line description
┌──────────────────────────────────────────────────────────────┐
│ row label + optional description                  control    │
│ ──────────────────────────────────────────────────────────── │
│ row label                                         metadata   │
└──────────────────────────────────────────────────────────────┘
```

- Section title: 14 px, semibold, foreground.
- Description: 12 px, tight line height, subdued foreground at reduced
  emphasis.
- Card: semantic `bg-card`, `border-border`, 8 px radius, 16 px horizontal and
  14 px vertical padding.
- Section actions are compact outline or ghost buttons. Status text may sit
  beside them.

### Rows

- Default row: horizontal, center-aligned, 12 px gap, 10 px vertical padding.
- Divide repeated rows with `border-border`; do not box every row separately.
- Use a responsive control row when a label needs supporting text: content on
  the left, control on the right above the small breakpoint, stacked on narrow
  screens.
- Prefer a stretched row action with independent trailing controls for dense
  resources, as in Machines.
- Use fixed columns only when comparison matters across rows (for example,
  machine permission limits).

### Typography

- Inherit bb's host font and type scale. Do not introduce a display face.
- Use sentence case throughout.
- Primary labels are 14 px regular or medium.
- Supporting descriptions and metadata are 12 px.
- Reserve 10 px uppercase tracking for genuine table column labels, not for
  decorative eyebrows.
- Use monospace only for literal versions, identifiers, or code-like values.

### Color and depth

- Use only host semantic tokens: `background`, `foreground`, `card`, `border`,
  `muted`, `muted-foreground`, `subtle-foreground`, `state-hover`, `ring`,
  `success`, `warning`, and `destructive` where their meaning is real.
- Avoid custom hex colors, gradients, status rails, and decorative surfaces.
- Default depth is one border. Shadow is unnecessary for in-page cards.
- Hover and selection are quiet state fills; selected radio cards may add a
  stronger foreground border.

## Recurring patterns from Settings

| Pattern                      | Live examples                                                       | Meaning                                                                    | Plugin-safe construction                                                            |
| ---------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Label + control row          | General, Appearance, Providers, Experiments                         | A bounded preference or choice                                             | `Switch`, `Select`, or `Button` from the registry inside a settings row             |
| Compact badge                | Machines (`this machine`), Experiments (`dev-only`), plugin secrets | Secondary classification, never the primary state                          | `Badge` with neutral outline/muted styling                                          |
| Status dot + metadata        | Machines, Updates → Machines                                        | Reachability or liveness at a glance                                       | 6 px semantic dot plus text that states the same status                             |
| Description-rich radio cards | Machine permission limit                                            | A small set of consequential options that need explanation                 | `RadioGroup`; clickable bordered rows with title and description                    |
| Dense resource list          | Machines, Usage limits, Updates                                     | Repeated operational entities and their state                              | One section card, optional column header, divided rows, trailing actions            |
| Key/value detail rows        | Machine detail, plugin update source                                | Read-only facts that should scan quickly                                   | Divided rows; label left, muted value right                                         |
| Progress/check state         | Usage limits, Updates                                               | Work is in progress or was checked at a known time                         | Inline status text and a compact refresh action; no blocking overlay                |
| Plugin settings form         | Settings → plugin detail                                            | Identity header, update/source facts, host-generated fields, danger action | Stacked settings cards and a separate quiet danger row                              |
| Empty collection             | Archived threads                                                    | Valid empty result after filters                                           | Toolbar followed by a centered dashed `EmptyStatePanel` equivalent                  |
| External destination         | Community                                                           | A small set of outbound resources                                          | Label/description rows with compact outline actions                                 |
| Danger zone                  | Machine detail, plugin detail                                       | Destructive lifecycle action                                               | Separate final section; destructive text/button, explanatory copy, no red card wash |

## State language

Every state must be understandable without color.

- `ready` / connected: small success dot plus “Ready” or “Online.”
- `starting`, `stopping`, checking: plain status copy and `aria-live`; animation
  is optional and must respect reduced motion.
- `idle`: neutral dot and a next action.
- `partial`: warning-toned compact notice before the usable results.
- `unavailable` / failed: finite reason, redacted detail, and a safe retry when
  one exists.
- empty: say what was searched and what the person can do next.

Badges classify; prose communicates. A badge must not be the only expression
of readiness, failure, or progress.

## Controls and actions

- Primary actions are rare. In Plugin Studio, plugin rows are the only
  per-item Open actions; project headings are noninteractive structure.
- Use outline buttons for secondary explicit actions and ghost buttons for
  refresh/overflow affordances.
- Keep compact settings controls around 28–32 px tall.
- Prefer the Settings → Usage refresh pattern: an icon-only ghost button with
  an accessible label, a short tooltip, and a rotating icon while refreshing.
- Use product language at the boundary. “Open” is appropriate for plugin rows;
  “admit” remains an internal runtime operation.
- A disabled future action should remain quiet and adjacent to an explanation.

## Loading, empty, partial, and error handling

- Initial loading should occupy the eventual content area with subdued text or
  a registry `Skeleton`; avoid a full-panel spinner.
- Empty content is not an error. Use a bordered or dashed inset with one direct
  explanation.
- Partial results put a compact warning before the results and keep successful
  rows interactive.
- Errors never echo private paths, credentials, process details, or raw server
  responses. Offer one safe retry when possible.

## Responsive and accessibility rules

- Stack label/control rows below the small breakpoint.
- Let section actions wrap or move below copy rather than squeeze labels.
- Preserve visible keyboard focus using `ring`.
- Status changes use `role=status` or `aria-live`, not color alone.
- Do not nest a second `main` landmark inside the host panel.
- Hostile project/target labels render as React text only.

## Registry component policy

Vendor the smallest set needed by the actual UI. For Plugin Studio:

- `button`: refresh, open, retry, back, and thread actions.
- `card`: native section surface.
- `badge`: project/target classification and compact metadata.
- `tooltip`: icon-only refresh affordances.
- `icon`: supported host-aligned iconography from the bb registry.

Prefer semantic composition in plugin source over copying upstream private
helpers. A small local `NativeSettingsSection` composition is appropriate;
publishing a shared package is not justified until another real plugin needs
the same abstraction.

## Plugin Studio application

1. Runtime metadata: one machine-style dot, plain state text, inline version
   metadata, and the Settings → Usage icon refresh action. Do not give healthy
   runtime state its own dominant card.
2. Projects section: one always-expanded divided inventory of every eligible
   local project, ordered by activity without filtering idle projects. Project
   headings are not buttons, accordions, or disclosure controls.
3. Plugin rows: nest discovered plugins beneath their project so project and
   plugin identity remain visually distinct. A plugin row is the only `Open`
   control and navigates to a stable panel subroute.
4. Plugin detail: provide `Back to projects`, the plugin identity, an honest
   preview-availability row, and unarchived project tasks using the public bb
   navigation/actions SDK.

The released plugin SDK does not expose bb's Add Project dialog. When there are
no eligible projects, point to the host sidebar's Add Project affordance and
offer reload; do not call private host routes or recreate the dialog. It also
does not store a plugin-to-task association, so label the list “Project tasks”
rather than implying a stronger relationship.

Remove the former two-column dashboard grid, status rail, decorative uppercase
eyebrows, custom status hex colors, oversized headings, and separately boxed
panel cells. The host's page rhythm—not visual novelty—is the design system.

## Audit coverage

Live routes reviewed: General, Appearance, Keyboard, Usage limits, Machines,
machine detail, Updates, Experiments, Community, Codex, Claude Code, Remote
access, Custom instructions, Linear, Provider retry, Workflows, and Archived
threads.

The recurring grammar held across preferences, resource inventories, async
status, plugin-owned configuration, external links, destructive actions, and
empty collections. That consistency is why these patterns are a stronger
foundation for bb Plugin Studio than a standalone dashboard aesthetic.
