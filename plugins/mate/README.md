# Plugin Workbench

`bb-plugin-mate` is the released-contract bb host shell for the packaged `bb-mate`
runtime. The plugin starts no child process until the user opens the Plugin
Workbench panel and explicitly requests the runtime.

The panel reports a finite, redacted point-in-time snapshot on mount and after
an explicit start or retry action; it does not claim realtime monitoring in this
slice. Browser launch and source target discovery remain unavailable until their
dedicated authenticated runtime protocol slices land; the plugin never prints
or exposes the runtime URL, credential, process id, installed path, or host
topology.

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
