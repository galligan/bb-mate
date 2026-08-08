# Support and compatibility policy

BB Mate `0.1.0-alpha.1` is an MIT-licensed public npm alpha. It has no public
support commitment, stable API guarantee, or response-time SLA. The GitHub
repository remains private, so publication does not provide a public issue
tracker or grant repository access.

## Supported line

- Source: the current green `main` snapshot.
- npm package: the exact `bb-mate@0.1.0-alpha.1` artifact published under the
  `alpha` dist-tag and reproduced from the recorded release commit.
- Toolchain: Bun 1.3.14, pinned by `packageManager`, and the npm installer path
  documented in [docs/local-package.md](docs/local-package.md). Newer versions
  accepted by the package engine are best-effort until added to CI.
- Native integration: the one bb release recorded in
  `compatibility/bb-target.json`, plus plugin engine ranges that honestly include
  that release.
- Platforms: macOS for native bb handoffs; macOS and GitHub's moving
  `ubuntu-latest` runner for aggregate/package checks; and the versioned
  Playwright 1.62.1 Noble container for Linux Fixture visual baselines.

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

Alpha commands, fixtures, and package contents may change between prereleases.
When a supported BB Mate path is replaced, changes should:

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

If you have Outfitter Linear or private repository access, use the linked issue
for project work. Public npm users should contact an npm-listed maintainer
through an existing private channel; this alpha does not yet offer a public
support queue. Include the BB Mate version, `bun --version`, native
`bb --version` when used, the selected plugin's engine ranges, the exact command
and exit status, and sanitized diagnostics. Do not attach secrets,
authenticated state, customer data, or unredacted local paths.

Potential vulnerabilities follow [SECURITY.md](SECURITY.md), not the ordinary
support queue.

## Release boundary

The npm package is public under MIT while the repository remains private. Each
later registry version, repository-visibility change, tag, GitHub release, or
announcement remains an explicit owner decision. Before one of those actions,
record:

- the package and license metadata;
- supported versions and platforms;
- release channel, version, provenance, and rollback plan;
- security contact and disclosure expectations;
- announcement text and audience.

OS-645 records the owner-approved `bb-mate@0.1.0-alpha.1` npm release under the
`alpha` dist-tag. npm's first-package bootstrap also created its mandatory
`latest` tag at that same only version; an authenticated removal attempt returned
E400. OS-645 does not authorize intentionally repointing it, creating a Git tag
or GitHub release, changing visibility, or announcing availability.
