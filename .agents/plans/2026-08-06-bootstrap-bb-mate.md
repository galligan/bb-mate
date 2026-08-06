# Bootstrap BB Mate

Status: complete

## Outcome

Create one Bun monorepo for the browser workbench and independently publishable bb plugins while keeping the upstream bb checkout separate.

## Decisions

- The repository and product umbrella are named `bb-mate`; the visible workbench name is “BB Mate.”
- `apps/workbench` is a browser-only fake-state studio and does not require a running bb app.
- `plugins/*` packages each own a bb plugin manifest and release version.
- Shared packages will be introduced only when real duplication appears.
- The existing `galligan/bb-plugins` repository remains untouched until explicitly archived or deleted.

## Acceptance checks

- `bun install`
- `bun run check`
- `bun run test`
- `bun run build`
- GitHub repository remains private and resolves as `galligan/bb-mate`.
