# Plugin Studio identity, runtime, and compatibility convergence

Date: 2026-08-13
Status: Planned; tracker reconciled and implementation split into focused issues
Parent: [#21](https://github.com/galligan/bb-plugin-studio/issues/21)

## Outcome

Finish the transition from the original Mate implementation to a native bb
Plugin Studio:

- maintained technical identities converge on `bb-plugin-studio` terminology;
- existing users and installed state migrate transactionally rather than
  through removal/reinstallation;
- primary-host discovery no longer requires a packaged child runtime or private
  loopback API;
- enrolled-host discovery waits for a bounded public bb capability rather than
  using hidden terminals or unrestricted execution; and
- compatibility promises a minimum bb version while newer releases remain
  usable and auditable.

## Current verified state

- The GitHub repository is `galligan/bb-plugin-studio`; the old repository URL
  redirects correctly.
- The visible product is Plugin Studio, but active technical identities still
  include `bb-mate`, `@bb-mate/*`, `bb-plugin-mate`, `mate`, `plugins/mate`,
  runtime/data-root names, `workbench`, and `plugin-workbench`.
- The installed `mate` path source still targets the removed checkout path and
  is unhealthy. Its persistent runtime database contains real catalog and event
  state. Current bb has no supported preserve-state source-retarget operation.
- bb 0.37 exposes public RPC, lifecycle, storage/migrations, HTTP/realtime, CLI,
  project/thread, and tool surfaces sufficient to remove the child runtime for
  primary-host discovery.
- bb's current routed file listing is not a safe substitute for the hardened
  scanner on enrolled hosts because traversal work is not bounded before
  result truncation.
- The existing `>=0.36` engine promise is open-ended, but the compatibility
  checker incorrectly treats audited 0.36 as an exact installed version. bb
  0.37 also changes backend declarations without changing the SDK package
  version.

## Work graph

### Technical identity migration

- [ ] [#86](https://github.com/galligan/bb-plugin-studio/issues/86) — parent
- [ ] [#94](https://github.com/galligan/bb-plugin-studio/issues/94) — repair the
      installed source through a supported preserve-state path
- [ ] [#95](https://github.com/galligan/bb-plugin-studio/issues/95) — migrate
      CLI/package/source/plugin/runtime identities with compatibility and
      rollback

Historical release evidence and Git history retain truthful old names. Current
old-name exceptions must be isolated to a compatibility manifest/module and
retired under a versioned policy.

### Native-runtime convergence

- [ ] [#96](https://github.com/galligan/bb-plugin-studio/issues/96) — parent
- [ ] [#98](https://github.com/galligan/bb-plugin-studio/issues/98) — runtime
      boundary ADR and live schema inventory
- [ ] [#99](https://github.com/galligan/bb-plugin-studio/issues/99) — in-process
      primary-host discovery with shadow parity
- [ ] [#100](https://github.com/galligan/bb-plugin-studio/issues/100) — migrate
      the target catalog into bb-owned plugin storage
- [ ] [#101](https://github.com/galligan/bb-plugin-studio/issues/101) — remove
      child supervision, private HTTP/auth, and packaged runtime
- [ ] [#102](https://github.com/galligan/bb-plugin-studio/issues/102) — add
      bounded host-routed discovery to public bb

Critical path: #98 → (#99 and #100) → #101. #102 can proceed in parallel and
blocks full enrolled-machine parity, but it does not block removing the child
runtime for primary-host Studio use.

### Compatibility and scanner hardening

- [ ] [#93](https://github.com/galligan/bb-plugin-studio/issues/93) — minimum
      `0.36.0`, separately tracked verified-through `0.37.0`, and a nonfatal
      newer-than-verified result
- [ ] [#97](https://github.com/galligan/bb-plugin-studio/issues/97) — bounded
      per-directory enumeration and measured pathological-tree proof

Required PR CI uses immutable exact minimum and exact verified-through lanes.
Mutable npm latest runs on a scheduled, non-required audit lane that opens or
updates one deduplicated drift issue.

## Migration rules

- Do not remove/reinstall a managed plugin to apply a rename.
- Do not read, copy, log, or directly edit host-owned secrets or databases.
- Preserve target IDs, revisions, scopes, retirements, relevant history, routes,
  skills, deep links, and rollback through the identity/storage migration.
- Do not replace the hardened scanner with `bb.sdk.files.listPaths`.
- Never use hidden terminals or arbitrary command execution as a filesystem
  compatibility layer.
- No private bb imports.
- No npm publication, release, upstream PR, primary-profile destructive
  migration, or compatibility-alias retirement without separate authority.

## Verification

Each implementation issue owns focused tests and must also preserve the
appropriate exact-minimum/current-bb typecheck, build, visual/axe, migration,
clean-room, package inspection, live Plugin Studio, path-non-disclosure, and
rollback gates. Hosted CI must be green before a PR leaves draft.
