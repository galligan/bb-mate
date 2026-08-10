# Plugin Workbench released-capability matrix

Date verified: 2026-08-10  
Released target: `bb-app@0.36.0`, plugin SDK declarations `0.4.1`

Plugin Workbench is allowed to depend only on public behavior shipped in a
released bb artifact. This matrix records the clean-room Gate 0 probe that
decides which host integrations can be built in BB Mate without importing the
upstream checkout or inventing an SDK substitute.

## Result

| Capability          | Result | Released proof                                                                                                                  | Delivery consequence                                                               |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Frontend shell      | Pass   | `bb plugin new --app`, refreshed generated declarations, `navPanel`, native frontend build                                      | Build a real `bb-plugin-mate` navigation panel                                     |
| Backend supervision | Pass   | `bb.background.service` and `bb.onDispose` type-check and build                                                                 | Supervise the packaged `bb-mate` runtime from the plugin                           |
| Native tools        | Pass   | A strict bounded Zod tool type-checks, builds, and packs                                                                        | Expose Workbench domain operations as native bb tools                              |
| Skills              | Pass   | Manifest skill roots and conditional `bb.agents.configure` type-check, build, and pack                                          | Ship one project-aware `plugin-workbench` skill                                    |
| Thread and composer | Pass   | Mention provider, thread-panel action, message action, composer mention, and quote APIs type-check and build                    | Reference Workbench objects through released mentions, quotes, panels, and actions |
| Isolated lifecycle  | Pass   | Path install, source inspection, reload, disable, enable, second reload, and remove all succeed in a disposable bb 0.36 profile | Include installed-live lifecycle proof in the integrated trial                     |

These passes establish contract availability, not finished product behavior.
The integrated plugin still needs runtime protocol, visual mounting, lifecycle,
security, accessibility, and clean-room tests before it is considered ready.

## Clean-room method

The probes used the published `bb-app@0.36.0` package and generated declarations
only. They did not resolve `@bb/plugin-sdk` from npm, use a workspace link,
import `../bb`, or copy SDK/runtime/testing code.

Build probes used fresh scaffold directories, isolated npm/Bun caches, and the
native commands:

```sh
bb plugin new <name> --app
npm install --include=dev
bb plugin types <path> --check
tsc --project <path>/tsconfig.json --noEmit
bb plugin build <path>
npm pack --json --ignore-scripts
```

The lifecycle probe started the published server with Node under `env -i` and
explicit disposable `HOME`, XDG roots, caches, data directory, loopback host,
server port, and host-daemon port. Before any plugin mutation, launcher output
and `bb status --json` agreed on the temporary data directory. Every client
command used the matching `BB_SERVER_URL` and host-daemon port.

The temporary plugin was installed by path, reloaded, disabled, enabled,
reloaded, and removed. Shutdown left no temporary listener or process. The
normal desktop stayed on its original ports and its plugin inventory contained
no temporary source or identifier.

## Released-artifact caveats

### Scaffold dependency install

The 0.36 app scaffold's initial install does not install all generated
development dependencies. An explicit `npm install --include=dev` makes
declaration checks, TypeScript, and native builds pass. This is degraded
scaffold ergonomics tracked upstream in
[get-bb/bb#1133](https://github.com/get-bb/bb/issues/1133) and
[get-bb/bb#1135](https://github.com/get-bb/bb/pull/1135), not an SDK blocker.

### Package allowlist

The generated `.gitignore` excludes `dist/`, and the scaffold has no npm
`files` allowlist or `.npmignore`. Raw `npm pack` therefore omits the built
artifacts. `bb-plugin-mate` must declare an explicit allowlist containing its
prebuilt `dist` output, skills, and packaged runtime, and its package inspection
gate must verify every required file plus executable mode and checksum.

### Server runtime

The published `dist/bb-app.js` server entrypoint runs with Node. Launching that
entrypoint with Bun fails on the Node `registerHooks` API. This affects the
isolated test recipe; it does not change the compiled `bb-mate` runtime target.

### Harness mode

`@bb/plugin-sdk@0.4.1` still returns npm E404, so the official external Harness
is unavailable. BB Mate must continue to label Harness unavailable rather than
copying it from the sibling checkout. Fixture and isolated Live bb proofs remain
separate and honest.

### Host limits

Released contracts still do not provide automatic in-app browser control,
capture of arbitrary bb browser tabs, generic first-class thread attachments,
or remote-host loopback tunneling. V1 therefore uses a visible Copy/Open browser
handoff, Workbench-owned Fixture capture, and mentions/quotes/panels/tool images.

## Admission decision

All six conditional host rows are admitted to the downstream Plugin Workbench
program. A later regression in one row narrows only that dependent slice; it
does not authorize a private fallback or block the runtime, browser, domain, or
MCP work that remains independent.
