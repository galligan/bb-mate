# Contributing to BB Mate

BB Mate is currently a private alpha. Contributions should keep it downstream,
small, and removable: when native bb owns a workflow, call or document that
workflow instead of recreating it here.

## Start here

1. Read [AGENTS.md](AGENTS.md), [README.md](README.md), and
   [docs/architecture.md](docs/architecture.md).
2. Use the Linear issue as the source of truth. For non-trivial work, add or
   update a plan under `.agents/plans/` before implementation.
3. Create the Linear-recommended non-main branch with GitButler.
4. Install exactly the locked dependencies:

   ```sh
   bun install --frozen-lockfile
   ```

## Change boundaries

- `apps/workbench` is browser-only Fixture tooling and must work without bb.
- `plugins/<name>` packages are independently versioned and use only public
  plugin contracts.
- `../bb` is read-only reference material unless an issue explicitly targets
  upstream.
- Native bb owns scaffold, declaration refresh, build, install, dev/reload, and
  runtime. BB Mate may inspect, explain, orchestrate, and hand off.
- Harness code must come from the selected plugin's official
  `@bb/plugin-sdk/testing` dependencies. Do not copy it or import it from the
  sibling checkout.
- Fixtures are deterministic approximations; Live bb remains the visual
  authority.
- Never commit secrets, authenticated browser state, customer data, or local
  absolute paths.

Review [docs/trust-model.md](docs/trust-model.md) before changing command or
execution boundaries. Document any new filesystem, network, secret, or
external-service access.

## Verification

Run the smallest relevant check while iterating, then the complete repository
gate before pushing:

```sh
bun run format:check
bun run check
bun run test
bun run build
```

UI changes also require the bounded browser gate:

```sh
bun run visual:test
```

Use `bun run package:test` when local package contents or lifecycle behavior can
change. That command is already included in the complete test gate.

New behavior needs focused tests. Documentation commands must be copyable and
verified in a clean checkout, an isolated artifact installation, or an exact
argv unit test when executing the command would mutate native state. Record any
deliberately unexecuted mutation handoff.

## Pull requests

Keep the PR draft until CI is green. Use a Conventional Commit title and include
context, changes, verification, and risk/rollout notes. Resolve every review
thread or explain the disagreement. Update Linear at phase boundaries and note
any divergence from its acceptance criteria.

Do not publish a package, create a tag or release, change repository visibility,
announce availability, or select a public license as part of ordinary feature
work. Those are separate owner-approved release actions.
