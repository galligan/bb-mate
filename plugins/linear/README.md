# bb-plugin-linear

Search Linear issues from bb's prompt box and attach fresh issue details as
agent-only context.

Type `#` followed by an issue identifier or title, then choose a result from
the **Linear issues** section. Result subtitles use compact status and priority
symbols for faster scanning while retaining their text labels. At send time
the plugin fetches the issue again and gives the agent its current status,
priority, assignee, project, labels, relations, sub-issues, URL, and
description.

## Install

From this directory:

```sh
bb plugin install .
```

The plugin installs from this path, so source edits can be activated with:

```sh
bb plugin reload linear
```

## Configure

Create a personal API key under Linear's **Security & access** settings. Open
the Linear plugin's page in bb Settings and paste it into **Linear personal API
key**. Keeping the key out of a shell command prevents it from landing in shell
history.

The optional team filter is safe to set from the CLI:

```sh
bb plugin config linear set teamKey PAT # optional
```

`teamKey` restricts results to one Linear team. Leave it unset to search every
team visible to the API key. With no fixed team, an exact uppercase key such as
`#PAT`, or a dashed prefix such as `#pat-` and `#PAT-80`, automatically scopes
that search to the matching team. An ordinary lowercase query such as `#pat`
remains a workspace-wide text search.

A bare team key such as `#PAT` acts as a compact working queue instead of a
fuzzy search. It omits completed and canceled issues, then orders results by
workflow state (In Progress, Todo/Triage, Backlog), priority, recent mention
use, last update, and identifier. More specific queries retain Linear's search
relevance ordering.

The API key is declared as a secret bb setting. It is stored outside bb's
plugin database, is never exposed to the frontend, and is not included in
errors or logs.

## Develop

```sh
bun install
bun run test
bun run check
bun run build
```

The plugin uses Linear's current `searchIssues` GraphQL field with ten bounded
results. Queries shorter than two characters make no API request, search calls
time out before bb's two-second mention-provider deadline, and successful
results are cached for one minute. Identical in-flight searches are coalesced;
if a refresh times out, results up to ten minutes old can keep the menu useful.
The cache is limited to 100 queries and clears when credentials or team scope
change. Cache entries include any team scope inferred from the query. Selected
issues are always resolved fresh at send time. Descriptions are capped at
20,000 characters to keep prompt context bounded.

When a message containing a Linear mention is sent, bb resolves that issue once
to attach fresh context. The plugin stores the issue ID, local send count, and
last-sent time in its plugin database. Mentions sent within the last 30 days
receive a tertiary browse-ranking boost; the plugin does not send this usage
history to Linear. Successfully resolving a mention clears the search cache so
the next bare-team browse can reflect the signal.

## Files

- `server.ts` registers settings and the `#` mention provider.
- `linear.ts` owns the GraphQL client, validation, and context formatting.
- `linear.test.ts` covers search, parsing, safe errors, and context bounds.
- `mention-usage.ts` persists local sent-mention usage for browse ranking.
- `mention-usage.test.ts` covers usage aggregation and retrieval.
- `search-cache.ts` owns bounded search caching and request coalescing.
- `search-cache.test.ts` covers cache freshness, fallback, and eviction.
- `types/bb-plugin-sdk.d.ts` is the bb plugin API bundled by the scaffold.
