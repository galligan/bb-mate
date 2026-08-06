# Plugin publishing

BB Mate will publish plugin workspaces independently when the first plugin is ready for external installation.

The expected pipeline is:

1. Validate the selected plugin with type checks, tests, and `bb plugin build`.
2. Verify the package version and `engines.bb` / `engines.bbPluginSdk` ranges.
3. Publish the workspace package to npm with provenance from GitHub Actions.
4. Install the published artifact into a clean bb profile with `bb plugin install npm:<package>@<version>`.
5. Promote a release only after activation and its primary interaction work.

Do not add release automation until a real plugin establishes package naming, access level, versioning, and release-channel requirements. Changesets is the likely versioning layer if multiple plugins need independent releases.
