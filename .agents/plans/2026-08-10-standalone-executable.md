# Self-contained bb-mate executable

Date: 2026-08-10
Status: In progress
Issue: [#56](https://github.com/galligan/bb-mate/issues/56)
Goal: `.agents/goals/2026-08-10-plugin-workbench/`

## Outcome

Produce an unsigned macOS arm64 `bb-mate` executable that embeds the complete
deterministic Fixture lab and runs after being moved away from the checkout with
an empty `PATH` and no global Bun. Preserve the existing npm/shebang artifact as
a separate compatibility lane.

## Decisions

- Generate one static `with { type: "file" }` import per built Ladle asset and
  preserve an explicit stable route-to-embedded-path map. Pinned Bun 1.3.14 did
  not embed the asset graph through `compile.assets`, and full-stack HTML
  rebundling would alter already-built Ladle bytes.
- Use a literal standalone entrypoint mode. Do not depend on
  `Bun.isStandaloneExecutable`, which is unavailable on the pinned runtime.
- Keep the native artifact out of the current npm tarball. The existing
  `dist/cli.js`, `engines.bun`, package inspection, and package clean-room lane
  remain unchanged.
- Define determinism as same-input, same-host, pinned-toolchain byte identity for
  the unsigned artifact and manifest. Signing, notarization, Intel macOS, other
  platforms, installation, updating, and public distribution are out of scope.
- Managed launchers must clear `BUN_BE_BUN` and `BUN_OPTIONS`; application code
  cannot sanitize `BUN_BE_BUN` because Bun consumes it before the entrypoint.

## Implementation

1. [ ] Introduce a focused lab asset provider with filesystem containment and
       exact-key embedded implementations.
2. [ ] Make the static lab handler consume the provider while retaining
       GET/HEAD, MIME, traversal/symlink, loopback, and shutdown behavior.
3. [ ] Split entrypoint construction from the shebang wrapper; make source and
       standalone modes explicit and make standalone incapable of re-executing
       itself as Bun.
4. [ ] Generate a sorted, validated static-import entry from the 13-story Ladle
       output and compile `bun-darwin-arm64` with dotenv/bunfig autoload disabled.
5. [ ] Emit an exact two-file artifact directory (`bb-mate`, `manifest.json`)
       recording mode, arch, size, SHA-256, story count, and sorted asset hashes.
6. [ ] Add a separate empty-PATH clean-room lane that builds twice, compares
       unsigned bytes, moves the binary, makes checkout lab assets unavailable,
       proves help/passive inspect/Fixture GET+HEAD/all stories, and confirms
       process/listener cleanup.
7. [ ] Add focused unit/integration tests and a native arm64 macOS CI job while
       preserving the legacy package lane unchanged.
8. [ ] Run focused, standalone, legacy-package, aggregate, exact-head review,
       hosted CI, issue, merge, and clean GitButler reconciliation gates.

## Verification

- `bun test apps/cli/src/lab-assets.test.ts apps/cli/src/surface-lab-server.test.ts apps/cli/src/entrypoint.test.ts scripts/standalone-assets.test.ts`
- `bun --filter @bb-mate/cli check && tsc -p scripts/tsconfig.json`
- `bun run standalone:inspect`
- `bun run standalone:test`
- `bun run package:inspect`
- `bun run package:test`
- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run build`

## Boundaries

- No `serve` domain protocol, runtime supervisor, plugin embedding, browser
  bootstrap, signing/notarization, automatic bunx, second platform, publish,
  release, or normal bb profile mutation.
- No imports or copied contracts from `../bb` or unpublished SDK packages.
- No claim that direct invocation can defeat user-supplied Bun runtime override
  variables; the isolated clean-room contract supplies a sanitized environment.

## Done

The moved exact artifact works with empty `PATH`, unreadable checkout assets, and
no global Bun; two complete builds are byte-identical on the pinned host; all 13
stories and passive commands pass; legacy packaging is non-regressed; focused,
aggregate, hosted, and two independent 5/5 review lanes are green; #56 and the
goal ledger are current; the PR is merged and GitButler is clean on `main`.
