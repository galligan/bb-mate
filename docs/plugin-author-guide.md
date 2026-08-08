# External plugin-author guide

This guide assumes you have an existing bb plugin and no private knowledge of
the repository's design history. BB Mate is an optional downstream authoring
companion: native bb still owns scaffold, declaration refresh, build, install,
dev/reload, and the live runtime.

## Prerequisites

- access to this private repository;
- Bun 1.3.14, the currently verified version; newer engine-compatible versions
  are best-effort until added to CI;
- npm for inspecting and temporarily installing the local alpha archive;
- an existing bb plugin when you want inspection or native handoff guidance;
- native bb 0.35.1, the currently recorded target, for supported native
  inspection, build, or Live handoffs. Other versions may still produce useful
  diagnostics but are best-effort until the compatibility target is updated.

Install native bb through its own supported distribution before using native
handoffs. The local BB Mate artifact does not bundle, install, configure, or
start bb on the author's behalf.

Fixture exploration does not require native bb, Connect, secrets, a sibling
`../bb` checkout, or a published `@bb/plugin-sdk` package.

## Reach the first Fixture story

From a fresh checkout:

```sh
bun install --frozen-lockfile
bun --filter @bb-mate/workbench stories --host 127.0.0.1 --port 61000
```

Open
<http://127.0.0.1:61000/?story=surfaces--sidebar-thread-list--catalog-fixtures>.
The lab has one story group for each cataloged public plugin surface. Its
fixture, theme, and viewport controls are URL-backed, so a selected state can be
reloaded or shared without creating plugin or bb state.

The command runs repository development code and serves HTTP on loopback. Story
discovery never imports a selected plugin, and content-script stories remain
inert. Stop the server with Control-C.

## Inspect an existing plugin

Run BB Mate from this repository and pass an explicit plugin directory:

```sh
plugin="/absolute/path/to/plugin"
bun run bb-mate --help
bun run bb-mate inspect "$plugin"
bun run bb-mate inspect "$plugin" --json
```

Inspection reads `package.json`, native `dist/*.meta.json`, and passive native
bb/Connect reports. It does not import the plugin entrypoint. An unavailable bb,
Connect, npm SDK publication, or Harness can make inspection exit nonzero; the
report still explains each capability independently and keeps Fixture use
available.

For an interactive source-checkout workbench around that plugin:

```sh
bun run bb-mate dev "$plugin" --host 127.0.0.1 --port 5173
```

The bare form is equivalent:

```sh
bun run bb-mate "$plugin"
```

The server performs the same passive inspection before it starts. Keep the host
on loopback unless you intentionally want the Fixture server reachable from
another machine. BB Mate reports existing Connect shares but never exposes,
unexposes, or pairs Connect.

## Native build and Live handoffs

These commands cross the passive boundary:

```sh
bun run bb-mate check "$plugin"
bun run bb-mate live "$plugin"
```

`check` delegates exactly `bb plugin build .` in the selected plugin and then
refreshes the compatibility report. It can execute the plugin's build toolchain
and writes native build artifacts.

`live` delegates exactly `bb plugin dev .` only after native bb proves that the
same real plugin path is installed. If it is not installed, BB Mate prints the
exact `bb plugin install <path> --yes` handoff and exits; it does not run the
installation. Native dev executes full-trust plugin code and may reload the
installed plugin. Review the [trust and operation model](trust-model.md) before
using either command on code you do not trust.

Set `BB_CLI` to an exact executable when you need to override the `bb` found on
`PATH`:

```sh
BB_CLI=/absolute/path/to/bb bun run bb-mate inspect "$plugin"
```

## Use the local alpha artifact

The private package supports Fixture exploration outside the source checkout:

```sh
bun run package:artifact
plugin="/absolute/path/to/plugin"
prefix="$(mktemp -d)"
npm install --prefix "$prefix" --no-save --package-lock=false ./artifacts/bb-mate-0.1.0-alpha.0.tgz
"$prefix/node_modules/.bin/bb-mate" --help
"$prefix/node_modules/.bin/bb-mate" dev "$plugin"
```

Open the printed loopback URL, then stop the foreground server with Control-C
before uninstalling in the same shell:

```sh
npm uninstall --prefix "$prefix" --no-save --package-lock=false bb-mate
```

The installed `dev` serves the packaged static lab rather than the source Vite
workbench. It binds only to loopback and does not serve inspection data. The
archive remains private, `UNLICENSED`, and unsupported for registry publication.
The reproducible artifact and clean-room lifecycle are specified in
[local-package.md](local-package.md).
Release-candidate maintainers can reproduce the source, packaged, and isolated
native lanes with the [clean-room alpha trial runbook](alpha-trial-runbook.md).

## Plugin package boundary

A plugin is an independently versioned package, not a BB Mate workspace
manifest. The expected boundary is:

```text
my-plugin/
  package.json       name, version, engines, and public bb manifest
  server.ts          optional server entrypoint declared by bb.server
  app.tsx            optional frontend entrypoint declared by bb.app
  tests/              package-owned tests
  assets/             package-owned assets
  dist/               native bb build metadata and bundles
```

Declare honest `engines.bb` and `engines.bbPluginSdk` ranges. Frontend adapters
that import `@bb/plugin-sdk/app` belong inside the plugin entrypoint or a thin
plugin-owned adapter because that runtime exists only inside bb. Reusable visual
components should stay host-neutral; add a shared BB Mate package only after two
real consumers need the same boundary.

Do not import application internals, copy the plugin SDK or testing harness, or
depend on `../bb`. Use native bb scaffolding and declaration refresh. If an
official testing package cannot resolve from the selected plugin's installed
dependencies, Harness is unavailable.

## Confidence levels

| Level   | What it proves                                      | What it does not prove                         |
| ------- | --------------------------------------------------- | ---------------------------------------------- |
| Fixture | Deterministic component state and bounded visuals   | Public SDK behavior, host CSS, or integration  |
| Harness | Public behavior through official testing contracts  | Exact host chrome, layout, routing, or runtime |
| Live bb | Real plugin integration inside the supported bb app | Compatibility with untested future bb releases |

Fixture is intentionally an approximation. Harness stays disabled until both
the official `@bb/plugin-sdk/testing` package resolves and BB Mate has an
upstream-backed adapter. Live bb is the visual authority because bb owns the
actual host layout, styling, routing, state, action lifecycle, and runtime.

## Before you contribute or ask for support

- Run the compatibility checker and read its target assumptions:

  ```sh
  bun run compatibility:check
  ```

- Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for change and verification
  requirements.
- Use [SUPPORT.md](../SUPPORT.md) to determine whether a bb/SDK combination is
  in scope and find the repository-local intake path when you do not have
  Outfitter Linear access.
- Read [SECURITY.md](../SECURITY.md) before reporting a vulnerability or
  handling plugin secrets.

The copyable non-mutating paths above are covered by clean-runner CI, the
13-story browser matrix, and the isolated package lifecycle. Native mutation
handoffs are unit-tested for exact argv and remain user-invoked; this guide does
not silently exercise them.
