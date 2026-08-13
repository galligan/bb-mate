# Trust and operation model

bb Plugin Studio does not sandbox plugins. A bb plugin is full-trust local code once its
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

| Operation                                              | Executes code                                                                           | Reads local data                                 | Network/listener                                                     | Mutation                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                        | Bun and dependency install scripts permitted by the package manager                     | manifests and lockfile                           | may download dependencies                                            | writes `node_modules` and caches; no bb mutation                       |
| `bun --filter @bb-plugin-studio/workbench stories ...` | bb Plugin Studio and development dependencies                                           | checked-out Fixture source                       | loopback HTTP listener by default                                    | build/tool caches only; no selected plugin or bb state                 |
| `bun run bb-plugin-studio --help`                      | bb Plugin Studio CLI                                                                    | CLI bundle/source only                           | none                                                                 | none                                                                   |
| `bun run bb-plugin-studio inspect <path>`              | bb Plugin Studio plus passive native bb commands; never the plugin entrypoint           | plugin manifest/build metadata and native status | may query npm; passive Connect status only                           | none                                                                   |
| `bun run bb-plugin-studio dev <path>`                  | passive inspection plus bb Plugin Studio's source Vite server or packaged static server | Fixture assets and passive plugin metadata       | HTTP listener at the requested host; reports existing shares         | no install/build/reload, Connect expose/pair, or plugin entrypoint     |
| `bun run bb-plugin-studio check <path>`                | all of the above plus native `bb plugin build .` and the plugin build toolchain         | selected plugin tree                             | whatever the build toolchain performs                                | writes native build artifacts; does not install the plugin             |
| `bun run bb-plugin-studio live <path>`                 | native `bb plugin dev .` and full plugin runtime                                        | whatever bb and the plugin can access            | whatever bb and the plugin perform                                   | may reload the already installed path plugin and change runtime state  |
| printed `bb plugin install <path> --yes` handoff       | not executed by bb Plugin Studio                                                        | none until the author runs it                    | none until run                                                       | author-run command installs/mutates native plugin state                |
| `bun run package:*`                                    | bb Plugin Studio packaging scripts and dependency build tools                           | repository and dependency metadata               | install/test may use npm as documented                               | writes ignored artifacts and isolated temporary state; never publishes |
| `bun run check` or `compatibility:check`               | repository check code and the passive compatibility probes                              | manifests, target record, and public metadata    | queries the immutable public upstream and npm evidence in the target | none beyond tool caches; no native bb mutation                         |
| root `bun run test` or `bun run build`                 | every workspace's scripts, including plugin-owned tests and native `bb plugin build`    | repository and plugin source                     | whatever a plugin-owned test/build toolchain performs                | test/build output including plugin `dist`; no install/reload           |
| `bun run visual:test`                                  | deterministic Fixture browser/test code and dependencies                                | Fixture source and checked-in baselines          | loopback test server                                                 | test output only; no selected plugin or native bb state                |

The source-checkout Workbench refuses non-loopback Vite hosts. Its dev-only
`/bb-plugin-studio-session.json` endpoint requires the request to reach the actual
loopback listener with an exact Host and, when present, same-origin Origin. It
accepts only an empty query or one opaque `target` selector and returns a strict,
bounded, no-store schema-v2 projection. A request runs no `bb`, Connect, npm,
build, or target code and exposes no command, URL, canonical root, host identity,
or provenance. This is a constrained local development adapter, not the
authenticated Workbench runtime API; browser credentials and same-instance
topology belong to #70. The packaged lab remains static, loopback-only, and has
no session endpoint.

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
- Keep secrets in native bb's supported settings/secret facilities; bb Plugin Studio
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
Opaque target IDs resolve only against the server-prepared catalog, and the
source-workbench response is built from an explicit public allowlist rather
than regex redaction. Private catalog state lives beneath a mode-0700 data root;
its owned identity file is a mode-0600 regular single-link file. The session GET
does not execute native commands, mutate plugin state, or import an entrypoint.
These controls reduce accidental disclosure; they do not turn bb Plugin Studio or
plugins into untrusted-code sandboxes.

Report suspected boundary failures using [SECURITY.md](../SECURITY.md).
