const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";
const SEARCH_LIMIT = 10;
const SEARCH_TIMEOUT_MS = 1_800;
const DESCRIPTION_LIMIT = 20_000;
const RECENT_USAGE_MS = 30 * 24 * 60 * 60 * 1_000;

type Fetch = typeof globalThis.fetch;

interface NamedValue {
  name: string;
}

interface IssueReference {
  identifier: string;
  title: string;
}

interface IssueRelation {
  type: string;
  issue?: IssueReference;
  relatedIssue?: IssueReference;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  priorityLabel: string;
  state: { name: string; type: string };
  team: { key: string; name: string };
  assignee: NamedValue | null;
  project: NamedValue | null;
  labels: { nodes: NamedValue[] };
  parent: IssueReference | null;
  children: {
    nodes: Array<IssueReference & { state: NamedValue }>;
  };
  relations: { nodes: IssueRelation[] };
  inverseRelations: { nodes: IssueRelation[] };
}

export interface LinearMentionItem {
  id: string;
  title: string;
  subtitle: string;
}

export interface LinearBrowseItem extends LinearMentionItem {
  stateType: string;
  priority: number;
  updatedAtMs: number;
}

export interface LinearMentionUsage {
  sentCount: number;
  lastSentAtMs: number;
}

interface LinearClientOptions {
  apiKey: string;
  teamKey: string;
  fetch?: Fetch;
}

export function resolveSearchTeamKey(
  configuredTeamKey: string,
  query: string,
): string {
  const configured = configuredTeamKey.trim();
  if (configured) return configured;

  const term = query.trim();
  const uppercaseKey = /^([A-Z][A-Z0-9]{1,9})$/.exec(term);
  if (uppercaseKey) return uppercaseKey[1] ?? "";

  const dashedKey = /^([A-Z][A-Z0-9]{1,9})-/i.exec(term);
  return dashedKey?.[1]?.toUpperCase() ?? "";
}

export function isBareTeamBrowse(teamKey: string, query: string): boolean {
  const team = teamKey.trim();
  return team.length > 0 && query.trim().toUpperCase() === team.toUpperCase();
}

export function rankTeamBrowseItems(
  items: LinearBrowseItem[],
  usageById: ReadonlyMap<string, LinearMentionUsage>,
  nowMs = Date.now(),
): LinearMentionItem[] {
  return [...items]
    .filter((item) => workflowBucket(item.stateType) < 3)
    .sort((left, right) => {
      const workflowDifference =
        workflowBucket(left.stateType) - workflowBucket(right.stateType);
      if (workflowDifference !== 0) return workflowDifference;

      const priorityDifference =
        priorityRank(left.priority) - priorityRank(right.priority);
      if (priorityDifference !== 0) return priorityDifference;

      const usageDifference =
        recentUsageAt(right.id, usageById, nowMs) -
        recentUsageAt(left.id, usageById, nowMs);
      if (usageDifference !== 0) return usageDifference;

      const updatedDifference = right.updatedAtMs - left.updatedAtMs;
      if (updatedDifference !== 0) return updatedDifference;
      return left.title.localeCompare(right.title);
    })
    .slice(0, SEARCH_LIMIT)
    .map(({ id, title, subtitle }) => ({ id, title, subtitle }));
}

function workflowBucket(stateType: string): number {
  if (stateType === "started") return 0;
  if (stateType === "unstarted" || stateType === "triage") return 1;
  if (stateType === "backlog") return 2;
  return 3;
}

function priorityRank(priority: number): number {
  return priority === 0 ? 5 : priority;
}

function recentUsageAt(
  issueId: string,
  usageById: ReadonlyMap<string, LinearMentionUsage>,
  nowMs: number,
): number {
  const lastSentAtMs = usageById.get(issueId)?.lastSentAtMs ?? 0;
  return nowMs - lastSentAtMs <= RECENT_USAGE_MS ? lastSentAtMs : 0;
}

export class LinearApiError extends Error {
  override readonly name = "LinearApiError";
}

const SEARCH_FIELDS = `
  id
  identifier
  title
  priorityLabel
  state { name type }
  assignee { name }
  team { key }
`;

const SEARCH_QUERY = `
  query SearchLinearIssues($term: String!) {
    searchIssues(term: $term, first: ${SEARCH_LIMIT}, includeArchived: false) {
      nodes { ${SEARCH_FIELDS} }
    }
  }
`;

const SCOPED_SEARCH_QUERY = `
  query SearchLinearIssues($term: String!, $teamKey: String!) {
    searchIssues(
      term: $term
      first: ${SEARCH_LIMIT}
      includeArchived: false
      filter: { team: { key: { eqIgnoreCase: $teamKey } } }
    ) {
      nodes { ${SEARCH_FIELDS} }
    }
  }
`;

const TEAM_BROWSE_QUERY = `
  query BrowseLinearTeamIssues($teamKey: String!) {
    issues(
      first: 100
      includeArchived: false
      orderBy: updatedAt
      filter: {
        team: { key: { eqIgnoreCase: $teamKey } }
        state: { type: { nin: ["completed", "canceled"] } }
      }
    ) {
      nodes {
        ${SEARCH_FIELDS}
        priority
        updatedAt
      }
    }
  }
`;

const ISSUE_QUERY = `
  query LinearIssueContext($id: String!) {
    issue(id: $id) {
      id
      identifier
      title
      description
      url
      priorityLabel
      state { name type }
      team { key name }
      assignee { name }
      project { name }
      labels(first: 50) { nodes { name } }
      parent { identifier title }
      children(first: 25) { nodes { identifier title state { name } } }
      relations(first: 25) {
        nodes { type relatedIssue { identifier title } }
      }
      inverseRelations(first: 25) {
        nodes { type issue { identifier title } }
      }
    }
  }
`;

export function createLinearClient(options: LinearClientOptions) {
  const fetch = options.fetch ?? globalThis.fetch;

  return {
    async search(query: string): Promise<LinearMentionItem[]> {
      const term = query.trim();
      if (term.length < 2) return [];

      const teamKey = options.teamKey.trim();
      const data = await requestGraphql(
        fetch,
        options.apiKey,
        teamKey ? SCOPED_SEARCH_QUERY : SEARCH_QUERY,
        teamKey ? { term, teamKey } : { term },
        SEARCH_TIMEOUT_MS,
      );

      if (!isRecord(data) || !isRecord(data.searchIssues)) {
        throw unexpectedResponse();
      }
      const nodes = data.searchIssues.nodes;
      if (!Array.isArray(nodes)) throw unexpectedResponse();

      return nodes.map(parseSearchResult);
    },

    async browseTeam(teamKey: string): Promise<LinearBrowseItem[]> {
      const team = teamKey.trim();
      if (!team) return [];

      const data = await requestGraphql(
        fetch,
        options.apiKey,
        TEAM_BROWSE_QUERY,
        { teamKey: team },
        SEARCH_TIMEOUT_MS,
      );
      if (!isRecord(data) || !isRecord(data.issues)) {
        throw unexpectedResponse();
      }
      const nodes = data.issues.nodes;
      if (!Array.isArray(nodes)) throw unexpectedResponse();

      return nodes.map(parseBrowseResult);
    },

    async getIssue(id: string): Promise<LinearIssue> {
      const data = await requestGraphql(
        fetch,
        options.apiKey,
        ISSUE_QUERY,
        { id },
        10_000,
      );
      if (!isRecord(data)) throw unexpectedResponse();
      return parseIssue(data.issue);
    },
  };
}

function parseBrowseResult(value: unknown): LinearBrowseItem {
  if (!isRecord(value)) throw unexpectedResponse();
  const item = parseSearchResult(value);
  const stateType = requiredNestedString(value.state, "type");
  const priority = requiredNumber(value.priority);
  const updatedAtMs = Date.parse(requiredString(value.updatedAt));
  if (!Number.isFinite(updatedAtMs)) throw unexpectedResponse();

  return { ...item, stateType, priority, updatedAtMs };
}

async function requestGraphql(
  fetch: Fetch,
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new LinearApiError("Linear API request timed out");
    }
    throw new LinearApiError("Could not reach the Linear API");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LinearApiError(`Linear API returned HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new LinearApiError(
      `Linear API request failed (HTTP ${response.status})`,
    );
  }
  if (
    !isRecord(payload) ||
    (Array.isArray(payload.errors) && payload.errors.length > 0)
  ) {
    throw new LinearApiError("Linear API request failed");
  }

  return payload.data;
}

function parseSearchResult(value: unknown): LinearMentionItem {
  if (!isRecord(value)) throw unexpectedResponse();
  const id = requiredString(value.id);
  const identifier = requiredString(value.identifier);
  const title = requiredString(value.title);
  const priority = requiredString(value.priorityLabel);
  const state = requiredNestedString(value.state, "name");
  const stateType = requiredNestedString(value.state, "type");
  const assignee = optionalNestedString(value.assignee, "name");

  return {
    id,
    title: `${identifier} ${title}`,
    subtitle: [
      `${statusGlyph(stateType)} ${state}`,
      `${priorityGlyph(priority)} ${priority}`,
      assignee,
    ]
      .filter(isPresent)
      .join(" · "),
  };
}

function statusGlyph(type: string): string {
  if (type === "triage") return "◇";
  if (type === "backlog") return "◌";
  if (type === "unstarted") return "○";
  if (type === "started") return "◐";
  if (type === "completed") return "●";
  if (type === "canceled") return "⊘";
  return "○";
}

function priorityGlyph(priority: string): string {
  const normalized = priority.trim().toLowerCase();
  if (normalized === "urgent") return "◆";
  if (normalized === "high") return "▲";
  if (normalized === "medium") return "■";
  if (normalized === "low") return "▽";
  return "·";
}

function parseIssue(value: unknown): LinearIssue {
  if (!isRecord(value)) throw unexpectedResponse();

  return {
    id: requiredString(value.id),
    identifier: requiredString(value.identifier),
    title: requiredString(value.title),
    description: optionalString(value.description),
    url: requiredString(value.url),
    priorityLabel: requiredString(value.priorityLabel),
    state: parseState(value.state),
    team: parseTeam(value.team),
    assignee: parseOptionalNamedValue(value.assignee),
    project: parseOptionalNamedValue(value.project),
    labels: { nodes: parseNamedConnection(value.labels) },
    parent: parseOptionalReference(value.parent),
    children: { nodes: parseChildren(value.children) },
    relations: { nodes: parseRelations(value.relations, "relatedIssue") },
    inverseRelations: {
      nodes: parseRelations(value.inverseRelations, "issue"),
    },
  };
}

export function formatIssueContext(issue: LinearIssue): string {
  const labels =
    issue.labels.nodes.map((label) => label.name).join(", ") || "None";
  const lines = [
    `# Linear issue ${issue.identifier}: ${issue.title}`,
    "",
    `- Status: ${issue.state.name} (${issue.state.type})`,
    `- Priority: ${issue.priorityLabel}`,
    `- Team: ${issue.team.name} (${issue.team.key})`,
    `- Assignee: ${issue.assignee?.name ?? "Unassigned"}`,
    `- Project: ${issue.project?.name ?? "None"}`,
    `- Labels: ${labels}`,
    `- URL: ${issue.url}`,
  ];

  if (issue.parent) {
    lines.push(`- Parent: ${formatReference(issue.parent)}`);
  }
  if (issue.children.nodes.length > 0) {
    lines.push(
      `- Sub-issues: ${issue.children.nodes
        .map((child) => `${formatReference(child)} [${child.state.name}]`)
        .join("; ")}`,
    );
  }

  const relations = formatRelations(issue);
  if (relations.length > 0) lines.push(`- Relations: ${relations.join("; ")}`);

  const description = truncateDescription(
    issue.description?.trim() || "No description provided.",
  );
  lines.push(
    "",
    "## Description",
    "",
    description,
    "",
    "Use this issue as project intent and context. Verify live repository state before changing code, and keep the issue current if implementation diverges.",
  );

  return lines.join("\n");
}

function formatRelations(issue: LinearIssue): string[] {
  const outgoing = issue.relations.nodes.flatMap((relation) => {
    if (!relation.relatedIssue) return [];
    return [
      `${outgoingRelationLabel(relation.type)} ${formatReference(relation.relatedIssue)}`,
    ];
  });
  const incoming = issue.inverseRelations.nodes.flatMap((relation) => {
    if (!relation.issue) return [];
    return [
      `${incomingRelationLabel(relation.type)} ${formatReference(relation.issue)}`,
    ];
  });
  return [...outgoing, ...incoming];
}

function outgoingRelationLabel(type: string): string {
  if (type === "blocks") return "blocks";
  if (type === "duplicate") return "duplicate of";
  if (type === "similar") return "similar to";
  return "related to";
}

function incomingRelationLabel(type: string): string {
  if (type === "blocks") return "blocked by";
  if (type === "duplicate") return "duplicated by";
  if (type === "similar") return "similar to";
  return "related to";
}

function truncateDescription(description: string): string {
  if (description.length <= DESCRIPTION_LIMIT) return description;
  return `${description.slice(0, DESCRIPTION_LIMIT)}\n\n[Description truncated by bb-plugin-linear]`;
}

function formatReference(reference: IssueReference): string {
  return `${reference.identifier} ${reference.title}`;
}

function parseState(value: unknown): LinearIssue["state"] {
  if (!isRecord(value)) throw unexpectedResponse();
  return { name: requiredString(value.name), type: requiredString(value.type) };
}

function parseTeam(value: unknown): LinearIssue["team"] {
  if (!isRecord(value)) throw unexpectedResponse();
  return { key: requiredString(value.key), name: requiredString(value.name) };
}

function parseOptionalNamedValue(value: unknown): NamedValue | null {
  if (value === null) return null;
  if (!isRecord(value)) throw unexpectedResponse();
  return { name: requiredString(value.name) };
}

function parseNamedConnection(value: unknown): NamedValue[] {
  const nodes = connectionNodes(value);
  return nodes.map((node) => {
    if (!isRecord(node)) throw unexpectedResponse();
    return { name: requiredString(node.name) };
  });
}

function parseOptionalReference(value: unknown): IssueReference | null {
  if (value === null) return null;
  return parseReference(value);
}

function parseReference(value: unknown): IssueReference {
  if (!isRecord(value)) throw unexpectedResponse();
  return {
    identifier: requiredString(value.identifier),
    title: requiredString(value.title),
  };
}

function parseChildren(value: unknown): LinearIssue["children"]["nodes"] {
  return connectionNodes(value).map((node) => {
    if (!isRecord(node)) throw unexpectedResponse();
    return {
      ...parseReference(node),
      state: { name: requiredNestedString(node.state, "name") },
    };
  });
}

function parseRelations(
  value: unknown,
  direction: "issue" | "relatedIssue",
): IssueRelation[] {
  return connectionNodes(value).map((node) => {
    if (!isRecord(node)) throw unexpectedResponse();
    const reference = parseReference(node[direction]);
    return direction === "issue"
      ? { type: requiredString(node.type), issue: reference }
      : { type: requiredString(node.type), relatedIssue: reference };
  });
}

function connectionNodes(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.nodes))
    throw unexpectedResponse();
  return value.nodes;
}

function requiredNestedString(value: unknown, key: string): string {
  if (!isRecord(value)) throw unexpectedResponse();
  return requiredString(value[key]);
}

function optionalNestedString(value: unknown, key: string): string | null {
  if (value === null) return null;
  return requiredNestedString(value, key);
}

function requiredString(value: unknown): string {
  if (typeof value !== "string") throw unexpectedResponse();
  return value;
}

function requiredNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw unexpectedResponse();
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === null) return null;
  return requiredString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresent(value: string | null): value is string {
  return value !== null && value.length > 0;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

function unexpectedResponse(): LinearApiError {
  return new LinearApiError("Linear returned an unexpected response");
}
