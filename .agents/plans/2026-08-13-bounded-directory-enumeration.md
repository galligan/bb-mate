# Bounded directory enumeration (#97)

## Outcome

Discovery never materializes an unbounded directory before charging work. A
pathological directory becomes a path-free partial result while independent
roots and already discovered candidates remain visible.

## Verification

- RED/GREEN tracer for a per-directory limit and healthy sibling root.
- Incremental regressions for entry, byte, work, abort, deadline, symlink,
  workspace-pattern, UTF-8, and target nonexecution behavior.
- A 100k-entry subprocess fixture records wall time and peak RSS with a stable,
  deliberately generous ceiling.
- Focused inspection tests, then package check/format gates.

## Steps

- [x] Introduce a streaming, bounded, deterministic directory reader shared by
      generic and workspace discovery.
- [x] Emit one path-free partial diagnostic per truncated directory.
- [x] Preserve global cross-root fairness and safety attestations.
- [x] Add pathological and cancellation regressions while retaining the
      existing deadline, symlink, UTF-8, workspace-pattern, and nonexecution suite.
- [x] Record measurement evidence and run focused/full inspection gates.

## Deterministic selection contract

A directory is read independently of its root's current global share, up to the
fixed per-directory entry, filename-byte, and work caps. If the directory ends
within those caps, its complete bounded contents are sorted and global-budget
consumption may retain a bounded continuation for later fair-share
redistribution. If any per-directory cap is crossed, the incomplete prefix is
discarded and the directory contributes no children. This fail-closed rule is
independent of filesystem enumeration order and avoids presenting an arbitrary
prefix as authoritative.

The diagnostic names only the admitted redacted directory display path. A
nested overflow therefore reports, for example, `project/generated`, never its
canonical filesystem path.

## Measurement evidence

On macOS, a temporary APFS directory containing 100,000 empty files was
created outside the repository. The reader was then run in a fresh Bun process
under `/usr/bin/time -l`; fixture creation was excluded from the measurement.

- Result: limited after 1,535 charged entries, 18,420 filename bytes, and
  exactly 16,384 work units.
- Reader wall time: 0.131 seconds.
- Maximum resident set size: 65,748,992 bytes.

The reproducible regression creates the 100,000-entry directory, invokes a
fresh Bun subprocess, and removes the fixture. It enforces the structural
limits plus deliberately generous ceilings of five seconds and 256 MiB, rather
than coupling CI to the single-machine measurements above.
