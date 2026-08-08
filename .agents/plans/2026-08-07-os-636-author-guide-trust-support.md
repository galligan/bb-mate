# OS-636 author guide, trust model, and support policy

## Outcome

Give an external plugin author a self-contained, verified path from prerequisites
to a first deterministic Fixture story, while making BB Mate's trust,
compatibility, mutation, support, and private-license boundaries unambiguous.

## Slice

1. Restructure the root entrypoint around a five-minute source-checkout path and
   link a package-artifact path that works without private Grid/Patch context.
2. Add an author guide covering package layout, public-SDK adapters, CLI and
   surface-lab workflows, and the Fixture/Harness/Live confidence model.
3. Add one operation matrix naming code-execution, filesystem/network/secret
   access, and native bb/Connect mutation boundaries for each supported command.
4. Add compatibility, support, deprecation, release, and upstream-adoption
   policies that preserve native bb ownership and make Live bb the visual
   authority.
5. Add CONTRIBUTING and SECURITY guidance with private reporting expectations,
   and document that `UNLICENSED` grants no public-use permission until the
   owner explicitly selects a license before any visibility or publication
   change.
6. Run every copyable command from an isolated clean checkout or the installed
   local artifact; keep durable verification evidence in the docs/goal record.

## Boundaries

- No publish, tag, release, repository-visibility change, announcement, public
  license choice, or upstream bb edit.
- No normal plugin install/build/dev operation and no Connect expose/pair state
  mutation during verification; use deterministic fixtures and isolated copies.
- Harness remains unavailable until the official public testing package and a
  BB Mate upstream-backed adapter both resolve.
- BB Mate remains deletable: native bb owns scaffold, declaration refresh,
  build, install, dev/reload, and runtime.
- Security guidance treats plugins as full-trust local code and content-script
  fixtures as inert; it does not promise a sandbox BB Mate does not provide.

## Verification

- Clean-checkout quickstart commands execute exactly as written.
- Copied local artifact installs, runs help/inspection/lab, and uninstalls in an
  isolated temporary environment.
- Documentation link and copyable-command audit.
- `bun run format:check && bun run check && bun run test && bun run build`.
- Standing security/trust review plus a fresh targeted external-author docs
  review; fix every P0-P2 and reasonable P3.
- Draft PR, hosted CI and review-thread audit, ready/merge, post-merge main CI,
  and Linear Done.

## Progress

- [x] Inventory and reconcile existing author-facing documentation.
- [x] Add the external author, trust/mutation, compatibility/support, and
      contribution/security documents.
- [x] Verify every copyable command in clean source and artifact environments.
- [x] Complete aggregate gates and standing/fresh-targeted review.
- [x] Land the PR, verify main CI, and move OS-636 to Done.

## Completion

Complete when a new author can reach a first Fixture story without private
context, correctly predict which commands execute code or mutate native state,
understand compatibility/support and fidelity claims, and see the explicit
owner approval gates that still block public licensing and release.
