---
name: update-plugin-studio-compatibility
description: Audit and adopt a newly released stable bb version in bb Plugin Studio. Use when npm publishes a newer bb-app release, the scheduled compatibility watch opens or updates an issue, compatibility/bb-target.json is stale, or a maintainer asks to verify bb Plugin Studio against a new bb release.
---

# Update bb Plugin Studio Compatibility

Keep the update evidence-led and reversible. Native bb owns plugin lifecycle and
public contracts; bb Plugin Studio compatibility adoption records, tests, and
adopts released contracts without editing upstream or inventing substitutes.

## Establish the release

1. Read `AGENTS.md`, `docs/compatibility-target.md`,
   `compatibility/bb-target.json`, and the compatibility-watch issue.
2. Inspect the working tree and existing plan before interpreting the release
   check. Resume one clearly owned adoption effort; do not start a duplicate
   plan, issue, or branch over compatible in-progress changes.
3. Run `bun run compatibility:latest --json`. Stop when the target is current
   only if there is no explicit revalidation request and no matching adoption
   already in progress.
4. Verify npm's stable version and the immutable `desktop-v<version>` tag from
   official sources. Read the upstream changelog and compare the old and new
   tags, focusing on plugin SDK, CLI, registry, theme, and host UI changes.
5. Start or resume a dated plan under `.agents/plans/` and keep the GitHub issue
   current.

## Probe without touching normal bb

1. Install the exact `bb-app@<version>` into a `mktemp -d` prefix. Do not
   globally install it or upgrade the desktop app.
2. Use that prefix's `bb` and `bb-app`. When a server is required, give it a
   disposable `BB_DATA_DIR`, unused loopback ports, and an isolated log.
3. Confirm the isolated inventory contains only builtins and Connect is
   unpaired before exercising native behavior.
4. Set `BB_CLI`, `BB_CLI_REEXEC=1`, `BB_SERVER_URL`, and `BB_DATA_DIR` only on
   bb Plugin Studio commands scoped to the disposable profile. Direct calls to the
   selected `bb` or `bb-app` must remove `BB_CLI` and `BB_CLI_REEXEC`; bb Plugin Studio
   must likewise sanitize them before the selected CLI re-executes itself.

## Review the contract

- Compare the public SDK version and exports, component registry digest and
  item set, tracked dependency ranges, measured theme tokens, and public
  registration paths.
- Run `bb plugin types --check plugins/studio`. If stale, refresh only through
  the selected released bb and review the generated declaration diff.
- Build the Studio-owned integration plugin with the selected bb and inspect every
  `dist/*.meta.json` identity and SDK stamp.
- Exercise `bun run bb-plugin-studio inspect`, `check`, `dev`, and the guarded `live`
  handoff against the isolated profile. `bb-plugin-studio` is the current compatibility
  command; passive discovery must not execute plugin code.
- Compare representative Fixture states with live bb. Keep Fixture, Harness,
  and Live claims distinct; unavailable Harness support remains unavailable.

## Make the minimum adoption change

- Update `compatibility/bb-target.json` only after reviewing the observations.
- Keep the workspace `bb-app` build pin aligned with the minimum release so the
  default local/package lane continuously proves the support floor. Exercise
  the verified-through and candidate releases through the exact isolated CI
  installs; do not move the workspace pin merely to adopt a newer verified
  boundary.
- Update current compatibility and authoring instructions. Preserve dated
  trial reports and release handoffs as historical evidence.
- Change implementation only when the released public contract requires it.
  Do not import `../bb`, copy the official harness, or create fallback host
  behavior.

## Verify and hand off

Run, at minimum:

```sh
bun run compatibility:latest --json
bun run compatibility:check
bb plugin types --check plugins/studio
bun run format:check
bun run check
bun run test
bun run build
bun run visual:test
```

Use the exact isolated `BB_CLI` for the target-specific commands. Record the
upstream tag/commit, package version, SDK version, registry digest, native
artifact metadata, isolated-profile result, visual comparison, and full gate
results in the plan and PR.

Keep the PR draft until hosted CI is green. Link it to the compatibility issue.
Do not merge, publish, tag, upgrade normal bb, or close the issue unless the
current request authorizes that boundary.

## Automation boundary

The scheduled workflow may read npm and create or update one deduplicated issue.
It must never change the target, push a branch, install or upgrade normal bb,
edit upstream, publish, or treat an unreleased/nightly build as stable.
