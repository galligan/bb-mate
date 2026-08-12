# Contributing to BB Mate

Thanks for helping improve BB Mate. This project is an experimental companion to
[bb](https://github.com/get-bb/bb), and contributions should preserve that
upstream boundary.

## Before you start

For bugs and small documentation fixes, open a focused pull request or
[GitHub Issue](https://github.com/galligan/bb-mate/issues).

For a larger feature, open an issue first so we can agree on the problem,
scope, and whether it belongs in BB Mate or upstream bb. Native bb owns plugin
contracts and lifecycle; BB Mate should not grow a competing SDK, runtime,
installer, registry, or host UI.

Please report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/galligan/bb-mate/security/advisories/new),
not through an issue.

## Set up the repository

BB Mate uses Bun:

```sh
git clone https://github.com/galligan/bb-mate.git
cd bb-mate
bun install --frozen-lockfile
```

Run the workbench:

```sh
bun run dev
```

Run the CLI from source:

```sh
bun run bb-mate --help
bun run bb-mate inspect /absolute/path/to/plugin
```

## Design boundaries

- `apps/workbench` is browser-only Fixture tooling and must work without a bb
  server.
- `plugins/mate` is the Studio-owned native integration plugin and uses only
  public plugin contracts. Independently distributed plugins belong in
  [bb-plugins](https://github.com/galligan/bb-plugins) and can be inspected
  here by path.
- Native bb owns scaffold, declaration refresh, build, install, update,
  dev/reload, host UI, and runtime behavior.
- BB Mate may inspect, explain, orchestrate native commands, render deterministic
  fixtures, and hand work off to live bb.
- Official Harness code must come from the selected plugin's
  `@bb/plugin-sdk/testing` dependencies. Do not copy it from upstream or
  reimplement it here.
- Fixtures are deterministic approximations. Live bb remains the visual and
  integration authority.
- Passive inspection must not import or execute plugin code.
- Never commit secrets, authenticated browser state, customer data, or local
  absolute paths.

Read [docs/trust-model.md](docs/trust-model.md) before changing command execution
or server boundaries. Document any new filesystem, network, secret, or
external-service access.

A local checkout of upstream bb may be useful for read-only comparison, but it
is not a BB Mate dependency. Changes to bb or `@bb/plugin-sdk` belong in
[get-bb/bb](https://github.com/get-bb/bb).

## Verification

Run the smallest relevant check while iterating, then the complete repository
gate before pushing:

```sh
bun run format:check
bun run check
bun run test
bun run build
```

UI changes also require:

```sh
bun run visual:test
```

Changes to the published package contents or lifecycle also require:

```sh
bun run package:inspect
bun run package:test
```

New behavior should include focused tests. Documentation commands should be
copyable and verified in a clean checkout or isolated installation. Native
commands that would mutate a developer's bb state should be covered by exact
argv tests rather than run against a normal profile.

## Pull requests

Use a Conventional Commit title such as `feat: ...`, `fix: ...`, or
`docs: ...`. Keep the pull request draft until CI is green, and include:

- why the change is needed;
- what changed;
- how it was verified;
- any security, compatibility, or rollout risk.

Keep changes focused and resolve every review thread. Maintainers may mirror
public issues into their project tracker; contributors do not need access to
that tracker or a particular branch-management tool.

Package publication, Git tags, GitHub releases, and compatibility-target changes
are maintainer release actions and should not be included in an ordinary feature
pull request.
