# OS-633 Ladle surface lab

## Outcome

Provide a deterministic, linkable, static-buildable Ladle story environment for
every public plugin UI surface without running bb, plugin entrypoints, Connect,
external services, secrets, or sibling source.

## Slice

1. Add Ladle to the workbench package with local serve and static build scripts
   and a browser-only provider that reuses BB Mate's own styles.
2. Add a small host-neutral surface-story renderer. Plugin-owned surfaces render
   deterministic component demos; host actions show only declared inputs and
   expected outcomes; content scripts remain descriptive and unmounted.
3. Add explicit statically discoverable story exports grouped by catalog
   surface. Reuse catalog fixtures as the data authority and add only the
   bounded empty/loading/error/content/interaction variants genuinely needed.
4. Add deterministic global theme/background controls and story-level viewport
   parameters without introducing a second hidden manifest.
5. Add focused completeness/adapter tests and prove both Ladle serve and static
   build work without native services.

## Boundaries

- `surfaceCatalog` remains the single surface/fixture contract.
- Story exports are explicit; no runtime-generated exports that Ladle cannot
  discover and no BB Mate story manifest.
- Host actions demonstrate contract/outcome, not counterfeit host chrome.
- Ordinary discovery never imports or mounts content-script implementations.
- Harness and Live remain labeled capabilities, not story execution modes.
- Do not extract a shared package until a real second consumer exists.

## Verification

- Focused story catalog and renderer tests.
- Ladle static build and a bounded local browser smoke check.
- `bun run format:check && bun run check && bun run test && bun run build`.
- Standing plus fresh targeted review; fix all P0-P2/reasonable P3.
- Draft PR, hosted CI/review threads, ready/merge, main CI, Linear Done.

## Progress

- [x] Pin Ladle and add isolated local/static workflows.
- [x] Add explicit story groups and fixture/theme/viewport controls for all 13
      catalog surfaces.
- [x] Add bounded edge fixtures and honest plugin/host/lifecycle adapters.
- [x] Add focused completeness, render, interaction, and inert-lifecycle tests.
- [x] Prove static metadata, linkable controls, host-action ownership, and the
      realistic sidebar replacement in a local browser.
- [x] Complete aggregate gates and standing/targeted review.
- [ ] Land the draft PR, verify main CI, and move OS-633 to Done.

## Completion

Complete when all 13 catalog surfaces are discoverable with honest ownership
and deterministic fixtures, static/local workflows pass, content scripts stay
unmounted, PR and main CI are green, the issue is merged/Done, and the workspace
is clean.
