# Split distributable plugins into bb-plugins

## Outcome

Create a public `galligan/bb-plugins` repository that owns independently
versioned bb plugins, beginning with `plugins/linear`. Keep Plugin Studio
focused on its workbench, inspection tooling, and the Studio-owned Mate plugin.

## Constraints

- Preserve the Linear plugin's source history.
- Keep its plugin id (`linear`), package name, settings schema, and behavior.
- Do not remove or reinstall a live plugin in a way that could discard saved
  settings. Existing installations should move by updating their source.
- Avoid shared packages until at least two plugins need the same code.
- Keep each plugin independently buildable and publishable.

## Steps

1. Split `plugins/linear` history from Plugin Studio.
2. Create `bb-plugins` with a small Bun workspace, contributor guidance, CI,
   and the Linear plugin under `plugins/linear`.
3. Verify the Linear plugin in its new repository and publish the repository.
4. Remove Linear from Plugin Studio and replace any test/build coupling with
   the Studio-owned Mate plugin.
5. Update Studio documentation to describe the repository boundary.
6. Run both repositories' checks and publish the Studio migration through a PR.

## Verification

- `bb-plugins`: frozen install, formatting, typecheck, tests, and plugin build.
- Plugin Studio: frozen install, formatting, typecheck, tests, and build.
- Git history for `plugins/linear` remains reachable in `bb-plugins`.
- No tracked Plugin Studio references continue to claim ownership of Linear.

## Result

- Created public `galligan/bb-plugins` and imported Linear through a history-
  preserving subtree merge.
- `bb-plugins` passed frozen formatting, typecheck, 21 tests, and plugin build.
- Plugin Studio formatting, typecheck, compatibility checks, the 33 directly
  affected tests, and the full build passed.
- The full local Studio test command also reported unrelated macOS filesystem
  mode and process-timing failures in untouched tests. The pull request CI is
  the clean Linux verification gate for those suites.
