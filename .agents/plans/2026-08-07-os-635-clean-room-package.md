# OS-635 clean-room local package

## Outcome

Produce a private, versioned `bb-mate` tarball that installs and runs outside
the monorepo, while preserving native bb ownership and making publication a
separate owner decision.

## Slice

1. Make `apps/cli` the private package boundary with an explicit version,
   runtime metadata, bin path, and `files` allowlist.
2. Build one Bun-targeted CLI bundle plus the deterministic 13-story static
   surface lab. In source mode `dev` keeps launching Vite; from the artifact it
   serves the packaged lab on the same strict host/port boundary.
3. Add a root packaging command that recreates the distribution directory and
   emits a version-named local npm tarball without publishing.
4. Add package-content inspection and a clean-room test that installs the
   tarball under a temporary prefix, runs the installed bin for help and
   missing-native inspection, opens the packaged lab over HTTP, then uninstalls
   it.
5. Document prerequisites, contents, commands, unavailable capability behavior,
   and the explicit no-publish boundary.

## Boundaries

- The package stays `private: true`; no registry publish, tag, release,
  visibility change, license choice, or announcement occurs.
- Plugin packages remain independently versioned and are not bundled.
- The artifact contains no `../bb`, desktop bundle, absolute developer path,
  node_modules, workspace symlink, authenticated state, or unpublished SDK.
- Fixture mode may inspect manifests and serve deterministic assets; it does not
  install/build/reload plugins or mutate bb/Connect state.
- Bun is the executable runtime. Node/npm may install or inspect the tarball but
  Node is not claimed as a supported CLI runtime. The candidate is macOS-only.

## Verification

- Unit tests for source-versus-package launch selection and the static server.
- Two-pack checksum/content comparison plus explicit allowlist/path scan.
- Temporary-prefix install/help/inspect/lab/uninstall test with no `bb` on PATH.
- `bun run format:check && bun run check && bun run test && bun run build`.
- Standing plus fresh targeted review; fix all P0-P2 and reasonable P3.
- Draft PR, hosted CI/review threads, ready/merge, main CI, Linear Done.

## Progress

- [x] Define and build the allowlisted versioned artifact.
- [x] Make the installed bin serve the packaged surface lab safely.
- [x] Add deterministic package inspection and clean-room lifecycle proof.
- [x] Document the supported runtime/capability and no-publish boundary.
- [x] Complete aggregate gates and standing/fresh-targeted review.
- [x] Land the PR, verify main CI, and move OS-635 to Done.

## Completion

Complete when a fresh temporary environment can install the local tarball, run
help and passive inspection without native bb, load all catalog surfaces from
the packaged lab, uninstall cleanly, and reproduce the same allowlisted artifact
without any source-checkout assumption or publication side effect.
