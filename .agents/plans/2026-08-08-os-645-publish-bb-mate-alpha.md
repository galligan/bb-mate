# OS-645 — Publish BB Mate alpha to npm

## Outcome

Publish the reviewed BB Mate CLI as the public unscoped package
`bb-mate@0.1.0-alpha.1` under the `alpha` dist-tag. Preserve the verified
private `0.1.0-alpha.0` bytes and keep the GitHub repository private. npm's
first-package registry bootstrap also created its mandatory `latest` tag at the
same only published version; the attempted authenticated removal returned E400.

## Success proof

- The package manifest and shipped `LICENSE` grant MIT terms and contain no
  `private: true` or workspace dependency.
- Two complete local builds and a staging repack are byte-identical; the exact
  file allowlist, story count, SHA-256, npm integrity, and tarball shasum are
  recorded.
- Formatting, type/compatibility checks, 175-test aggregate, all builds, 14
  visual/accessibility checks, package inspection, and clean-room lifecycle
  pass for the release commit.
- Targeted and full-stack local reviews are 5/5 with no open P0/P1/P2.
- The release PR is CI-green and merged; the exact post-merge artifact matches
  the reviewed artifact.
- npm shows `bb-mate@0.1.0-alpha.1` under `alpha`; the registry's mandatory
  bootstrap `latest` tag points to the same only version; and a clean registry
  install/help/uninstall lifecycle passes.
- Linear OS-645 records the release commit, PR, CI, registry URL, checksums,
  integrity, and remaining alpha limitations.

## Plan

1. [x] Record the approved MIT, package identity, version, public npm, `alpha`
       channel, and private-repository decisions in package and release docs.
2. [x] Add the MIT license to the repository and package allowlist; advance the
       package to `0.1.0-alpha.1` with explicit public publish metadata.
3. [x] Update packaging and clean-room assertions for the public artifact while
       preserving source exclusion, deterministic output, path confinement,
       passive inspection, Fixture fidelity, and uninstall residue checks.
4. [x] Run the full local gate and record the exact candidate artifact evidence.
5. [x] Complete targeted and full-stack local reviews; fix and re-run any open
       P0/P1/P2 finding.
6. [x] Commit on the Linear branch, open a draft PR, pass hosted CI, mark ready,
       merge, and verify main CI.
7. [x] Rebuild on merged main, prove exact artifact identity, publish with
       `--tag alpha`, and verify registry metadata plus a clean registry lifecycle.
8. [ ] Update Linear and this plan with final provenance and leave the GitButler
       workspace clean with no applied lanes.

## Boundaries

- Do not publish `0.1.0-alpha.0`, intentionally repoint `latest`, create a Git
  tag or GitHub release, change repository visibility, or announce the release.
- Do not edit `../bb`, implement upstream-dependent OS-639–OS-644 work, copy the
  SDK/Harness, or mutate normal bb/plugin/Connect state.
- Stop before publication if the name is no longer available, the exact artifact
  differs after merge, CI or review is not clean, or npm requires owner approval
  that cannot be completed in this session.
- npm publication is immutable. Publish only the exact reviewed post-merge
  `./artifacts/bb-mate-0.1.0-alpha.1.tgz` tarball (the `./` forces npm to treat
  it as a local path) and verify the dist-tag explicitly afterward.

## Evidence

- Linear: OS-645
- Release PR: <https://github.com/galligan/bb-mate/pull/14>
- Release commit: `3a9694b4fbccf0cbeb76b8f071d9f71ab8bbea5d`
- Main merge commit: `c2c33fea523148e56914168df84399db1c0adc51`
- PR CI: <https://github.com/galligan/bb-mate/actions/runs/31259377836>
- Main CI: <https://github.com/galligan/bb-mate/actions/runs/31259484216>
- Package: 41 files, 13 stories, 514333-byte archive, 1057566 bytes unpacked
- Package SHA-256:
  `c3d474a2eb5dc48de93c672941df8bc4313e3a62a0392ce35674ba1322d68f6d`
- npm shasum: `2a5360d125b0189aaef5ebc85c10da162ed2c47c`
- npm integrity:
  `sha512-GykyMJ9mAcHPhij1njHjVE3oUszJFjBLbhhLtmFbmQdueNnBE8bRHouV/Nyhp7ald53O5Mq3lzIRxP6wAdrTwg==`
- Targeted review: `/tmp/agent-reviews/os-645/release-targeted/round-2.json`
  — 5/5 clean after fixing two P2s from round 1
- Full-stack review: `/tmp/agent-reviews/os-645/full-stack/round-1.json` —
  5/5 clean, zero open P0-P3
- Post-publish review: `/tmp/agent-reviews/os-645/post-publish/round-1.json` —
  5/5 clean, zero open P0-P3
- Registry: <https://www.npmjs.com/package/bb-mate/v/0.1.0-alpha.1>
- Live tags: `alpha: 0.1.0-alpha.1`, mandatory first-package
  `latest: 0.1.0-alpha.1`
- Registry lifecycle: exact registry tarball SHA-256 matched the merged-main
  artifact; clean `bb-mate@alpha` install/help/uninstall passed with no residue
- Tag divergence: authenticated `npm dist-tag rm bb-mate latest` returned E400;
  [npm registry metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)
  documents that every package has a `latest` tag
