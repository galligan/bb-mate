# Trust and operation model

BB Mate does not sandbox plugins. A bb plugin is full-trust local code once its
entrypoints, build toolchain, or native runtime are executed. Treat a plugin
repository like any other program you might run on your machine: review its
source and dependencies first, and use a disposable environment for unknown
code.

## What inspection can and cannot disclose

Passive inspection reads supported manifests and generated metadata. It can
list declared entrypoints, settings, skills, themes, capabilities, and services;
it cannot prove that a plugin avoids general filesystem, network, secret, or
external-service access. Those accesses remain explicitly undisclosed unless
the plugin author documents them.

Inspection may call read-only native commands for bb version, plugin state, and
Connect status/shares, and may query the npm registry for public SDK status. It
does not import the plugin, install it, build it, mount content scripts, expose
Connect, or pair an account.

## Operation matrix

| Operation                                        | Executes code                                                                   | Reads local data                                 | Network/listener                                                           | Mutation                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                  | Bun and dependency install scripts permitted by the package manager             | manifests and lockfile                           | may download dependencies                                                  | writes `node_modules` and caches; no bb mutation                       |
| `bun --filter @bb-mate/workbench stories ...`    | BB Mate and development dependencies                                            | checked-out Fixture source                       | loopback HTTP listener by default                                          | build/tool caches only; no selected plugin or bb state                 |
| `bun run bb-mate --help`                         | BB Mate CLI                                                                     | CLI bundle/source only                           | none                                                                       | none                                                                   |
| `bun run bb-mate inspect <path>`                 | BB Mate plus passive native bb commands; never the plugin entrypoint            | plugin manifest/build metadata and native status | may query npm; passive Connect status only                                 | none                                                                   |
| `bun run bb-mate dev <path>`                     | passive inspection plus BB Mate's source Vite server or packaged static server  | Fixture assets and passive plugin metadata       | HTTP listener at the requested host; reports existing shares               | no install/build/reload, Connect expose/pair, or plugin entrypoint     |
| `bun run bb-mate check <path>`                   | all of the above plus native `bb plugin build .` and the plugin build toolchain | selected plugin tree                             | whatever the build toolchain performs                                      | writes native build artifacts; does not install the plugin             |
| `bun run bb-mate live <path>`                    | native `bb plugin dev .` and full plugin runtime                                | whatever bb and the plugin can access            | whatever bb and the plugin perform                                         | may reload the already installed path plugin and change runtime state  |
| printed `bb plugin install <path> --yes` handoff | not executed by BB Mate                                                         | none until the author runs it                    | none until run                                                             | author-run command installs/mutates native plugin state                |
| `bun run package:*`                              | BB Mate packaging scripts and dependency build tools                            | repository and dependency metadata               | install/test may use npm as documented                                     | writes ignored artifacts and isolated temporary state; never publishes |
| `bun run test`, `build`, or `visual:test`        | repository/test/build code and dependencies                                     | repository Fixture/test source                   | local test servers; compatibility probes may use public upstream endpoints | build/test artifacts only; no supported native bb mutation             |

`--host` on source-checkout `dev` is an explicit exposure choice for the Fixture
server. The packaged lab rejects non-loopback hosts. Neither path authenticates
clients, so do not serve sensitive fixture data or bind an untrusted interface.

## Content scripts

Content scripts are the highest-risk frontend surface because Live bb mounts
them into the host application lifecycle. The surface lab renders only inert
descriptions of their declared inputs and outcomes; ordinary discovery and
Fixture rendering never call `mountPluginContentScripts` or import a plugin
entrypoint. Only validate real content-script behavior in the official Harness
when available or in a controlled Live bb profile.

## Secrets and external services

- Never put real tokens or customer data in fixtures, screenshots, issue
  comments, logs, or test snapshots.
- Keep secrets in native bb's supported settings/secret facilities; BB Mate
  does not provide a second credential store.
- Assume plugin server code can read the invoking user's files and environment
  and can make network requests unless its implementation proves otherwise.
- Treat copied terminal commands as code. Inspect the exact target and current
  directory before running them.
- Do not remove and reinstall a managed plugin merely to retarget its source;
  that can discard settings or secrets. Use a preserve-state native route or
  re-enter credentials intentionally.

## Security boundary

The browser does not receive raw plugin roots or incidental absolute paths.
Opaque candidate keys are resolved server-side, browser reports redact path
hierarchy, and no HTTP endpoint executes native actions. These controls reduce
accidental disclosure; they do not turn BB Mate or plugins into untrusted-code
sandboxes.

Report suspected boundary failures using [SECURITY.md](../SECURITY.md).
