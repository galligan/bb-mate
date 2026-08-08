# OS-637 clean-room external-author alpha trial

## Outcome

Prove that a first-time plugin author can use the private local alpha from a
fresh, reproducible environment by following only the author-facing docs, and
turn every material point of friction into a verified fix or an explicit
release blocker.

## Slice

1. Build and install the local artifact into an isolated temporary prefix with
   no sibling bb checkout, BB Mate symlink, saved secret, or inherited project
   configuration.
2. Create a deterministic example plugin outside the repository and exercise
   discovery, inspection, all catalog surfaces, URL-backed fixture controls,
   and fixture edit/reload.
3. Run compatibility and native checks with an explicitly provisioned bb
   0.35.1 binary. Keep native build/live activity confined to the temporary
   fixture plugin and record expected unavailable states as actionable output.
4. Capture elapsed milestones, commands, versions, successes, failures,
   terminology friction, undocumented assumptions, and decisions in a concise
   sanitized report.
5. Fix every P0/P1 finding, rerun the trial from a new temporary root, and
   obtain standing plus fresh targeted external-author review before landing.

## Boundaries

- No publish, tag, release, repository-visibility change, announcement, public
  license choice, or upstream bb edit.
- No existing user plugin, normal bb configuration, saved secret, or Connect
  expose/pair/share state may be changed.
- Native operations may target only the disposable trial plugin and disposable
  configuration created for this issue; no plugin installation is required to
  prove an actionable Live handoff.
- Harness remains expected unavailable until the official public testing
  package and a BB Mate adapter resolve.
- Live bb remains the visual authority; fixture discovery is not parity proof.

## Verification

- Run the exact documented setup from a fresh temporary root.
- Prove the installed archive, source checkout, sibling bb checkout, secrets,
  and implicit shell configuration are absent from the trial root.
- Discover all 13 catalog surfaces and distinguish host-owned, plugin-owned,
  lifecycle-only, and unavailable surfaces.
- Modify a deterministic fixture, observe served output change, then restore
  or discard the disposable workspace.
- Exercise compatibility, inspection, check, and Live handoff outcomes against
  only the disposable plugin.
- Run `bun run format:check && bun run check && bun run test && bun run build`
  and all 14 Playwright/axe checks.
- Complete standing and fresh targeted review, then draft PR, hosted CI/thread
  audit, ready/merge, post-merge main CI, and Linear Done.

## Progress

- [x] Build the reproducible clean-room trial harness and sanitized report.
- [x] Run the first-time author journey and triage every finding.
- [ ] Fix all P0/P1 and reasonable P2/P3 friction, then rerun from scratch.
- [ ] Complete aggregate gates and standing/fresh-targeted review.
- [ ] Land the PR, verify main CI, and move OS-637 to Done.

## Completion

Complete when the clean-room report proves the documented alpha journey from a
fresh environment, contains no private path or secret, has no open P0/P1
finding, and leaves expected upstream-dependent modes as clear actionable
handoffs rather than dead ends.
