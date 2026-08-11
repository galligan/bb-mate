# bb Plugin Studio rename

Date: 2026-08-11
Status: Implementation complete — final governance runs through PR #84 and issue #86
Issue: [#86](https://github.com/galligan/bb-plugin-studio/issues/86)
Owning branch: `feat/plugin-workbench/bb-scoped-project-catalog` / PR #84

## Outcome

The product is named **bb Plugin Studio** in repository and explanatory copy,
and **Plugin Studio** inside bb navigation and panel chrome. The rename explains
the product's purpose—build, inspect, and preview bb plugins—without changing
the technical identities that own existing plugin state.

After the code, package, Live bb, review, and hosted gates pass, the GitHub
repository becomes `galligan/bb-plugin-studio`. GitHub's documented repository
redirect preserves old web and Git URLs. The old `galligan/bb-mate` name must
never be reused, and this repository must not be consumed as a GitHub Action
through its old path because action references do not redirect.

## Naming and compatibility matrix

| Surface                        | Final value                               | Treatment                                                 |
| ------------------------------ | ----------------------------------------- | --------------------------------------------------------- |
| Full product name              | `bb Plugin Studio`                        | Rename now                                                |
| bb navigation and panel        | `Plugin Studio`                           | Rename now                                                |
| Product descriptor             | `Build, inspect, and preview bb plugins.` | Rename now                                                |
| GitHub repository              | `galligan/bb-plugin-studio`               | Rename only after every gate                              |
| npm CLI package and executable | `bb-mate`                                 | Preserve compatibility                                    |
| Workspace packages             | `@bb-mate/*`                              | Preserve compatibility                                    |
| bb plugin package and ID       | `bb-plugin-mate` / `mate`                 | Preserve installed state                                  |
| Plugin source directory        | `plugins/mate`                            | Preserve build and path install                           |
| Runtime executable/artifact    | `bb-mate`                                 | Preserve stamp and supervision                            |
| Runtime data root              | `<bb-data>/plugins/mate/runtime`          | Preserve catalog identity                                 |
| Panel route                    | `workbench`                               | Preserve deep links                                       |
| Skill technical ID/path        | `plugin-workbench`                        | Preserve existing references; show Plugin Studio in prose |

Changing a preserved identity requires a separate migration with compatibility
aliases, rollback, and proof that settings, KV/database state, catalog IDs, and
runtime supervision survive. This issue does not need that migration to deliver
the user-facing product rename.

## Current versus historical references

Update current product surfaces: root contributor/security/support guidance,
the active authoring and architecture docs, CLI help, deterministic fixture UI,
the packaged plugin manifest/README/skill, current visual fixtures, package
inspection assertions, issue/PR language, and repository metadata.

Keep historical evidence accurate: changelog entries, completed plans and
retrospectives, alpha-trial transcripts, old artifact names and hashes, issue
and PR identifiers, package/binary commands, source paths, environment keys,
type names, and compatibility identifiers.

## Test-first execution

1. Add failing public-interface assertions for `Plugin Studio` plugin
   registration and packaged manifest metadata.
2. Update the smallest visible plugin surfaces until those tests pass.
3. Add failing CLI/fixture assertions, then update visible product copy without
   changing command or package names.
4. Add a naming audit that checks the selected current surfaces while allowing
   explicit compatibility and historical references.
5. Regenerate affected visual snapshots and package identities.
6. Run focused tests, package checks/builds, the 709-test-or-newer aggregate,
   visual/axe, standalone, and managed package lifecycle.
7. Build and atomically reload the existing path plugin; verify navigation,
   panel, catalog, detail, Back, tasks, no path leakage, and preserved source,
   settings, KV/database, catalog, and runtime identity. Do not remove or
   reinstall the plugin.
8. Push PR #84, obtain clean exact-head standing and targeted reviews, and wait
   for hosted checks before restoring Ready.
9. Rename the GitHub repository, update its description/homepage and the local
   remote if the tooling supports it safely, then verify both old and new web
   and Git endpoints, PR stack metadata, issues, CI, and zero review threads.

## Verification and stop lines

Required: focused rename tests; Mate/CLI/Workbench tests and checks; package
inspection; root format/check/test/build/visual; standalone and managed package
clean rooms; Live bb; exact-head local reviews and hosted CI; GitButler clean;
PR #73 unchanged.

Stop before changing `mate`, `bb-plugin-mate`, `bb-mate`, `@bb-mate/*`, the
runtime/data-root identities, route, or skill ID; before plugin removal or
reinstallation; before merge, publication, release, upstream bb edits, or
reuse of the old repository name.

## Current evidence

- Focused naming, package-inspector, CLI, browser-workbench, and Mate suites are
  green. The complete 716-test workspace aggregate, check, build, format, and
  14-case + 20-case visual/axe gates pass. The final review fixes reject typed
  non-string pnpm/YAML workspace scalars and preserve projects omitted by the
  bounded 128-project browser projection.
- Deterministic standalone: 64,866,146 bytes, SHA-256
  `784fde56a982286b5472c71c15edd31b46cc20e2190cd0f44f87dfa0933b9e39`;
  manifest SHA-256
  `dcb311d37160d44d1ef111d55898a1b0d53e94d8c3ec21b4943571ad37dafbcd`.
- Managed 14-file plugin package: SHA-256
  `eb6d24d5a2d2a88b66a6ea762185980e3f411ff3f8a3df25ce217e986765363b`.
- Existing `mate` path plugin was built and atomically reloaded without removal
  or reinstall. Live bb reports **Plugin Studio**, the final descriptor, the
  same path source and compatibility IDs, a running runtime service, both
  expanded project catalogs, working plugin detail and Back navigation, and no
  path disclosure in the public catalog response.
- The final governance sequence is exact-head local review and hosted checks,
  Ready restoration, the repository rename, and old/new web and Git redirect
  verification. PR #84 and issue #86 retain the terminal state of that sequence.
