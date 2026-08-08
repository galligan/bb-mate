# Changelog

BB Mate is a private alpha. This changelog records reviewable local candidates;
it does not imply publication, a public license, or a stable support promise.

## 0.1.0-alpha.0 — private local candidate

### Added

- Actionable plugin discovery and compatibility inspection with bounded native
  bb evidence and explicit remediation.
- A thin `bb-mate` CLI for Fixture launch, inspection, native checking, and Live
  handoff without replacing bb build/install/dev ownership.
- A 13-surface public plugin UI catalog, deterministic fixtures, Ladle stories,
  the Mate launcher, visual regression, and accessibility coverage.
- A reproducible 40-file local archive, external-author guide, trust/support
  policies, compatibility drift checks, and a clean-room alpha trial.

### Changed

- Native bb 0.35.1 and plugin SDK metadata 0.4.1 are the recorded compatibility
  target.
- Source and packaged Fixture servers remain distinct: source provides bounded
  passive inspection; the package serves loopback-only static assets.

### Fixed

- Clean runners resolve native `bb plugin build` from the pinned `bb-app`
  dependency.
- Native handoffs consume bb re-exec selectors without losing the canonical bb
  selected for browser inspection.
- Clean-room process shutdown terminates wrapper and child servers and verifies
  their ports close.

### Known limitations

- Fixture is a deterministic approximation, not exact bb host rendering.
- Harness remains unavailable until the official SDK testing package is
  publicly consumable and BB Mate adds the upstream-backed adapter.
- A real frontend reference plugin, native scaffold/check adoption,
  multi-plugin collection manifest, sanctioned registry/style updates, and
  complete Live parity remain upstream-dependent work.
- The package is `private: true`, `UNLICENSED`, unpublished, and supported only
  as the exact private local artifact identified in the release handoff.
