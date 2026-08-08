# Security policy

## Reporting a vulnerability

Do not open a public issue or include exploit details, credentials, customer
data, or local paths in ordinary logs or comments.

Repository collaborators should use GitHub **Security → Report a
vulnerability** to open a private security advisory. Public npm users should
contact an npm-listed maintainer through an existing private channel and ask for
a secure reporting path before sharing details. If no private channel is
available, do not publish exploit details; this alpha does not yet provide a
public vulnerability-intake address. Include the affected package version,
reproduction steps using fake data, impact, and any known workaround.

Maintainers will acknowledge a report when the project is actively staffed,
reproduce and triage it, coordinate a fix and disclosure boundary, and credit
the reporter if requested. This alpha has no public response-time or remediation
SLA; see [SUPPORT.md](SUPPORT.md).

## Supported security surface

Only the current `main` snapshot and exact npm alpha identified in repository
documentation are considered for security fixes. Old commits, locally modified
artifacts, unpublished branches, unsupported bb/SDK versions, and third-party
plugins are not maintained release lines.

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
