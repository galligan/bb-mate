import { describe, expect, test } from "vitest";

import {
  LinearApiError,
  createLinearClient,
  formatIssueContext,
  isBareTeamBrowse,
  rankTeamBrowseItems,
  resolveSearchTeamKey,
  type LinearBrowseItem,
  type LinearIssue,
} from "./linear";

const issue: LinearIssue = {
  id: "issue-80",
  identifier: "PAT-80",
  title: "Build bb Linear issue mention plugin",
  description: "## Goal\n\nPut Linear issues in the prompt box.",
  url: "https://linear.app/outfitter/issue/PAT-80/example",
  priorityLabel: "Medium",
  state: { name: "In Progress", type: "started" },
  team: { key: "PAT", name: "Patch" },
  assignee: { name: "Patch" },
  project: { name: "PatchOS" },
  labels: { nodes: [{ name: "feature" }, { name: "tooling" }] },
  parent: { identifier: "PAT-79", title: "Composer integrations" },
  children: {
    nodes: [
      {
        identifier: "PAT-81",
        title: "Add OAuth",
        state: { name: "Backlog" },
      },
    ],
  },
  relations: {
    nodes: [
      {
        type: "blocks",
        relatedIssue: { identifier: "PAT-82", title: "Ship plugin" },
      },
    ],
  },
  inverseRelations: {
    nodes: [
      {
        type: "blocks",
        issue: { identifier: "PAT-78", title: "Confirm API shape" },
      },
    ],
  },
};

describe("resolveSearchTeamKey", () => {
  test("keeps an explicitly configured team authoritative", () => {
    expect(resolveSearchTeamKey("NUM", "PAT-80")).toBe("NUM");
  });

  test("infers an exact uppercase team key", () => {
    expect(resolveSearchTeamKey("", "PAT")).toBe("PAT");
  });

  test("infers dashed team prefixes case-insensitively", () => {
    expect(resolveSearchTeamKey("", "pat-")).toBe("PAT");
    expect(resolveSearchTeamKey("", "Pat-80")).toBe("PAT");
  });

  test("leaves ordinary lowercase text unscoped", () => {
    expect(resolveSearchTeamKey("", "pat")).toBe("");
    expect(resolveSearchTeamKey("", "patch")).toBe("");
  });
});

describe("isBareTeamBrowse", () => {
  test("only browses when the query is the effective team key", () => {
    expect(isBareTeamBrowse("PAT", "PAT")).toBe(true);
    expect(isBareTeamBrowse("pat", "PAT")).toBe(true);
    expect(isBareTeamBrowse("PAT", "pat-")).toBe(false);
    expect(isBareTeamBrowse("PAT", "PAT-80")).toBe(false);
    expect(isBareTeamBrowse("NUM", "PAT")).toBe(false);
  });
});

describe("rankTeamBrowseItems", () => {
  test("orders active work by status, priority, recent use, and update time", () => {
    const now = Date.parse("2026-08-06T18:00:00.000Z");
    const items: LinearBrowseItem[] = [
      browseItem("PAT-1", "started", 3, now - 1_000),
      browseItem("PAT-2", "started", 2, now - 2_000),
      browseItem("PAT-3", "started", 2, now - 3_000),
      browseItem("PAT-4", "unstarted", 1, now),
      browseItem("PAT-5", "triage", 1, now),
      browseItem("PAT-6", "backlog", 1, now),
      browseItem("PAT-7", "completed", 1, now),
    ];
    const usage = new Map([
      ["issue-PAT-3", { sentCount: 1, lastSentAtMs: now - 60_000 }],
    ]);

    expect(
      rankTeamBrowseItems(items, usage, now).map((item) => item.title),
    ).toEqual([
      "PAT-3 Issue PAT-3",
      "PAT-2 Issue PAT-2",
      "PAT-1 Issue PAT-1",
      "PAT-4 Issue PAT-4",
      "PAT-5 Issue PAT-5",
      "PAT-6 Issue PAT-6",
    ]);
  });
});

describe("createLinearClient", () => {
  test("searches current Linear issues with a case-insensitive team filter", async () => {
    const requests: unknown[] = [];
    const client = createLinearClient({
      apiKey: "lin_api_secret",
      teamKey: "pat",
      fetch: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({
          data: {
            searchIssues: {
              nodes: [
                {
                  id: "issue-80",
                  identifier: "PAT-80",
                  title: issue.title,
                  priorityLabel: "Medium",
                  state: { name: "In Progress", type: "started" },
                  assignee: { name: "Patch" },
                  team: { key: "PAT" },
                },
              ],
            },
          },
        });
      },
    });

    await expect(client.search("linear prompt")).resolves.toEqual([
      {
        id: "issue-80",
        title: "PAT-80 Build bb Linear issue mention plugin",
        subtitle: "◐ In Progress · ■ Medium · Patch",
      },
    ]);
    expect(requests).toHaveLength(1);
    const request = expectRecord(requests[0]);
    expect(typeof request.query).toBe("string");
    if (typeof request.query !== "string")
      throw new Error("Expected query text");
    expect(request.query).toContain("searchIssues");
    expect(request.query).toContain("eqIgnoreCase: $teamKey");
    expect(request.variables).toEqual({
      term: "linear prompt",
      teamKey: "pat",
    });
  });

  test("returns no rows for a too-short mention query without calling Linear", async () => {
    let called = false;
    const client = createLinearClient({
      apiKey: "lin_api_secret",
      teamKey: "",
      fetch: async () => {
        called = true;
        return Response.json({});
      },
    });

    await expect(client.search(" p ")).resolves.toEqual([]);
    expect(called).toBe(false);
  });

  test("browses non-terminal team issues ordered from Linear by recent update", async () => {
    const requests: unknown[] = [];
    const client = createLinearClient({
      apiKey: "lin_api_secret",
      teamKey: "",
      fetch: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({
          data: {
            issues: {
              nodes: [
                {
                  id: "issue-80",
                  identifier: "PAT-80",
                  title: issue.title,
                  priority: 3,
                  priorityLabel: "Medium",
                  updatedAt: "2026-08-06T18:00:00.000Z",
                  state: { name: "In Progress", type: "started" },
                  assignee: null,
                  team: { key: "PAT" },
                },
              ],
            },
          },
        });
      },
    });

    await expect(client.browseTeam("PAT")).resolves.toEqual([
      {
        id: "issue-80",
        title: "PAT-80 Build bb Linear issue mention plugin",
        subtitle: "◐ In Progress · ■ Medium",
        stateType: "started",
        priority: 3,
        updatedAtMs: Date.parse("2026-08-06T18:00:00.000Z"),
      },
    ]);
    const request = expectRecord(requests[0]);
    expect(request.variables).toEqual({ teamKey: "PAT" });
    expect(request.query).toContain("issues(");
    expect(request.query).toContain("orderBy: updatedAt");
    expect(request.query).toContain('nin: ["completed", "canceled"]');
  });

  test("formats scannable status and priority glyphs", async () => {
    const client = createLinearClient({
      apiKey: "lin_api_secret",
      teamKey: "",
      fetch: async () =>
        Response.json({
          data: {
            searchIssues: {
              nodes: [
                searchNode("PAT-1", "Triage", "triage", "Urgent"),
                searchNode("PAT-2", "Backlog", "backlog", "High"),
                searchNode("PAT-3", "Todo", "unstarted", "Medium"),
                searchNode("PAT-4", "In Progress", "started", "Low"),
                searchNode("PAT-5", "Done", "completed", "No priority"),
                searchNode("PAT-6", "Canceled", "canceled", "No priority"),
              ],
            },
          },
        }),
    });

    const results = await client.search("PAT");
    expect(results.map((result) => result.subtitle)).toEqual([
      "◇ Triage · ◆ Urgent",
      "◌ Backlog · ▲ High",
      "○ Todo · ■ Medium",
      "◐ In Progress · ▽ Low",
      "● Done · · No priority",
      "⊘ Canceled · · No priority",
    ]);
  });

  test("fetches and parses fresh issue context by opaque issue id", async () => {
    const client = createLinearClient({
      apiKey: "lin_api_secret",
      teamKey: "",
      fetch: async (_input, init) => {
        const body: unknown = JSON.parse(String(init?.body));
        const request = expectRecord(body);
        expect(request.variables).toEqual({ id: "issue-80" });
        return Response.json({ data: { issue } });
      },
    });

    await expect(client.getIssue("issue-80")).resolves.toEqual(issue);
  });

  test("reports safe GraphQL failures without echoing credentials", async () => {
    const client = createLinearClient({
      apiKey: "lin_api_secret",
      teamKey: "",
      fetch: async () =>
        Response.json({
          errors: [{ message: "Not authorized with lin_api_secret" }],
        }),
    });

    const error = await client
      .search("PAT-80")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LinearApiError);
    expect(String(error)).toBe("LinearApiError: Linear API request failed");
    expect(String(error)).not.toContain("lin_api_secret");
  });

  test("rejects malformed successful responses", async () => {
    const client = createLinearClient({
      apiKey: "lin_api_secret",
      teamKey: "",
      fetch: async () =>
        Response.json({ data: { searchIssues: { nodes: [{}] } } }),
    });

    await expect(client.search("PAT-80")).rejects.toThrow(
      "Linear returned an unexpected response",
    );
  });
});

function expectRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  throw new Error("Expected a record");
}

function searchNode(
  identifier: string,
  stateName: string,
  stateType: string,
  priorityLabel: string,
) {
  return {
    id: `issue-${identifier}`,
    identifier,
    title: `Issue ${identifier}`,
    priorityLabel,
    state: { name: stateName, type: stateType },
    assignee: null,
    team: { key: "PAT" },
  };
}

function browseItem(
  identifier: string,
  stateType: string,
  priority: number,
  updatedAtMs: number,
): LinearBrowseItem {
  return {
    id: `issue-${identifier}`,
    title: `${identifier} Issue ${identifier}`,
    subtitle: "status",
    stateType,
    priority,
    updatedAtMs,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("formatIssueContext", () => {
  test("produces a bounded agent-ready issue packet", () => {
    expect(formatIssueContext(issue))
      .toBe(`# Linear issue PAT-80: Build bb Linear issue mention plugin

- Status: In Progress (started)
- Priority: Medium
- Team: Patch (PAT)
- Assignee: Patch
- Project: PatchOS
- Labels: feature, tooling
- URL: https://linear.app/outfitter/issue/PAT-80/example
- Parent: PAT-79 Composer integrations
- Sub-issues: PAT-81 Add OAuth [Backlog]
- Relations: blocks PAT-82 Ship plugin; blocked by PAT-78 Confirm API shape

## Description

## Goal

Put Linear issues in the prompt box.

Use this issue as project intent and context. Verify live repository state before changing code, and keep the issue current if implementation diverges.`);
  });

  test("truncates oversized descriptions", () => {
    const context = formatIssueContext({
      ...issue,
      description: "x".repeat(30_000),
    });

    expect(context.length).toBeLessThan(26_000);
    expect(context).toContain("[Description truncated by bb-plugin-linear]");
  });
});
