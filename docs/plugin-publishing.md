# Studio plugin packaging

Plugin Studio packages the Studio plugin to validate its own live integration and
clean-room behavior. Independently distributed plugins and their release
automation live in [bb-plugins](https://github.com/galligan/bb-plugins).

The expected pipeline is:

1. Validate the selected plugin with type checks, tests, and `bb plugin build`.
2. Verify the package version and `engines.bb` / `engines.bbPluginSdk` ranges.
3. Build the Studio package artifact in a clean room.
4. Install the artifact into an isolated bb profile.
5. Accept packaging changes only after activation and its primary interaction work.

Do not add a general plugin release system here. Plugin collection versioning,
access, provenance, and release channels belong in `bb-plugins` once its first
external release requires them.
