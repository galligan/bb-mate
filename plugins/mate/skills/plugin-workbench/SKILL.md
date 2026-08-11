---
name: plugin-workbench
description: Use Plugin Studio to inspect source plugins across eligible local bb projects with the packaged bb-mate runtime.
---

# Plugin Studio

Open **Plugin Studio** from bb's plugin navigation to inspect the packaged
runtime and its finite schema-v3 catalog.

- Opening the panel first requests read-only status. That request does not start
  the runtime, open its catalog, or inspect source. It may report the current
  runtime state as idle, starting, ready, stopping, unavailable, or failed
  without changing it.
- On mount, Workbench automatically performs one bounded refresh across all
  eligible bb-registered local projects. The refresh icon repeats that same
  all-project operation. There is no per-project selector or admit action.
- Discovery checks each project root and packages inside its declared npm or Bun
  workspace configuration, including supported bounded `pnpm-workspace.yaml`
  patterns. All project groups and plugin rows remain expanded; choose a plugin
  row to open its detail view.
- The refresh does not execute target code, package scripts, installed-plugin
  inventory, or native plugin lifecycle actions. Source paths stay private to
  the backend and runtime; the panel receives only bounded opaque projections.
- Preview remains unavailable under #70. Do not invent a runtime URL, expose a
  loopback listener, or substitute installed inventory for source discovery.
- Use native `bb plugin build`, `bb plugin dev`, and `bb plugin reload` for
  lifecycle work. Plugin Studio does not replace those commands.
- Treat Fixture, Harness, and Live claims separately. Harness remains
  unavailable while the official testing package is not publicly resolvable.
