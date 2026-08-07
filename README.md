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

## Layout

```text
apps/workbench/  Browser-only design studio with deterministic fake bb state
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
