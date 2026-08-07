# OS-629 compatibility drift alarm

## Outcome

Make BB Mate's targeted bb, SDK, component-registry, dependency, measured-token,
and public-registration contracts explicit and fail precisely when they drift.

## Slice

1. Add one versioned JSON target containing expected bb/SDK versions, immutable
   public release artifacts, registry digest/items, local/upstream dependency
   ranges, measured replica tokens, and the selected registration paths.
2. Add a deterministic TypeScript checker with human and JSON output. It reads
   local public contracts, executes only `bb --version`, and fetches immutable
   public GitHub artifacts. Network/probe failures are blocking and actionable.
3. Add unit tests for matching, every drift family, unverified probes, report
   formatting, and the explicit documented-decision escape hatch.
4. Wire the checker and its static/tests into the existing root gates without a
   bespoke CI workflow step.
5. Document the deliberately manual target-update/live-bb verification process.

## Boundaries

- No upstream/private imports, sibling runtime dependency, plugin execution,
  lifecycle command, Connect access, automatic updater, or broad CSS hash.
- The registry is checked through its public immutable release artifact.
- The measured token list is intentionally small and names only replica values.
- The existing surface catalog remains the registration-path authority.
- An accepted drift requires a committed decision record with owner, reason,
  and expiry; default CI never passes drift silently.

## Verification

- `bun test scripts/compatibility-check.test.ts`
- `bunx tsc -p scripts/tsconfig.json`
- `bun run compatibility:check`
- `bun run format:check && bun run check && bun run test && bun run build`
- Passive real probes only: active `bb --version` and public immutable URLs.
- Standing plus targeted reviews, then GitButler draft/hosted CI/thread gate.

## Completion

Complete when the issue PR is ready, green, reviewed with zero open P0-P2,
merged to main, Linear is Done, and the goal retro records exact proof.
