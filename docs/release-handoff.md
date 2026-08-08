# Shareable-alpha release handoff

> [!NOTE]
> This is a historical maintainer record for the first alpha, not the current
> installation or contribution guide. Start with the [project README](../README.md)
> and [plugin-author guide](plugin-author-guide.md).

## Decision

The `0.1.0-alpha.0` candidate completed its private local handoff. On 2026-08-08
the owner approved the next release phase in OS-645: publish the new
`bb-mate@0.1.0-alpha.1` artifact publicly under npm's `alpha` dist-tag, license
BB Mate under MIT, and keep the GitHub repository private. That approval does
not intentionally repoint `latest`, create a Git tag or GitHub release, change
repository visibility, or authorize an announcement. npm's first-package
bootstrap nevertheless created its mandatory `latest` tag at the same only
published version; OS-645 records the failed authenticated removal attempt.

## Candidate provenance

| Field                    | Candidate                                                          |
| ------------------------ | ------------------------------------------------------------------ |
| Product source baseline  | `c8363d3e80e54371f62b826a0e808268f2317038`                         |
| Source PR                | [PR #12](https://github.com/galligan/bb-mate/pull/12)              |
| Package                  | `bb-mate`                                                          |
| Version                  | `0.1.0-alpha.0`                                                    |
| Archive                  | `bb-mate-0.1.0-alpha.0.tgz`                                        |
| Archive files            | 40                                                                 |
| Catalog stories          | 13                                                                 |
| SHA-256                  | `0e5503f371a1ffc57c4f4fc333828f4b40affe146b82c7f2c7980f925c48d00e` |
| Current license state    | `UNLICENSED`; no public-use or redistribution grant                |
| Current repository state | Private                                                            |
| Current package state    | `private: true`; registry publication blocked by design            |

OS-638 changes only handoff documentation outside the package allowlist. The
product source baseline above therefore remains the source of the exact archive
bytes. The OS-638 PR head and hosted verification are recorded in its PR and
Linear issue so the documentation review remains independently traceable.

The unscoped `bb-mate` name returned npm `E404` during preparation. That result
does not reserve the name or prove it will be available later. The owner must
choose and re-check the final package name/scope immediately before any approved
registry operation.

## Version and changelog proposal

- Keep `0.1.0-alpha.0` for this already-verified private local archive.
- Do not mutate or republish these bytes under different metadata.
- If an npm release is approved later, use `0.1.0-alpha.1` after the license,
  package name/scope, visibility, and support decisions are committed. Rebuild,
  rerun every gate, and record a new checksum and source commit.
- Use [CHANGELOG.md](../CHANGELOG.md) as the proposed `0.1.0-alpha.0` notes. It
  describes current behavior and limitations without implying publication.

## OS-645 public-alpha candidate

The approved public successor is a new artifact, not modified `alpha.0` bytes:

| Field           | `0.1.0-alpha.1` candidate                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Package         | `bb-mate`                                                                                         |
| License         | MIT; `LICENSE` shipped                                                                            |
| npm channel     | public `alpha`; mandatory bootstrap `latest` points to the same only version                      |
| Archive         | `bb-mate-0.1.0-alpha.1.tgz`                                                                       |
| Archive files   | 41                                                                                                |
| Catalog stories | 13                                                                                                |
| SHA-256         | `c3d474a2eb5dc48de93c672941df8bc4313e3a62a0392ce35674ba1322d68f6d`                                |
| npm shasum      | `2a5360d125b0189aaef5ebc85c10da162ed2c47c`                                                        |
| npm integrity   | `sha512-GykyMJ9mAcHPhij1njHjVE3oUszJFjBLbhhLtmFbmQdueNnBE8bRHouV/Nyhp7ald53O5Mq3lzIRxP6wAdrTwg==` |
| Repository      | private                                                                                           |
| Release commit  | `3a9694b4fbccf0cbeb76b8f071d9f71ab8bbea5d`; merge `c2c33fea523148e56914168df84399db1c0adc51`      |

Two complete builds and a staging repack are byte-identical. The isolated
lifecycle verifies both local-prefix and global npm install/help/uninstall,
passive inspection without plugin execution, all 13 packaged stories, and no
package/bin/manifest/lockfile residue. npm's exact publication dry-run accepts
the archive under `alpha`. Targeted and full-stack local reviews are 5/5 clean
after fixing the shipped support/security disclosure and global-install test
coverage.

The live registry tarball is byte-identical to the merged-main artifact. Both
`alpha` and npm's mandatory `latest` bootstrap tag resolve to
`0.1.0-alpha.1`. An authenticated `npm dist-tag rm bb-mate latest` attempt
returned E400, consistent with npm registry metadata requiring every package to
[define `latest`](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md);
no second version was published and no tag was repointed.

## Independent roadmap status

The independent foundation and alpha path are complete: OS-623 and OS-628
through OS-637 are Done. OS-638 owns this handoff and stops at a green ready but
unmerged PR. The completed path covers compatibility inspection, the CLI,
surface catalog, Ladle lab, launcher, drift protection, visual/accessibility
coverage, local packaging, author/security/support documentation, and the
external-author clean-room trial.

OS-624 is separate plugin-publication work and is not part of this BB Mate
candidate.

## Compatibility and confidence matrix

| Surface              | Supported/verified candidate          | Confidence and boundary                                                         |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| Package runtime      | Bun 1.3.14; package engine `>=1.3.14` | Bun is the CLI runtime; Node compatibility is not claimed                       |
| Local installer      | npm 11.12.1 against a local tarball   | Install/uninstall only; no registry publication                                 |
| Native host          | macOS arm64, bb 0.35.1                | Native build/check and guarded Live handoff verified                            |
| Plugin metadata      | SDK 0.4.1; declared engine `^0.4.1`   | Metadata/build compatibility, not public Harness availability                   |
| Source Fixture       | macOS and clean archive               | Deterministic approximation with HMR and bounded passive inspection             |
| Packaged Fixture     | macOS clean room and Linux CI         | Static loopback-only lab; 13 stories; no plugin execution                       |
| Visual/accessibility | Playwright 1.62.1 Noble container     | 14 deterministic checks; not Live visual authority                              |
| Compatibility drift  | target `desktop-v0.35.1`; 18 checks   | Version, SDK, registry, dependency, token, and registration alarms              |
| Harness              | Unavailable                           | Waits for official published SDK testing subpaths and adapter                   |
| Live bb              | Handoff only for this candidate       | Live bb remains visual/integration authority; no reference plugin was installed |

Run [the compatibility check](compatibility-target.md) before diagnosing or
sharing a candidate. An unavailable public probe fails closed and is not proof
of compatibility.

## Verification record

- PR #12 CI run 31233812475: verify and visual green; GitGuardian green.
- Main CI run 31233902043 at the product baseline: verify and visual green.
- Local aggregate: formatting, type/compatibility checks, 175 tests, and all
  builds green.
- Visual/accessibility: all 14 Playwright/axe/geometry checks green.
- Package lifecycle: two reproducible builds, 40-file allowlist, 13 stories,
  local install/help/passive inspection/static lab/uninstall, and no `bb-mate`
  residue.
- External-author trial: fresh source/profile/prefix/plugin/bb-data roots,
  Fixture HMR, isolated bb 0.35.1, native build, guarded Live refusal, builtins
  only, and unpaired Connect.
- Final OS-637 reviews: standing and fresh targeted 5/5, zero P0-P3.

Re-run the exact candidate gates before any approved distribution action:

```sh
bun install --frozen-lockfile
bun run format:check
bun run check
bun run test
bun run build
bun run visual:test
bun run package:inspect
bun run package:test
shasum -a 256 artifacts/bb-mate-0.1.0-alpha.0.tgz
```

The expected SHA-256 for this source baseline is
`0e5503f371a1ffc57c4f4fc333828f4b40affe146b82c7f2c7980f925c48d00e`.

## Install, update, uninstall, and recovery

Copy the exact private archive through an approved private channel and verify
its checksum before installation:

```sh
artifact="/approved/path/bb-mate-0.1.0-alpha.0.tgz"
prefix="$(mktemp -d "${TMPDIR:-/tmp}/bb-mate-alpha.XXXXXX")"
test "$(shasum -a 256 "$artifact" | awk '{print $1}')" = \
  "0e5503f371a1ffc57c4f4fc333828f4b40affe146b82c7f2c7980f925c48d00e"
npm install --prefix "$prefix" --no-save --package-lock=false "$artifact"
"$prefix/node_modules/.bin/bb-mate" --help
```

Stop any foreground Fixture server before update or uninstall. If the next
artifact keeps the same package identity (`bb-mate`), a local update is a
replacement with another explicitly checksummed archive:

```sh
next_artifact="/approved/path/bb-mate-next.tgz"
# Verify the next handoff's recorded checksum first.
npm install --prefix "$prefix" --no-save --package-lock=false "$next_artifact"
"$prefix/node_modules/.bin/bb-mate" --help
```

If the owner changes the package name or scope, do not install the new identity
over the old one or use the old binary as verification. Remove the old package,
prove its package and binary are absent, then install and verify the exact new
package and bin identities recorded by that handoff:

```sh
old_package="bb-mate"
next_package="@approved-scope/approved-name"
next_bin="approved-bin"
npm uninstall --prefix "$prefix" --no-save --package-lock=false "$old_package"
test ! -e "$prefix/node_modules/$old_package"
test ! -e "$prefix/node_modules/.bin/bb-mate"
npm install --prefix "$prefix" --no-save --package-lock=false "$next_artifact"
test -e "$prefix/node_modules/$next_package/package.json"
"$prefix/node_modules/.bin/$next_bin" --help
```

The values above are placeholders, not a proposed public identity. Replace them
only with the approved package metadata in the next handoff.

Uninstall only BB Mate from the disposable prefix:

```sh
npm uninstall --prefix "$prefix" --no-save --package-lock=false bb-mate
test ! -e "$prefix/node_modules/bb-mate"
test ! -e "$prefix/node_modules/.bin/bb-mate"
```

BB Mate stores no persistent plugin, Connect, or secret state. For rollback,
stop the server, uninstall the current archive, reinstall the previously
retained and checksummed tarball into the same disposable prefix, and rerun
`--help` plus the required Fixture check. If recovery is uncertain, discard the
exact disposable prefix and create a new one; do not remove/reinstall a managed
bb plugin or alter normal bb data. Registry unpublish/deprecation is not a
rollback plan and is outside this candidate.

Full lifecycle details are in [local-package.md](local-package.md), the
step-by-step external trial is in [alpha-trial-runbook.md](alpha-trial-runbook.md),
and the sanitized result is in [alpha-trial-report.md](alpha-trial-report.md).

## Trust, security, support, and fidelity

- Plugins are full-trust local code; BB Mate is not a sandbox. Review code and
  dependencies before native build/dev execution.
- Passive inspection does not import a plugin or run native mutations, but it
  can read supported manifest/metadata/native status and query public evidence.
- `check` executes the selected plugin build toolchain. `live` can execute a
  previously installed plugin through native bb. The printed install command is
  a handoff and is not executed by BB Mate.
- The packaged lab serves static Fixture assets on loopback and has no source
  inspection endpoint. Fixture approximates plugin-owned UI; Harness validates
  public behavior when available; Live bb is the visual authority.
- Do not include secrets, authenticated state, customer data, or unredacted
  local paths in issues, logs, fixtures, screenshots, or support requests.
- Security reports use the private advisory flow in [SECURITY.md](../SECURITY.md).
  Support and compatibility expectations are in [SUPPORT.md](../SUPPORT.md), and
  the full operation matrix is in [trust-model.md](trust-model.md).

## Upstream-dependent work — not release regressions

These issues remain Backlog with `upstream-dependent`. Do not implement local
substitutes; start them only after their upstream release and clean-room unblock
rule pass.

| Issue  | Deferred capability                                                 | Upstream gate                                                            |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| OS-639 | Official Harness adapter                                            | get-bb/bb#1134 publishes the SDK testing subpaths                        |
| OS-640 | Real frontend reference plugin/live adapter                         | #1134 plus the supported external sidebar example from PR #1109          |
| OS-641 | Native scaffold, declaration refresh, and `plugin --check` adoption | #1133/PR #1135 and PR #1107 land in a released bb                        |
| OS-642 | Multi-plugin collection manifest                                    | get-bb/bb#1097 defines the released manifest/provenance contract         |
| OS-643 | Sanctioned registry/style update workflow                           | get-bb/bb#1095 and #1106 establish the authoring/update contract         |
| OS-644 | Complete Live parity validation                                     | OS-639/640/643 plus required host APIs, including #1094 where applicable |

Harness unavailability, absent real reference-plugin Live parity, and native
workflow/collection/style deferrals are known upstream capability gaps. They do
not indicate regression in the green Fixture/local-package candidate.

## Proposed release notes

> **Approved for `bb-mate@0.1.0-alpha.1` under npm's `alpha` dist-tag**
>
> BB Mate `0.1.0-alpha.1` is a public npm preview for bb plugin authors. It
> adds actionable compatibility inspection, a thin native-handoff CLI, a
> deterministic 13-surface Fixture lab, visual/accessibility checks, and a
> reproducible local archive. Native bb still owns scaffold, build, install,
> dev/reload, and runtime. Fixture is an approximation; official Harness and a
> real frontend reference-plugin Live path remain upstream-dependent. This
> preview is MIT-licensed and carries no stable API or support promise. The
> source repository and issue tracker remain private.

## Proposed announcement copy

> **Draft — do not send without owner approval**
>
> We have a private BB Mate alpha ready for a small, explicitly authorized bb
> plugin-author trial. It provides a compatibility report, deterministic public
> UI-surface stories, and clear handoffs to native bb without replacing bb's
> lifecycle. The current artifact is for local evaluation only: it is not
> published, publicly licensed, or a claim of exact host rendering. If you are
> invited, verify the supplied checksum, use a disposable prefix, and send
> sanitized feedback through the private support channel.

## Go/no-go checklist

### Technical candidate — complete

- [x] Independent OS-623 and OS-628 through OS-637 work is Done.
- [x] CI, static surface lab, 14 visual/accessibility checks, package inspection,
      and clean-room install/uninstall are green.
- [x] Artifact version, product source baseline, file/story counts, and checksum
      are recorded.
- [x] Compatibility, trust, security, support, limitations, recovery, draft
      notes, and draft announcement are documented.
- [x] Fixture/Harness/Live claims remain honest and upstream work is separate.

### Owner decisions — approved for OS-645

- [x] Approve public npm distribution for the alpha audience.
- [x] Choose `bb-mate` and re-check the final name immediately before release;
      npm `E404` is not a
      reservation.
- [x] Choose MIT and add the license file plus package metadata.
- [x] Keep the GitHub repository private independently from public npm.
- [x] Preserve the documented alpha support/security limitations and use the
      `alpha` release channel.
- [x] Approve `0.1.0-alpha.1`, not a mutation of the verified local `alpha.0`
      bytes.
- [x] Approve the release notes. Announcement copy, audience, and timing remain
      unapproved and out of scope.

### OS-645 execution

- [x] Remove `private: true` after recording the approved decisions; add MIT
      metadata and the shipped license.
- [x] Rebuild and rerun every local gate; record the candidate artifact manifest,
      checksum, and registry dry run.
- [x] Merge the reviewed CI-green release PR, rebuild the exact artifact on main,
      publish it under `alpha`, and verify the registry lifecycle.
- [x] Keep tags, GitHub releases, visibility changes, and announcements out of
      OS-645.

Current verdict: **`bb-mate@0.1.0-alpha.1` is published and byte-verified; the
mandatory first-package `latest` bootstrap divergence is recorded in OS-645**.
