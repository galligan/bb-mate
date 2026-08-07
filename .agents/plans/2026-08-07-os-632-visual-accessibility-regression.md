# OS-632 visual and accessibility regression

## Outcome

Make the deterministic fixture lab a dependable PR review surface with a small,
checked-in screenshot matrix, readable diffs, and automated accessibility and
geometry checks, while keeping Live bb as the visual authority.

## Slice

1. Add a pinned Chromium Playwright project with fixed locale, timezone, DPR,
   color scheme, reduced motion, animation state, fonts, and viewports.
2. Cover a representative matrix: the sidebar/composer reference, a plugin-owned
   surface, a host-action contract, compact/dark state, and the Mate overlay/FAB.
3. Add axe checks and explicit keyboard traversal, focus visibility, contrast,
   reduced-motion, label, overlay/FAB, and measured sidebar/composer assertions.
4. Check in platform-stable baselines and expose separate verify/update commands;
   CI uploads readable diffs without updating expected images.
5. Document exact fixture-regression claims and a direct, manual live-bb
   side-by-side workflow that stores no authenticated session or scraped host.

## Boundaries

- Screenshot tests execute only deterministic Fixture/Ladle/workbench surfaces.
- No authenticated Connect request, host scraping, plugin lifecycle mutation,
  upstream import, or sibling-checkout dependency.
- The checked-in matrix stays intentionally small enough for every PR; broad
  exploratory combinations remain a manual extension of the same contract.
- Baseline updates are explicit, reviewable source changes, never CI behavior.

## Verification

- Focused Playwright visual/a11y suite and intentional mismatch proof.
- Static Ladle story enumeration and measured geometry assertions.
- `bun run format:check && bun run check && bun run test && bun run build`.
- Standing plus fresh targeted review; fix all P0-P2 and reasonable P3.
- Draft PR, hosted CI/review threads, ready/merge, main CI, Linear Done.

## Progress

- [x] Pin the browser/a11y tooling and deterministic project inputs.
- [x] Implement the bounded matrix, baselines, axe, keyboard/focus, contrast,
      motion, overlay/FAB, and geometry assertions.
- [x] Document baseline updates and manual live comparison.
- [x] Complete focused/aggregate gates and standing/fresh-targeted review at
      5/5 with no open P0-P3 findings.
- [ ] Land the PR, verify main CI, and move OS-632 to Done.

## Completion

Complete when the bounded matrix detects reviewable fixture drift, accessibility
and geometry checks are green, updates are explicit, claims remain honest, all
local/hosted gates pass, OS-632 is merged/Done, and the workspace is clean.
