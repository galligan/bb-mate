# bb 0.36 compatibility and update automation

## Outcome

Adopt the released `bb-app@0.36.0` as BB Mate's verified compatibility target,
then make later stable bb releases visible through a quiet scheduled detector
and a repeatable project skill. Tracked by GitHub issue #51.

## Live baseline

- `main` is clean at `c3993b66f00629d4ab06dbda6247341b2a65564f`.
- BB Mate records `desktop-v0.35.1`; the normal local `bb` is 0.35.1.
- npm's stable `bb-app` release is 0.36.0 and the immutable upstream tag is
  `desktop-v0.36.0` at `9dc2145d1acd02927079fe74a7e89702ca7a8d28`.
- The 0.36 public SDK remains 0.4.1. The registry digest/item set, tracked
  dependencies, and recorded sidebar row-height tokens are unchanged.
- An isolated 0.36 CLI builds the Linear plugin successfully, stamps the
  artifact with bb 0.36.0 / SDK 0.4.1, and reports its vendored SDK declaration
  as stale.
- BB Mate's compatibility checker times out while probing the 0.36 CLI through
  Bun's Node-compatible `execFile`; the same command exits through a shell,
  `Bun.spawn`, and BB Mate's bounded native-command runner.

## Steps

- [x] Replace the compatibility check's one-off `execFile` probe with BB
      Mate's existing bounded native-command runner and cover success, failure,
      timeout, and output handling.
- [x] Refresh `plugins/linear/types/bb-plugin-sdk.d.ts` through native bb 0.36,
      bump the workspace's `bb-app` build pin, and update the lockfile.
- [x] Update the immutable compatibility target and current author/trial docs
      to 0.36.0 while preserving historical release reports as historical.
- [x] Start an isolated 0.36 server/profile, verify builtins-only and unpaired
      state, and exercise BB Mate inspection, build/check, and guarded live
      handoff without touching the normal profile.
- [x] Add `compatibility:latest`, backed by a deterministic tested script that
      compares the committed target with npm's stable `bb-app` release.
- [x] Add a repository-local `update-bb-mate-compatibility` skill describing
      the review, clean-room, target-update, documentation, and PR workflow.
- [x] Add a scheduled/manual GitHub workflow that runs the deterministic drift
      check and creates or updates one deduplicated issue when a newer stable
      release exists. It must not edit code or upgrade bb.
- [x] Run the skill validator, workflow/static checks, targeted tests, and the
      full formatting/check/test/build/visual gates.
- [ ] Complete a local review pass, commit the scoped files on a GitButler
      branch, and open a draft PR linked to #51. Move it to ready only after
      hosted CI is green.

## Boundaries

- Do not edit `../bb`, import its private modules, or make it a dependency.
- Do not upgrade the normal bb installation or mutate its plugin/profile state.
- Do not publish packages, change npm tags, or release a new BB Mate version.
- Do not automatically rewrite the compatibility target. Detection creates one
  reviewable signal; an agent or maintainer performs the skill deliberately.
- Do not claim Fixture parity from static checks. Live bb remains the visual
  authority; any visual comparison that cannot be completed is reported.
- Do not start upstream-dependent GitHub issues #41-#46 as part of this work.

## Verification evidence

- Issue: <https://github.com/galligan/bb-mate/issues/51>
- Upstream release: `bb-app@0.36.0`, tag `desktop-v0.36.0`, commit
  `9dc2145d1acd02927079fe74a7e89702ca7a8d28`.
- Public contract: SDK 0.4.1, unchanged export map; registry digest
  `ae65ae093d2435540e445707529337598cfa9f3446a8535986affef0939fe1e2`
  with the same 56 items; tracked dependency ranges and row-height tokens are
  unchanged.
- Isolated npm prefix: `/tmp/bb-mate-036-probe.ONFzsJ`
- Isolated plugin build: `/tmp/bb-mate-linear-036.ordP0j`
- Isolated server/profile: `/tmp/bb-mate-036-profile.fV1csE`; builtins only,
  Connect unpaired, `inspect` and `check` passed, and `live` returned the
  expected native install handoff without installing the plugin.
- Native build metadata: plugin `linear` 0.1.0, built with bb 0.36.0 and SDK
  0.4.1. Native `bb plugin types --check plugins/linear` passes.
- Live visual authority: isolated bb 0.36 inspected at 1280x633; representative
  sidebar and composer geometry remain compatible with the recorded Fixture
  surfaces. Fixture remains an approximation; Harness remains unavailable.
- Targeted script tests: 32 passed. Aggregate tests: inspection 48, CLI 34,
  workbench 53, plugin 21, scripts 32; the clean-room package test passed with
  41 files, 13 stories, and SHA-256
  `de6174f733c8a76fdc4b7e117ff2499a47d55e918e02150fecb9337384e0e843`.
- Formatting, type/compatibility checks, builds, skill validation, and
  `actionlint` pass. The exact 14-test visual/a11y CI gate passes in a
  disposable Playwright container; the host visual command was not used
  because an unrelated process already owned port 5173.
- Fresh-context skill test: the workflow selected the correct issue, stable
  tag, public-contract comparisons, isolated profile, native/Fixture/Live
  sequence, and stop boundaries. It exposed and prompted a fix for resuming an
  already-dirty adoption when `compatibility:latest` reads the updated target.
- Local full-stack review: clean 5/5 with zero P0-P3 findings; scratch report
  `/tmp/agent-reviews/bb-036-compatibility/root/round-1.json`. Hosted CI is
  pending.
