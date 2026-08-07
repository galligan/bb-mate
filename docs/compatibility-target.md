# BB Mate compatibility target

`compatibility/bb-target.json` is the reviewable record of the public bb
contracts and deliberately measured fixture values that BB Mate targets. The
check is an alarm, not an updater.

```sh
bun run compatibility:check
bun run compatibility:check --json
```

The check reads local manifests, the surface catalog, and the small named token
set; executes only `bb --version`; and fetches immutable public artifacts from
the recorded bb release tag. `BB_CLI` wins when set, then `bb` on `PATH`, then
the workspace's pinned `bb-app` binary so clean CI observes the same release
used for plugin builds. It does not load plugin code, contact Connect, or use
the sibling bb checkout. A failed network or native probe is `unverified` and
fails the command rather than silently passing.

The target is validated before any network request. Guard lists must be
non-empty and unique, and artifact URLs must be exact immutable paths on
`raw.githubusercontent.com/get-bb/bb`. Redirects are rejected.

## Updating the target

1. Read every failed check and its next action. Do not update values merely to
   make CI green.
2. Inspect the public diff between the old and proposed bb release refs. Review
   registry item and digest changes together. Reconcile SDK and registration
   changes with the public surface catalog first.
3. Run the full repository gate against the proposed values.
4. Open live bb at the proposed version and manually compare the representative
   sidebar and composer fixtures at their recorded viewport. Confirm row
   heights, sidebar geometry, typography, theme colors, focus treatment, and
   host-owned versus plugin-owned boundaries. Live bb is the visual authority;
   a green fixture check is not parity proof.
5. Record the live comparison and rationale in the pull request. Update only
   `compatibility/bb-target.json` and code genuinely required by the public
   contract. The expected target-only change should remain a small diff.

The local Inter range intentionally differs from the targeted bb app range.
Both values are recorded so either change is visible instead of being silently
normalized.

## Explicit temporary decisions

Default CI has no skip. A time-bounded exception must be a committed Markdown
record under `compatibility/decisions/` containing all four fields:

```md
# Compatibility Decision

Status: accepted
Owner: owner name
Reason: concrete bounded rationale
Expires: YYYY-MM-DD
```

Record that same repository-relative path as `acceptedDecision` in
`compatibility/bb-target.json`, then run
`bun run compatibility:check --decision compatibility/decisions/<record.md>`.
External paths, symlinks, missing fields, invalid dates, dates more than 90 days
away, and command-line-only explanations are rejected. Unverified network or
native probes can never be waived. For an accepted contract mismatch, the
report stays `accepted-drift`, lists every mismatch, and must not be described
as a clean compatibility pass.
