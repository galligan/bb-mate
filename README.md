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
