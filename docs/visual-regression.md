# Visual regression and accessibility

bb Plugin Studio runs a deliberately small Chromium matrix on every pull request. These
screenshots protect deterministic Fixture output; they do not prove visual
parity with Live bb.

## Matrix

| Reference                            | Scenario       | Theme | Viewport   | Purpose                                |
| ------------------------------------ | -------------- | ----- | ---------- | -------------------------------------- |
| Sidebar thread list + composer shell | Agent focus    | Light | 1440 x 900 | Measured bb-replica reference          |
| Sidebar thread list + composer shell | GitButler repo | Dark  | 430 x 860  | Compact responsive state               |
| Composer customization               | Expanded draft | Light | 1100 x 760 | Mixed plugin/host surface              |
| Thread header action                 | Desktop thread | Dark  | 1100 x 760 | Host-action contract                   |
| Mate overlay                         | Agent focus    | Light | 1440 x 900 | Open controls and minimized FAB states |

The suite fixes Chromium, device scale factor 1, `en-US`, UTC, bundled Inter
and Geist fonts, color scheme, reduced motion, viewports, fixture data, and
animation/caret state. Playwright names each baseline with its platform because
browser text rasterization differs between macOS and Linux.

The CI visual job itself runs inside the exact pinned Playwright Linux image
used to produce the Linux baselines. Its isolated install skips workspace
install scripts because this Fixture-only gate neither builds nor executes the
native plugin; the ordinary verification job still performs the complete
workspace install and build. CI installs only the `unzip` utility missing from
the base image before the pinned Bun setup action runs.

The Mate screenshots use a dedicated deterministic component harness. They do
not call `/bb-mate-session.json`, inspect the checkout, or invoke native bb.
Playwright refuses to reuse occupied ports so a stale or unrelated local server
cannot satisfy the visual gate.

## Verify and update

Install the pinned browser once, then run the read-only comparison:

```sh
cd apps/workbench
bunx playwright install chromium
cd ../..
bun run visual:test
```

Failures identify the story/scenario and write actual, expected, and diff
images plus a trace beneath `apps/workbench/dist/playwright/results`. CI uploads
that directory and the HTML report as the `visual-regression-report` artifact.

Updating expected output is always explicit:

```sh
bun run visual:update
```

Review every changed PNG under
`apps/workbench/e2e/visual-regression.spec.ts-snapshots/` next to the source
change that caused it. Do not update baselines merely to make CI green. Linux CI
baselines should be generated from the repository root with the pinned
Playwright container; ordinary local updates produce the macOS files:

```sh
docker run --rm --ipc=host \
  --mount type=bind,source="$(pwd)",target=/work \
  --mount type=volume,target=/work/node_modules \
  --mount type=volume,target=/work/apps/cli/node_modules \
  --mount type=volume,target=/work/apps/workbench/node_modules \
  --mount type=volume,target=/work/packages/inspection/node_modules \
  --mount type=volume,target=/work/plugins/mate/node_modules \
  --workdir /work mcr.microsoft.com/playwright:v1.62.1-noble \
  bash -lc 'npm install -g bun@1.3.14 && bun install --frozen-lockfile --ignore-scripts && cd apps/workbench && bun run stories:build && bunx playwright test --update-snapshots'
```

The anonymous volumes prevent container dependencies from replacing the host's
node_modules. Review and commit only the expected `*-linux.png` changes.

## Accessibility and geometry contract

The same suite runs axe against a representative surface and the open/minimized
Mate launcher, then checks keyboard focus visibility, labels, focus restoration,
contrast, reduced-motion behavior, and complete static story enumeration.

The intentionally measured sidebar/composer reference asserts:

| Token or element          | Expected measurement |
| ------------------------- | -------------------- |
| `--bb-sidebar-width`      | 320 px               |
| `--bb-sidebar-row-height` | 1.75 rem / 28 px     |
| Sidebar chrome            | 48 px high           |
| Composer                  | 796 x 128 px         |
| Composer top offset       | 70 px                |

These measurements are regression targets for bb Plugin Studio's approximation, not a
claim that bb has promised public CSS tokens.

## Manual Live bb comparison

Use Live bb only as a human-controlled visual authority:

1. Run `bun run visual:test` and open the sidebar/composer Fixture reference at
   the exact matrix viewport.
2. Separately open the same plugin surface in an already-authorized native bb
   session. Do not expose Connect, copy cookies, scrape the host, or automate an
   authenticated client for this comparison.
3. Place the two windows side by side at the same viewport and compare the
   sidebar width/rows, composer geometry, typography, spacing, theme, focus, and
   responsive transition.
4. Record observed differences and the bb version in the issue or PR. Keep any
   temporary screenshots in packet-local ignored storage; promote only a
   deliberately reviewed, credential-free artifact.
5. Update Fixture code and its baseline only when the approximation should
   change. If the difference is owned by an unavailable public contract, record
   the upstream dependency instead of copying host internals.

Fixture regression answers “did bb Plugin Studio change?” Live comparison answers “does
this still resemble the current host?” Only the latter can support a parity
claim.
