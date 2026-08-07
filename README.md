# bb-mate

BB Mate is a private Bun monorepo for designing, prototyping, and shipping extensions around [bb](https://github.com/get-bb/bb).

The browser workbench lives in `apps/workbench`. Installable bb plugins live in `plugins/<name>` as independent workspace packages with their own manifests and release versions.

## Commands

```sh
bun install
bun run dev
bun run check
bun run test
bun run build
```

## Native plugin loop

The private `bb-mate` CLI keeps fixture work and compatibility guidance in this
repository while delegating build, install, reload, and live runtime behavior
to native bb:

```sh
bun run bb-mate --help
bun run bb-mate inspect plugins/linear
bun run bb-mate check plugins/linear
bun run bb-mate plugins/linear
bun run bb-mate live plugins/linear
```

The bare form aliases `dev` and launches the existing workbench on
`127.0.0.1:5173` with strict port binding. `--host` and `--port` can make that
fixture server reachable beyond localhost; BB Mate only reports the existing
Connect status and never exposes or pairs Connect on your behalf. A remote URL
is shown only when `bb connect status --json` already reports a share for the
selected workbench port on the invoking host; the account's base Connect URL
and another host's same-port share are not workbench exposure.

`check` runs the compatibility report, delegates exactly `bb plugin build .`,
then refreshes the report. `live` delegates `bb plugin dev .` only when native
bb reports the selected real path as installed. Otherwise it prints the exact
path-install command without running it. Set `BB_CLI` to select a specific bb
executable; an executable on `PATH` is used as the fallback.

## Layout

```text
apps/workbench/  Browser-only design studio with deterministic fake bb state
packages/        Shared authoring contracts with at least two real consumers
plugins/         Independently installable and publishable bb plugin packages
docs/            Architecture, product notes, and release guidance
.agents/plans/   Durable implementation plans and decision records
```

The canonical bb source checkout is intentionally separate at `../bb`. It is reference material, not a workspace dependency.

## Relationship to bb

BB Mate is a downstream authoring companion, not an alternate plugin runtime.

| bb owns                                    | BB Mate owns                               |
| ------------------------------------------ | ------------------------------------------ |
| Plugin SDK contracts and testing harnesses | Workspace discovery and inspection         |
| Scaffolding and declaration refresh        | Deterministic fixtures and stories         |
| Build, install, reload, and runtime        | Thin native-command orchestration          |
| Host layout, styling, routing, and state   | Compatibility diagnostics and live handoff |

This distinction keeps BB Mate deletable at every seam: when bb improves a
native workflow, BB Mate should consume it instead of maintaining a competing
implementation.

## Preview fidelity

BB Mate names three different levels of confidence:

- **Fixture** — deterministic browser state for fast visual iteration. It is an
  approximation and runs without bb.
- **Harness** — behavioral validation through the official
  `@bb/plugin-sdk/testing` packages. It checks public contracts, not host CSS or
  layout.
- **Live bb** — the plugin running inside bb. This is the visual and integration
  authority.

The workbench discovers the only plugin under `plugins/` automatically. When a
workspace contains more than one plugin, choose one explicitly:

```sh
BB_MATE_PLUGIN=plugins/<name> bun run dev
```

The overlay reads `package.json`, native `dist/*.meta.json`, and native bb CLI
JSON output. Discovery never imports or executes plugin code. Harness mode only
activates when the selected plugin can resolve the officially distributed
`@bb/plugin-sdk/testing` and `@bb/plugin-sdk/testing/app` packages; BB Mate does
not copy them or import them from `../bb`.

## Compatibility report

The workbench exposes the selected plugin's passive report at
`/bb-mate-plugin.json`. The JSON contract is versioned with `schemaVersion: 1`
and keeps Fixture, Harness, and Live capability claims separate. It checks
manifests, native build metadata, declared bb and SDK engine ranges, native
plugin state, npm SDK publication, and native provenance. Registry publication
is reported separately from selected-plugin dependency resolution, so a missing
official package is not confused with a broken local install. Actionable checks
include a concrete next action; failed native checks retain their command, exit
status, and bounded stdout/stderr evidence.

Passive Connect metadata keeps the account base URL and global status shares
separate from the invoking host returned by `bb connect shares --json`. Typed
shares retain `hostId`, `hostName`, `port`, `url`, availability, and any
unavailable reason. Consumers can report whether a specific local port is
already usable without calling expose, unexpose, or pair.

The same shared package provides a concise terminal formatter for the bb-mate
CLI. Reports always disclose that plugins are full-trust local code. They only
summarize settings, capabilities, services, skills, themes, and entrypoints
that supported metadata actually exposes; general filesystem, network, secret,
and external-service access remains explicitly undisclosed rather than inferred
from source.

The broader native/version target is recorded in
`compatibility/bb-target.json`. Run `bun run compatibility:check` for an
actionable human report or add `--json` for the machine report. The manual live
verification and update workflow is documented in
[`docs/compatibility-target.md`](docs/compatibility-target.md).

Current upstream dependencies:

- [get-bb/bb#1134](https://github.com/get-bb/bb/issues/1134) tracks the missing
  external `@bb/plugin-sdk` distribution required for Harness mode.
- [get-bb/bb#1133](https://github.com/get-bb/bb/issues/1133) and draft
  [PR #1135](https://github.com/get-bb/bb/pull/1135) own the native scaffold
  development-dependency fix. BB Mate does not patch generated scaffolds.
