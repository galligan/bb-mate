# Security policy

## Reporting a vulnerability

Do not open a public issue or include exploit details, credentials, customer
data, or local paths in ordinary logs or comments.

Use the repository's GitHub **Security → Report a vulnerability** flow to open a
private security advisory. Include the affected commit or package version,
reproduction steps using fake data, impact, and any known workaround. If the
private advisory flow is unavailable, contact a repository maintainer through
the same private channel that granted repository access and ask for a secure
reporting path before sharing details.

Maintainers will acknowledge a report when the private project is actively
staffed, reproduce and triage it, coordinate a fix and disclosure boundary, and
credit the reporter if requested. This private alpha has no public response-time
or remediation SLA; see [SUPPORT.md](SUPPORT.md).

## Supported security surface

Only the current `main` snapshot and the exact local alpha artifact identified
in repository documentation are considered for security fixes. Old commits,
locally modified artifacts, unpublished branches, unsupported bb/SDK versions,
and third-party plugins are not maintained release lines.

BB Mate does not sandbox plugins. Full-trust execution, passive inspection,
native mutation boundaries, content-script handling, and secret expectations
are documented in [docs/trust-model.md](docs/trust-model.md). A report that a
third-party plugin intentionally reads files or uses the network is normally a
plugin issue; a report that BB Mate executes a plugin during passive inspection,
leaks redacted paths, crosses its server confinement, or runs a native mutation
without an explicit terminal handoff is a BB Mate security issue.

## Handling fixes

- Use fake deterministic fixtures and isolated profiles for reproduction.
- Do not remove/reinstall a managed path plugin if that could discard settings
  or secrets.
- Keep advisory branches and artifacts private until the owner approves
  disclosure.
- Verify the smallest fix plus the full repository and relevant browser/package
  gates before release consideration.
- Publication, tagging, visibility, disclosure timing, and credential rotation
  require explicit owner decisions.
