# bb Plugin Studio

bb Plugin Studio is an experimental, fixture-driven authoring companion for native
[bb](https://github.com/get-bb/bb) plugins.

The CLI package contains the command and deterministic static plugin-surface lab.
It does not bundle bb, third-party plugin packages, a copied plugin SDK, or
authenticated host state. The repository also contains the separately packaged
Studio-owned integration plugin used for native bb testing.

> bb Plugin Studio is an independent community project. Native bb and
> `@bb/plugin-sdk` remain authoritative for plugin contracts, scaffolding,
> build/install/dev behavior, host rendering, and runtime state.

## Try the source preview

```sh
git clone https://github.com/galligan/bb-plugin-studio.git
cd bb-plugin-studio
bun install --frozen-lockfile
bun run bb-mate --help
bun run dev
```

bb Plugin Studio is not currently distributed as a public installable package.
The supported first-contact path is this experimental source preview. The older
`bb-mate` npm artifact is not the current onboarding path.

`bb-mate` is the current compatibility command. It predates the product rename
and is not the product name or the name of a new public package.

To inspect an existing plugin source tree explicitly:

```sh
bun run bb-mate inspect /absolute/path/to/plugin
bun run bb-mate dev /absolute/path/to/plugin
```

See the
[source preview guide](https://github.com/galligan/bb-plugin-studio/blob/main/docs/source-preview.md)
for native handoff side effects, confidence levels, and current limitations.

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

The source `dev` command serves the 13-story lab on loopback. It does not
install, build, reload, or run the selected plugin. The source development
server exposes a bounded inspection session for the explicitly selected tree;
the packaged static lab does not serve inspection data over HTTP.

## bb, the SDK, and bb Plugin Studio

- **bb** owns scaffolding, declaration refresh, build, install, update,
  dev/reload, host UI, and live runtime.
- **`@bb/plugin-sdk`** owns the typed backend/frontend contracts and official
  testing contracts.
- **bb Plugin Studio** adds passive inspection, deterministic Fixture stories,
  compatibility diagnostics, visual/a11y tooling, and native handoff.

bb Plugin Studio never copies the SDK testing harness or uses private bb application code
as a substitute. Harness mode remains unavailable until the selected plugin can
resolve the official testing package and bb Plugin Studio has an upstream-backed adapter.
Live bb is always the visual and integration authority.

Learn more in the
[repository README](https://github.com/galligan/bb-plugin-studio#readme) and
[plugin-author guide](https://github.com/galligan/bb-plugin-studio/blob/main/docs/plugin-author-guide.md).

## Runtime support

- Bun 1.3.14 is the verified runtime; newer engine-compatible Bun versions are
  best-effort until added to CI.
- The clean-room packaging lane uses npm for artifact inspection, but no
  current public package is the supported installation path. Node is not a
  supported CLI runtime.
- Native handoffs target a supported macOS bb host.
- Fixture and package checks are also exercised in isolated Linux CI.

The repository also builds a separate, unsigned macOS arm64 executable for
isolated Plugin Studio development:

```sh
bun run standalone:build
bun run standalone:inspect
bun run standalone:test
```

That executable embeds the exact deterministic lab and is verified after being
moved away from the checkout with an empty `PATH` and no global Bun. It is an
internal build artifact: it is not published, signed, notarized, or installed
by these commands.

## Trust and security

Plugins are full-trust local code. Review a plugin before using native
`check` or `live` handoffs. See the
[trust model](https://github.com/galligan/bb-plugin-studio/blob/main/docs/trust-model.md)
for the filesystem, network, secret, and execution boundaries.

Report bugs through
[GitHub Issues](https://github.com/galligan/bb-plugin-studio/issues). Report
vulnerabilities privately through
[GitHub Security Advisories](https://github.com/galligan/bb-plugin-studio/security/advisories/new).

## Source and license

Source: <https://github.com/galligan/bb-plugin-studio>

bb Plugin Studio is available under the
[MIT License](https://github.com/galligan/bb-plugin-studio/blob/main/LICENSE). bb and its
plugin SDK are separate upstream software governed by their own repository and
license.
