---
name: plugin-workbench
description: Use Plugin Workbench to inspect the packaged bb-mate runtime while developing a source-backed bb plugin.
---

# Plugin Workbench

Open **Plugin Workbench** from bb's plugin navigation to inspect the packaged
runtime's finite status and passively discover source-first development targets
from an explicitly selected eligible bb project.

- Runtime startup and project admission are explicit and lazy. Opening or
  refreshing the panel alone does not start the runtime, discover a source, run
  target code, or perform a native plugin lifecycle action.
- Select one eligible released-bb project in the panel, then admit its
  primary-host local source. The source path stays private to the backend and
  runtime; the panel receives only bounded opaque target projections.
- Browser launch remains unavailable. Do not invent a runtime URL, expose a
  loopback listener, or substitute installed inventory for source discovery.
- Use native `bb plugin build`, `bb plugin dev`, and `bb plugin reload` for
  lifecycle work. Plugin Workbench does not replace those commands.
- Treat Fixture, Harness, and Live claims separately. Harness remains
  unavailable while the official testing package is not publicly resolvable.
