# Native plugin preview walking skeleton

## Goal

Add the smallest useful plugin-authoring slice to BB Mate without duplicating
bb's plugin runtime or making the sibling source checkout a workspace
dependency.

## Verified upstream boundary

- bb owns plugin scaffolding, declarations, build, install, dev/reload, runtime,
  and live host rendering.
- `@bb/plugin-sdk/testing` and `@bb/plugin-sdk/testing/app` are the supported
  behavioral harnesses. BB Mate will consume `createFakePluginHost`,
  `loadPluginApp`, and `renderSlot` when the package is installable.
- The frontend harness validates registration and hook behavior. It does not
  reproduce bb layout or CSS, so live bb remains the visual authority.
- `@bb/plugin-sdk@0.4.1` is not currently available from the public npm
  registry. [get-bb/bb#1134](https://github.com/get-bb/bb/issues/1134) now
  tracks the external publication gap. The harness must therefore be
  capability-gated; BB Mate will not copy it or import `../bb`.
- [get-bb/bb#1133](https://github.com/get-bb/bb/issues/1133) tracks the packaged
  scaffold's missing development dependencies, and draft
  [PR #1135](https://github.com/get-bb/bb/pull/1135) contains the upstream fix.
  BB Mate will continue invoking native scaffolding rather than patching the
  generated package itself.
- Upstream PR #1107 is the intended declaration-sync path. BB Mate should
  report its availability, not create a competing type-sync mechanism.
- Upstream PR #1109 is the supported sidebar-replacement reference. BB Mate
  should link to or inspect the example once it lands, not fork its private UI.

## Review record

Two independent review passes completed before implementation:

1. Upstream-overlap review narrowed BB Mate to discovery, fixtures,
   inspection, orchestration, and live handoff.
2. Plugin-author-DX review required an explicit capability matrix, clean-room
   validation, trusted-code disclosure, and native CLI output preservation.

The separate upstream investigation opened #1133 and #1134 and prepared draft
PR #1135. Their lifecycle remains upstream-owned and independent of this plan.

## Walking skeleton

- [x] Discover an explicit plugin directory from the workbench dev server.
- [x] Inspect `package.json` plus native `dist/*.meta.json` without loading
      plugin code.
- [x] Show one compact Plugin Lab view with Fixture, Harness, and Live modes.
- [x] Make Harness availability depend on resolving the official testing
      package, with an actionable unavailable state.
- [x] Use native `bb plugin list --json` and `bb plugin source --json` for live
      installation/runtime status.
- [x] Keep the current deterministic sidebar fixture as the first visual
      surface and label it honestly as a fixture.
- [x] Cover discovery and compatibility logic with focused tests.
- [x] Verify the workbench build and the browser preview through bb Connect.

## Explicit non-goals

- No second plugin manifest, installer, compiler, registry, or fake SDK.
- No automatic plugin code execution during discovery.
- No content-script mounting in the workbench.
- No dependency on `/Users/mg/Developer/bb/bb` or `galligan/bb` at runtime.
- No SDK publication, plugin publication, upstream edit, or PR status/metadata
  mutation.

## Follow-on after the walking skeleton

When #1134 establishes a supported `@bb/plugin-sdk` distribution, add a narrow
harness adapter that imports the official testing subpaths and runs
plugin-owned stories/tests. Expand the surface matrix only from the public
`CapturedPluginApp` contract, and validate every visually exact result in live
bb.
