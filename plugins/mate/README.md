# Plugin Studio

`bb-plugin-mate` is the released-contract bb host shell for the packaged `bb-mate`
runtime. Opening Plugin Studio first requests a read-only status snapshot
from the schema-v3 contract. That request does not start the runtime, open its
catalog, or inspect project source. It may report the current runtime state as
idle, starting, ready, stopping, unavailable, or failed without changing it.

After that initial status, the panel automatically performs one bounded refresh
across all eligible bb-registered local projects. The refresh icon repeats the
same all-project operation; there is no per-project selector or admit action.
Passive discovery checks each project root and packages inside its declared npm
or Bun workspace configuration, including supported bounded
`pnpm-workspace.yaml` patterns. All projects and their plugin inventories stay
expanded, and each plugin row opens that target's detail view.

Each refresh returns a finite, redacted point-in-time snapshot rather than a
realtime monitor. The runtime owns target identity and returns only bounded
opaque projections. Plugin Studio does not execute target code, package
scripts, native plugin lifecycle commands, or installed-plugin inventory.
Source paths remain server-private, and the plugin never prints or exposes a
runtime URL, credential, process ID, installed path, source paths, or host
topology. Preview remains unavailable under #70.

## Development

Use the repository scripts to build and inspect the exact package. Native bb
remains the lifecycle authority for plugin build, path install, development,
reload, disable, and removal.

```sh
bun --filter bb-plugin-mate check
bun --filter bb-plugin-mate test
bun run mate:package:test
```

The macOS arm64 package gate stages the deterministic standalone executable,
verifies its manifest and embedded backend stamp, runs released bb 0.36's
plugin build, and inspects the resulting npm tarball. The package and its
manifest remain `private: true`: the tarball is for local verification only,
not for upload, registry publication, release, or external redistribution.
The exact Bun 1.3.14 license is included as `BUN_LICENSE.md`; a separate
tracked gate must resolve LGPL relink materials and complete third-party
licensing before any distribution approval. The verification flow does not
install into a normal bb profile or enable remote access.
