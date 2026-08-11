---
name: plugin-workbench
description: Use Plugin Workbench to inspect the packaged bb-mate runtime while developing a source-backed bb plugin.
---

# Plugin Workbench

Open **Plugin Workbench** from bb's plugin navigation to inspect the packaged
runtime's finite status.

- Runtime startup is explicit and lazy. Opening the panel alone does not run a
  target plugin or perform a native plugin lifecycle action.
- Browser launch and target discovery are currently unavailable. Do not invent
  a runtime URL, expose a loopback listener, or substitute installed inventory
  for source discovery.
- Use native `bb plugin build`, `bb plugin dev`, and `bb plugin reload` for
  lifecycle work. Plugin Workbench does not replace those commands.
- Treat Fixture, Harness, and Live claims separately. Harness remains
  unavailable while the official testing package is not publicly resolvable.
