# OS-646 — Open-source documentation and repository launch

## Outcome

Make the BB Mate repository understandable and useful to a plugin author who
arrives without internal project context, then change `galligan/bb-mate` from
private to public only after the documentation change is reviewed and green.

## Success criteria

- The root README explains BB Mate in plain language, links prominently to
  [upstream bb](https://github.com/get-bb/bb), and offers a public npm
  quickstart.
- A concise responsibility table distinguishes native `bb`,
  `@bb/plugin-sdk`, and BB Mate without claiming that BB Mate replaces any of
  them.
- Reader-facing contribution, support, security, architecture, changelog, and
  packaged README copy no longer assumes private repository or Linear access.
- Historical plans and release evidence remain non-normative and are not the
  primary reader journey.
- Full formatting, checks, tests, builds, visual tests, and package inspection
  pass; local review has no open P0/P1/P2 findings.
- A hosted PR is green and merged before repository visibility changes.
- The repository is publicly reachable, GitHub Issues are available, private
  vulnerability reporting is enabled, and the repo description/homepage/topics
  fit the public project.

## Plan

1. [x] Verify the clean main baseline, current npm/upstream SDK state, and
       public-launch authority.
2. [x] Audit reader-facing documents and public repository metadata for private
       or insider-only language.
3. [x] Rewrite the public entry points and product boundary; add only the
       supporting open-source documentation needed by that path.
4. [x] Run the full local gate, package inspection, link/content checks, and
       targeted plus standing local review.
5. [ ] Commit on the OS-646 branch, open a draft PR, pass hosted CI and review,
       mark ready, and merge.
6. [ ] Verify post-merge main CI, then change GitHub visibility to public and
       configure/verify public-facing repository metadata and security intake.
7. [ ] Verify anonymous public reachability and the clean GitButler workspace;
       record final provenance in Linear and mark OS-646 Done.

## Boundaries

- Do not publish another npm version, repoint an npm tag, create a Git tag or
  GitHub release, or post an announcement.
- Do not edit upstream `../bb`, implement upstream-dependent Harness/Live work,
  or imply affiliation or official status that upstream has not granted.
- Do not remove historical evidence merely because it uses internal issue IDs;
  keep it outside the public reader path and label it as project history where
  needed.
- Do not change repository visibility until the exact documentation PR is
  merged and its checks are green.

## Evidence

- Linear: OS-646
- Upstream: <https://github.com/get-bb/bb>
- npm package: <https://www.npmjs.com/package/bb-mate>
- Product-boundary review:
  `/tmp/agent-reviews/os-646/product-boundary/round-1.json` — 5/5 clean
- Full-stack review: `/tmp/agent-reviews/os-646/full-stack/round-1.json` — 5/5
  clean
- Local gate: frozen install, format, check, aggregate tests/package lifecycle,
  build, 14 visual/a11y tests, and 41-file package inspection passed
