# Clean-room local package

BB Mate can produce a private local alpha artifact for installation tests before
any registry, repository-visibility, license, or release decision.

## Artifact contract

Run from a clean checkout with the verified Bun 1.3.14 and npm available.
Newer engine-compatible Bun versions are best-effort until added to CI:

```sh
bun install --frozen-lockfile
bun run package:artifact
```

The command rebuilds the CLI and surface lab, creates an isolated staging
manifest with no workspace dependencies, and writes the versioned archive:

```text
artifacts/bb-mate-0.1.0-alpha.0.tgz
```

The artifact remains `private: true`, `UNLICENSED`, and unpublishable by the
supported workflow. The staged `files` allowlist permits only:

- `package.json`;
- `README.md`, `THIRD_PARTY_NOTICES.md`, and the generated self-contained
  `THIRD_PARTY_LICENSES.md`;
- `dist/cli.js`, a Bun-targeted self-contained CLI bundle;
- `dist/lab/**`, the deterministic static 13-story surface lab.

Plugin packages, source files, node_modules, Vite/Ladle servers, desktop app
bundles, `../bb`, absolute developer paths, workspace links, secrets, and
authenticated browser state are excluded.

Inspect npm's exact dry-run file list without creating or publishing an archive:

```sh
bun run package:inspect
```

## Runtime and capability support

The bin is executed by Bun, not Node. npm is supported as the local archive
installer and inspector; the package does not claim Node CLI compatibility.
Native bb handoffs target the macOS bb host. The deterministic Fixture-only
artifact is additionally exercised on isolated Linux CI, so the manifest records
macOS native support and Linux fixture CI separately instead of using an npm
platform restriction that would make that proof impossible.

`bb-mate inspect` is passive: it reads plugin manifests and generated metadata
without importing the plugin. Missing native bb, Connect status/shares, and the
official SDK/Harness are named independently with actionable next steps. Those
unavailable capabilities may make inspection exit nonzero, but they do not stop
the installed `dev` command from serving Fixture stories.

Installed `dev` serves the generated lab only on `127.0.0.1`, `::1`, or
`localhost`. The server accepts GET/HEAD, confines decoded paths and resolved
symlinks to the packaged lab root, and never serves the plugin inspection or
filesystem data. It does not run plugin code or install/build/reload native bb.

## Reproducible lifecycle proof

Run the complete temporary clean-room test:

```sh
bun run package:test
```

The test:

1. performs two complete isolated builds, repacks the second staging tree, and
   requires every resulting tarball to have the same SHA-256;
2. checks the allowlist, absence of symlinks/workspace dependencies/source, and
   absence of absolute developer paths;
3. isolates HOME, TMPDIR, XDG config/cache/data/state, npm config/cache/prefix,
   Bun install/cache, and PATH beneath a temporary root;
4. installs only a copied tarball under that temporary prefix with npm's
   no-save, no-package-lock mode;
5. runs the installed bin for help and passive inspection with no `bb` on PATH;
6. proves the fixture plugin entrypoint was not executed and missing
   bb/Connect/SDK states are clear;
7. starts installed `dev`, fetches metadata for all 13 packaged stories, and
   stops it;
8. uninstalls `bb-mate` and verifies the bin, package directory, manifest, and
   lockfile carry no `bb-mate` residue.

The temporary environment is removed after the test. The versioned archive
under `artifacts/` is generated and ignored by version control.

## Stop boundary

These commands do not run `npm publish`, create a tag or release, change
repository visibility, select a public license, or send an announcement. Those
remain explicit owner decisions for the later release handoff.
