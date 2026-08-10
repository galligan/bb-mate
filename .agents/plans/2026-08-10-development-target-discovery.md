# Source-first development-target discovery

Date: 2026-08-10
Status: Slice 57A merged; slice 57B1 implementation and review complete; merge pending
Issue: #57
Parent: #21
Depends on: #55 (merged through PR #71)

## Outcome

Persist stable, opaque `DevelopmentTarget` objects only from server-admitted
source roots, then reconcile those targets against bounded native inventory.
Installed plugins never seed candidates, target code never executes during
discovery, and browser/model projections never receive a raw source path.

## Delivery shape

Deliver #57 as three independently reviewable, merge-first slices:

1. **57A — secure persisted source catalog.** Admit bounded trusted roots,
   discover passive manifests, persist a self-bound target plus its private
   canonical root atomically, reopen it with a stable ID, and expose an
   allowlist-built redacted projection.
2. **57B1 — native reconciliation.** Normalize a bounded read-only released
   bb 0.36 inventory, classify exact path, other path, managed, builtin
   conflict, absent, duplicate, malformed, and stale states, and atomically
   persist only the public result plus bounded private host evidence.
3. **57B2 — Workbench adapter.** Adapt inspection and the browser Workbench to
   server-issued target IDs, resolve roots only in server composition, and
   remove the former external-symlink acceptance path.

Issue #57 closes only after all three slices merge and reconcile.

## Contract decisions

- A development target is self-bound: `envelope.id` and
  `envelope.bindings.targetId` are the same opaque target ID.
- A bb-context-bound, target-unbound trusted server principal may create or
  reconcile targets only through a dedicated target-catalog service with
  `targets:write`. `targets:read` may list that principal's targets before a
  target is selected. The generic object service remains target-bound.
- Caller DTOs never accept IDs for creation, authorization bindings, source
  paths, URLs, commands, credentials, or host/topology claims.
- The public envelope and private source-root record are one SQLite
  transaction. Canonical roots, trusted-root keys, raw inventory, and host
  facts never enter public payloads or event records.
- Inspection hands a candidate to runtime through a one-use, identity-backed
  transition. Directory and bounded `package.json` device/inode/hash evidence
  is attested before and after runtime issuance, retained by the runtime
  capability, and revalidated again immediately before catalog persistence.
- IDs are CSPRNG-generated in production and injectable in tests. Refresh and
  restart preserve the same ID for the same private canonical root.
- The `bb` object in `package.json` is the released plugin manifest. No second
  manifest format is introduced.

## Trusted-root policy

- Roots enter only from server startup/configuration, the current project
  context, or a previously authorized pinned record. Browser/model input can
  select only server-issued opaque IDs.
- V1 limits are explicit: 16 roots, depth 4, 2,048 visited entries, 128
  candidates, 256 KiB per package manifest, and 8,192 characters per bounded
  diagnostic. Exceeding a limit returns typed bounded evidence and does not
  hide safe siblings.
- Reject root leaf symlinks and every symlink component below the canonical
  root, including candidate directories, `package.json`, entrypoints, skills,
  icons, and themes. OS-level aliases preceding the configured root may
  canonicalize normally.
- Resolve lexically, reject absolute descendants and `..`, verify canonical
  containment, open manifest leaves without following symlinks, bound before
  reading, and recheck file identity after reading.
- Never scan home, `/`, installed plugin roots, `node_modules`, `.git`,
  `dist`, caches, or arbitrary hidden trees. Deduplicate by canonical root.

## Native reconciliation contract

Native inventory is a bounded read-only input after source discovery. Matching
precedence is malformed matching/top-level evidence, duplicate identity/root,
stale snapshot, exact canonical path, other path with the same plugin ID,
managed npm/Git identity, builtin identity conflict, then absent. Staleness is
computed from an injected clock and a 30-second V1 observation horizon.

Private host evidence is limited to runtime instance ID, bounded hostname,
optional local bb host ID/name/`isServer`, and observation time. It contains no
reachability, same-host verdict, bootstrap credential, browser URL, or topology
decision; #70 owns that gate.

## TDD execution

1. [x] Add the concrete strict v1 target codec, self-binding validation, and
       allowlist public projection with oversize/unknown/private-field tests.
2. [x] Add secure trusted-root admission and bounded passive candidate
       discovery with traversal, symlink, scan-limit, malformed-sibling, and
       no-execution sentinels.
3. [x] Add atomic private/public catalog persistence, target-unbound dedicated
       authorization, stable reopen/refresh IDs, optimistic revisions, and
       redacted events.
4. [x] Review, verify, merge, and reconcile slice 57A with two 5/5 lanes.
5. [x] Add a one-use bounded native-inventory capability, pure reconciliation
       fixtures for every required state, and atomic private host observations
       without lifecycle mutation, candidate seeding, or topology conclusions.
6. [ ] Run aggregate gates and two 5/5 lanes, then merge and reconcile 57B1.
7. [ ] Adapt one-authorized-target inspection and Workbench selection to
       opaque target IDs; reverse the prior external-symlink acceptance test.
8. [ ] Run visual/accessibility and aggregate gates, two 5/5 reviews, hosted
       CI, merge 57B2, close #57, and reconcile GitButler.

## Verification

- Focused inspection/runtime/catalog tests while iterating.
- `bun --filter @bb-mate/inspection check`
- `bun --filter @bb-mate/runtime check`
- `bun --filter @bb-mate/workbench check`
- `bun run visual:test` for the Workbench adapter slice.
- `bun run format:check && bun run check && bun run test && bun run build`
- Exact route/export audit proving no raw path/URL/shell, arbitrary filesystem
  browse, bootstrap/topology, lifecycle mutation, target execution, Connect,
  remote bind, or normal-profile surface was added.

## Stop conditions

Stop this issue before browser credential mint/redeem, automatic host-browser
control, target execution, build/install/dev/reload, managed-plugin mutation,
Connect pairing/exposure, arbitrary filesystem browsing, MCP, publication,
release, signing, or upstream submission. If a released bb contract is missing,
leave the dependent behavior unavailable and track the exact unblock.

## Done

All three slices are merged to `main`; #57 and #21 are current; exact local and
hosted gates pass; two independent review lanes score 5/5 with zero P0-P3;
GitButler is clean/reconciled; and the goal retrospective records exact proof.
