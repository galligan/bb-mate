# BB Mate local alpha artifact

This private package is a local-only BB Mate candidate. It contains a bundled
`bb-mate` CLI and the deterministic static surface lab; it does not contain bb,
plugin packages, a copied plugin SDK, or authenticated host state.

## Runtime support

- Bun 1.3.14 is the verified `bb-mate` runtime. Newer engine-compatible Bun
  versions are best-effort until added to CI.
- npm may install or inspect the tarball, but Node is not a supported CLI
  runtime.
- Native bb handoffs target the supported macOS bb host. Fixture inspection and
  the packaged surface lab are also exercised in isolated Linux CI.
- The package is `private` and `UNLICENSED`. Neither this artifact nor its
  version is approved for registry publication.

## Build and inspect

From a clean BB Mate checkout:

```sh
bun install --frozen-lockfile
bun run package:artifact
bun run package:inspect
```

The first command produces `artifacts/bb-mate-0.1.0-alpha.0.tgz`. npm's pack
report exposes every included file; the package manifest allowlists only
`README.md`, `package.json`, self-contained third-party notices/licenses, the
bundled CLI, and static lab assets.

## Temporary local installation

Choose an empty prefix and install the generated file without publishing:

```sh
plugin="/absolute/path/to/plugin"
prefix="$(mktemp -d)"
npm install --prefix "$prefix" --no-save --package-lock=false ./artifacts/bb-mate-0.1.0-alpha.0.tgz
export PATH="$prefix/node_modules/.bin:$PATH"
bb-mate --help
bb-mate inspect "$plugin"
bb-mate dev "$plugin"
```

Open the printed loopback URL, then stop the foreground server with Control-C
before uninstalling in the same shell:

```sh
npm uninstall --prefix "$prefix" --no-save --package-lock=false bb-mate
```

`inspect` reads manifests and generated metadata without executing the plugin.
When native `bb` is missing, the report names that unavailable capability and
still permits Fixture use. In the installed artifact, `dev` serves the packaged
13-story surface lab; it does not install, build, reload, or run plugin code.
Source-checkout `dev` continues to launch the interactive Vite workbench.
The packaged static server binds only to `127.0.0.1`, `::1`, or `localhost`,
confines decoded requests and resolved symlinks to its generated lab directory,
and accepts only GET/HEAD. It never exposes plugin or inspection data over HTTP.

Native `check` and `live` remain explicit terminal handoffs and fail clearly
when a compatible `bb` executable or installed path plugin is unavailable.
Harness remains unavailable unless the selected plugin installs the official
public testing package.
