# Support and compatibility policy

BB Mate is a private `0.1.0-alpha.0` development tool. It has no public support
commitment, stable API guarantee, or response-time SLA. Access does not imply a
license grant or permission to redistribute it.

## Supported line

- Source: the current green `main` snapshot.
- Local package: the exact private alpha artifact produced and verified by that
  snapshot.
- Toolchain: the Bun version pinned by `packageManager` and the npm installer
  path documented in [docs/local-package.md](docs/local-package.md).
- Native integration: the one bb release recorded in
  `compatibility/bb-target.json`, plus plugin engine ranges that honestly include
  that release.
- Platforms: macOS for native bb handoffs; macOS and the pinned Linux CI image
  for deterministic Fixture/package checks as documented.

Old source snapshots, modified tarballs, alternate runtimes, undeclared bb/SDK
versions, and third-party plugin behavior are best-effort only.

Run the current compatibility measurement before diagnosing a native mismatch:

```sh
bun run compatibility:check
```

The report fails closed when its public upstream evidence cannot be verified.
An outage or unavailable probe is not evidence of compatibility. Follow
[docs/compatibility-target.md](docs/compatibility-target.md) to update the
recorded target deliberately.

## Fidelity support

- Fixture issues cover deterministic BB Mate stories and adapters only.
- Harness issues are in scope only after the selected plugin resolves the
  official testing package and BB Mate ships an upstream-backed adapter.
- Live bb issues must be reproduced against the recorded target. Live bb is the
  visual/integration authority; Fixture screenshots cannot overrule host
  behavior.

When the problem is native scaffolding, build/install/dev behavior, host chrome,
routing, or runtime, report it upstream to bb with a minimal reproduction. BB
Mate may improve its diagnosis or handoff but will not maintain a competing
implementation.

## Changes and deprecation

Private alpha commands, fixtures, and package contents may change between green
`main` snapshots. When a supported BB Mate path is replaced, changes should:

1. name the replacement in the issue, changelog/release handoff, or command
   diagnostic;
2. keep one clear path rather than parallel permanent modes;
3. preserve the old path for at least one planned alpha handoff when practical;
4. remove it immediately when retention would create a security or data-loss
   risk, with that exception documented.

When upstream bb adds a native capability that replaces a BB Mate seam, BB Mate
adopts it and deletes or deprecates the duplicate. The downstream tool is
designed to be removable, not to freeze older native workflows.

## Asking for help

Use a Linear issue in the Outfitter workspace for private project work. Include
the BB Mate commit, artifact version if applicable, `bun --version`, native
`bb --version` when used, the selected plugin's engine ranges, the exact command
and exit status, and sanitized diagnostics. Do not attach secrets, authenticated
state, customer data, or unredacted local paths.

Potential vulnerabilities follow [SECURITY.md](SECURITY.md), not the ordinary
support queue.

## Release and license gate

The repository and local package are currently private and `UNLICENSED`. No
public-use, modification, redistribution, or publication permission is granted.
Before any repository-visibility or registry-publication change, the owner must
explicitly approve:

- a public license and corresponding repository/package metadata;
- supported versions and platforms;
- release channel, version, provenance, and rollback plan;
- security contact and disclosure expectations;
- announcement text and audience.

Until those decisions are recorded, do not publish, tag, create a release,
change visibility, or announce availability. The alpha release handoff may make
these decisions ready for approval, but it does not approve or execute them.
