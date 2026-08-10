# BB Mate

BB Mate is an experimental, fixture-driven authoring companion for native
[bb](https://github.com/get-bb/bb) plugins.

The package contains the `bb-mate` CLI and a deterministic static plugin-surface
lab. It does not contain bb, plugin packages, a copied plugin SDK, or
authenticated host state.

> BB Mate is an independent community project. Native bb and
> `@bb/plugin-sdk` remain authoritative for plugin contracts, scaffolding,
> build/install/dev behavior, host rendering, and runtime state.

## Install

```sh
npm install --global bb-mate@alpha
bb-mate --help
```

From an existing plugin directory:

```sh
bb-mate inspect .
bb-mate dev .
```

Use the `alpha` tag explicitly. This is a prerelease and its command surface
may change.

## Commands

```text
bb-mate inspect <plugin>  Read manifests, native metadata, and compatibility
bb-mate dev <plugin>      Open the packaged Fixture surface lab
bb-mate check <plugin>    Inspect, delegate bb plugin build, inspect again
bb-mate live <plugin>     Hand off an installed path plugin to bb plugin dev
```

`inspect` is passive: it does not import or execute the selected plugin.

`check` and `live` cross the passive boundary by delegating to the native
`bb` CLI with inherited output. `live` runs only when bb confirms that the
same real plugin path is installed; otherwise it prints the native installation
command without running it.

The installed `dev` command serves the bundled 13-story lab on loopback. It
does not install, build, reload, or run the selected plugin, and it never serves
inspection data over HTTP.

## bb, the SDK, and BB Mate

- **bb** owns scaffolding, declaration refresh, build, install, update,
  dev/reload, host UI, and live runtime.
- **`@bb/plugin-sdk`** owns the typed backend/frontend contracts and official
  testing contracts.
- **BB Mate** adds passive inspection, deterministic Fixture stories,
  compatibility diagnostics, visual/a11y tooling, and native handoff.

BB Mate never copies the SDK testing harness or uses private bb application code
as a substitute. Harness mode remains unavailable until the selected plugin can
resolve the official testing package and BB Mate has an upstream-backed adapter.
Live bb is always the visual and integration authority.

Learn more in the
[repository README](https://github.com/galligan/bb-mate#readme) and
[plugin-author guide](https://github.com/galligan/bb-mate/blob/main/docs/plugin-author-guide.md).

## Runtime support

- Bun 1.3.14 is the verified runtime; newer engine-compatible Bun versions are
  best-effort until added to CI.
- npm is the installer, but Node is not a supported CLI runtime.
- Native handoffs target a supported macOS bb host.
- Fixture and package checks are also exercised in isolated Linux CI.

The repository also builds a separate, unsigned macOS arm64 executable for
isolated Plugin Workbench development:

```sh
bun run standalone:build
bun run standalone:inspect
bun run standalone:test
```

That executable embeds the exact deterministic lab and is verified after being
moved away from the checkout with an empty `PATH` and no global Bun. It is an
internal build artifact: the npm package still ships the Bun-based CLI, and the
standalone executable is not published, signed, notarized, or installed by
these commands.

## Trust and security

Plugins are full-trust local code. Review a plugin before using native
`check` or `live` handoffs. See the
[trust model](https://github.com/galligan/bb-mate/blob/main/docs/trust-model.md)
for the filesystem, network, secret, and execution boundaries.

Report bugs through
[GitHub Issues](https://github.com/galligan/bb-mate/issues). Report
vulnerabilities privately through
[GitHub Security Advisories](https://github.com/galligan/bb-mate/security/advisories/new).

## Source and license

Source: <https://github.com/galligan/bb-mate>

BB Mate is available under the
[MIT License](https://github.com/galligan/bb-mate/blob/main/LICENSE). bb and its
plugin SDK are separate upstream software governed by their own repository and
license.
