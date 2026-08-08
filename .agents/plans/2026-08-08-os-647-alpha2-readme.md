# OS-647 — Publish alpha.2 with the public README

## Outcome

Publish `bb-mate@0.1.0-alpha.2` as a minimal documentation refresh so npm shows
the public project README and repository metadata already merged to main.

## Success criteria

- The only intentional source changes are the package version, current release
  documentation, clean-room version assertions, and this plan.
- The exact package contains the public README, upstream bb link, bb/SDK/BB Mate
  responsibility boundary, GitHub Issues/security links, MIT license, and public
  repository/homepage/bugs metadata.
- Full local gates, clean-room lifecycle, package inspection, targeted release
  review, full-stack review, hosted PR CI, and post-merge main CI pass.
- The registry tarball is byte-identical to the reviewed merged-main artifact.
- npm `alpha` advances to `0.1.0-alpha.2`; `latest` remains at
  `0.1.0-alpha.1`.
- A clean global registry install/help/uninstall lifecycle passes with no
  residue.

## Plan

1. [x] Verify clean main, npm identity, existing alpha.1 registry provenance,
       and current dist-tags.
2. [x] Bump the package and current artifact/release documentation to alpha.2
       without changing runtime behavior.
3. [x] Run the full local gate, inspect the packed README/metadata, and record
       exact artifact checksums.
4. [x] Complete targeted release and full-stack local reviews; fix and rerun
       every open P0/P1/P2 finding.
5. [ ] Commit on the OS-647 branch, open a draft PR, pass hosted CI/review, mark
       ready, merge, and pass post-merge main CI.
6. [ ] Rebuild on merged main, prove exact artifact identity, publish the exact
       tarball with `--tag alpha`, and verify registry metadata/readme/install.
7. [ ] Confirm `alpha` moved to alpha.2 while `latest` stayed at alpha.1, update
       Linear and this plan, and leave GitButler clean and lane-free.

## Boundaries

- Do not alter or republish the existing alpha.1 bytes.
- Do not change runtime code, dependencies, native bb behavior, Fixture stories,
  npm `latest`, repository visibility, Git tags, GitHub releases, or upstream bb.
- Do not announce the release.
- Stop before publication if review/CI is not clean, the post-merge artifact
  differs, npm authentication fails, or the registry operation would move
  `latest`.

## Evidence

- Linear: OS-647
- Registry: <https://www.npmjs.com/package/bb-mate>
- Starting main: `16ba19baa3f32ea97adc3763d4cf3017d93ae4f2`
- Existing alpha.1 npm shasum: `2a5360d125b0189aaef5ebc85c10da162ed2c47c`
- Starting tags: `alpha: 0.1.0-alpha.1`, `latest: 0.1.0-alpha.1`
- Local gates: formatting, checks, tests, builds, 14 visual/a11y tests, and
  41-file package inspection passed.
- Candidate SHA-256: `de6174f733c8a76fdc4b7e117ff2499a47d55e918e02150fecb9337384e0e843`
- Candidate npm shasum: `4240b4b4cf397cda838b0a882e04ecb813835bf7`
- Candidate npm integrity:
  `sha512-mdh9oiBilXrpo/dcgvya791/+eCBSsynZAK6BkYG0fU/q3AtPcpLNhmNANs3yOZ8z6yXQ8zR/dvihdiL6stM2Q==`
- Targeted release review: 5/5 clean, zero findings
  (`/tmp/agent-reviews/os-647/targeted/round-1.json`).
- Full-stack review: 5/5 clean, zero findings
  (`/tmp/agent-reviews/os-647/full-stack/round-1.json`).
