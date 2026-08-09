# Linear to GitHub issue migration

## Outcome

Move the complete 29-issue Linear `bb` project history into GitHub Issues so
the public repository owns its roadmap, completed work, dependencies, and PR
traceability.

## Scope

- OS-617 through OS-624 where present: upstream platform and Linear mention
  plugin work.
- OS-627 and its complete BB Mate graph, including OS-623 and OS-628 through
  OS-647.
- All seven Linear milestone groupings and all issue labels used by the source
  issues.
- Every existing BB Mate pull request whose body or branch maps to a migrated
  issue.

## Plan

1. [x] Inventory the live Linear project, full issue descriptions, relations,
       statuses, labels, milestones, attachments, GitHub issues, and PR bodies.
2. [x] Create missing GitHub labels and milestones.
3. [x] Create all 29 GitHub issues with complete source descriptions and Linear
       provenance, keeping backlog/upstream work open.
4. [x] Replace migrated Linear cross-references with the verified GitHub issue
       map and encode parent, blocking, blocked-by, and related relationships.
5. [x] Update historical PR bodies to point to their GitHub issues instead of
       using Linear identifiers or project links.
6. [x] Add landing evidence and close every GitHub issue whose live Linear
       status is Done; leave OS-617, OS-618, OS-624, OS-627, and OS-639 through
       OS-644 open.
7. [x] Audit issue counts, states, labels, milestones, cross-links, PR bodies,
       and absence of remaining migrated Linear URLs; update Linear with the
       GitHub migration map.
8. [x] Land this durable migration record and leave main clean and lane-free.

## Migration rules

- Preserve full intent and acceptance criteria; do not compress completed
  issues into retrospective summaries.
- Keep one explicit original Linear URL and ID in each issue's provenance
  footer, but rewrite cross-issue links to GitHub.
- Preserve external upstream GitHub links as-is.
- Use `completed` when closing work that Linear reports Done.
- Do not close backlog, in-progress, or upstream-dependent issues.
- Do not modify implementation code, npm state, releases, tags, or upstream bb.

## Evidence

- Linear project: `bb`
- Source issues: 29
- GitHub issue baseline: 0
- Existing pull requests: #1–#4 and #6–#20 (19 total)
- GitHub roadmap: <https://github.com/galligan/bb-mate/issues/21>
- Verified migration map:
  - OS-627 → #21
  - OS-617 → #22; OS-618 → #23; OS-619 → #24; OS-620 → #25
  - OS-621 → #26; OS-622 → #27; OS-623 → #28; OS-624 → #29
  - OS-628 → #30; OS-629 → #31; OS-630 → #32; OS-631 → #33
  - OS-632 → #34; OS-633 → #35; OS-634 → #36; OS-635 → #37
  - OS-636 → #38; OS-637 → #39; OS-638 → #40; OS-639 → #41
  - OS-640 → #42; OS-641 → #43; OS-642 → #44; OS-643 → #45
  - OS-644 → #46; OS-645 → #47; OS-646 → #48; OS-647 → #49
- Final GitHub state: 29 issues, 19 closed as completed, 10 open.
- All issue labels, milestones, source statuses, completion records, and original
  Linear provenance links matched the source inventory.
- All 19 historical PR bodies point to GitHub issues and contain no Linear URL
  or migrated OS identifier.
- All 29 original Linear issues link back to their GitHub counterpart; the
  Linear project count remained 29, confirming no duplicate sync records.
