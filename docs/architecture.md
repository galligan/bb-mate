# Architecture

## Repository boundary

BB Mate is downstream of bb. The sibling `../bb` checkout is the live reference for public plugin SDK contracts and host behavior, but it is not part of this Bun workspace.

## Workbench

`apps/workbench` renders deterministic approximations of bb states in an ordinary browser. Its job is fast visual iteration, comparison, and discussion without booting the desktop app or manufacturing real repository state.

Fixtures should describe product state rather than mirror private bb database or React types. Adapters can translate those fixtures into components. This keeps prototypes stable when upstream internals change.

## Plugins

Each directory under `plugins/` is an independent package. A plugin owns its manifest, backend entry, optional frontend entry, tests, assets, and version. Local development uses path installation so bb loads the package in place.

Plugin UI can share host-neutral components with the workbench once a second consumer proves the boundary. Code that imports `@bb/plugin-sdk/app` stays inside the plugin adapter or entrypoint because that runtime only exists inside bb.

## Distribution

bb supports managed npm installation with `bb plugin install npm:<package>@<range>`. The intended release model is independent npm packages published from `plugins/*` by CI. Git monorepo subdirectory installation is proposed upstream in [get-bb/bb#1097](https://github.com/get-bb/bb/issues/1097).
