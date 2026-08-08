# Clean-room external-author alpha trial

## Decision

The private local alpha is ready to advance to the release-handoff review after
one P1 native-integration defect was fixed and the complete trial was rerun.
There are no open P0 or P1 findings. Publication, licensing, visibility, and
announcement decisions remain outside this trial.

## Candidate

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Issue            | OS-637                                                             |
| Platform         | macOS arm64                                                        |
| Bun              | 1.3.14                                                             |
| npm              | 11.12.1                                                            |
| Native bb        | 0.35.1                                                             |
| BB Mate artifact | `bb-mate-0.1.0-alpha.0.tgz`                                        |
| Artifact files   | 40                                                                 |
| Catalog stories  | 13                                                                 |
| Artifact SHA-256 | `fc99a5161ad0890706d03306de32248174aa3ead67b3daf334932f6868214a07` |

The final commit and hosted-run identifiers are added to the OS-637 Linear
landing comment because they do not exist until the report itself lands.

## Reproducible setup

The trial used a newly created temporary root with these disjoint children:

```text
source/         clean archive of the candidate, no .git or node_modules
profile/        empty child-process home, XDG, cache, state, data, and temp
install/        npm prefix for the local BB Mate archive and bb 0.35.1
plugin/         disposable external plugin, outside the BB Mate checkout
```

No sibling bb source checkout, BB Mate symlink, dotenv file, saved credential,
or inherited bb data directory was present. Child commands received only the
documented tools plus profile-local home, XDG, npm, Bun, temp, bb data, and
loopback server values. The isolated native server used its own data directory
and ports and was stopped at the end of the trial.

From the clean source archive, the author-facing sequence was:

```sh
bun install --frozen-lockfile
bun --filter @bb-mate/workbench stories --host 127.0.0.1 --port 61037
bun run compatibility:check
bun run package:artifact
npm install --prefix "$prefix" --no-save --package-lock=false "$artifact"
"$prefix/node_modules/.bin/bb-mate" --help
"$prefix/node_modules/.bin/bb-mate" inspect "$plugin"
"$prefix/node_modules/.bin/bb-mate" dev "$plugin" --host 127.0.0.1 --port 61038
"$prefix/node_modules/.bin/bb-mate" check "$plugin"
"$prefix/node_modules/.bin/bb-mate" live "$plugin"
```

Native bb was provisioned separately into the disposable prefix for the native
lane. It is not part of the BB Mate artifact. The trial set `BB_CLI` to that
exact executable and `BB_SERVER_URL`/bb data values to the isolated loopback
host, so no normal plugin inventory or Connect state was used or changed.

## Results

| Milestone                | Result               | Evidence                                                                                                 |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------- |
| Fresh dependency install | pass                 | frozen lockfile; 1,536 packages; 11.8 s                                                                  |
| First Fixture preview    | pass                 | documented story visible about 13 s after beginning install                                              |
| Catalog discovery        | pass                 | all 13 story IDs returned by `meta.json`                                                                 |
| Ownership vocabulary     | pass                 | plugin component, host action, mixed/bb-owned seam, and content-script lifecycle inspected in-browser    |
| Fixture edit/reload      | pass                 | disposable `Agent focus` name changed; Vite reported HMR and Chrome showed the new value without restart |
| Artifact build/install   | pass                 | 40-file archive; installed with npm outside the source checkout                                          |
| Packaged preview         | pass                 | exact documented story visible; all 13 packaged stories present                                          |
| Compatibility drift      | pass                 | all 18 target, version, registry, dependency, token, and registration checks passed                      |
| Passive inspection       | pass                 | bb 0.35.1, unpaired Connect, missing SDK/Harness, and uninstalled plugin reported independently          |
| Native check             | pass                 | delegated `bb plugin build .`; server/app metadata refreshed at SDK 0.4.1                                |
| Live handoff             | expected unavailable | no install performed; printed the exact native path-install command and exited 1                         |
| Cleanup                  | pass                 | Fixture/native servers stopped; only disposable plugin build output changed                              |

The timed values are command milestones, not a usability benchmark. Browser
automation used an ordinary installed Chrome because a first-time author needs
a browser, not a Playwright browser cache.

## Findings

| ID  | Severity | Finding                                                                                                                                               | Resolution                                                                                                                                                                                                        |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1 | P1       | `BB_CLI` selected the correct executable but was forwarded into that child; bb treated it as another re-exec request and all native probes timed out. | Fixed. BB Mate consumes and removes `BB_CLI`/`BB_CLI_REEXEC` at the native delegation boundary while preserving other environment values. Captured probes and inherited build/live handoffs share the correction. |
| F-2 | P3       | The guide named native bb as a prerequisite without saying that the local BB Mate archive does not install it.                                        | Fixed with an explicit native-owned installation boundary in the author guide.                                                                                                                                    |
| F-3 | Note     | Harness remained unavailable because the official SDK testing package is unpublished.                                                                 | Expected and actionable: the report names get-bb/bb#1134 and keeps Fixture usable.                                                                                                                                |

## Decisions and remaining gates

- Fixture mode requires no bb server, sibling checkout, secret, or unpublished
  SDK and is sufficient for deterministic authoring feedback.
- Harness is not simulated or copied; upstream publication remains the gate.
- Live bb is still the visual authority. This trial proved the guarded handoff,
  not host parity and not a plugin installation.
- The local alpha archive remains private and `UNLICENSED`.
- OS-638 may prepare a green reviewable handoff, but must not publish, tag,
  release, change visibility, announce, or choose a public license.
