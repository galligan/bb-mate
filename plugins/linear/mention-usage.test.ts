import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";

import { MENTION_USAGE_MIGRATIONS, MentionUsageStore } from "./mention-usage";

let database: Database.Database | undefined;

afterEach(() => database?.close());

describe("MentionUsageStore", () => {
  test("records sent mentions and returns their count and latest use", () => {
    database = new Database(":memory:");
    database.exec(MENTION_USAGE_MIGRATIONS[0] ?? "");
    const usage = new MentionUsageStore(database);

    usage.recordSent("issue-1", 100);
    usage.recordSent("issue-1", 200);
    usage.recordSent("issue-2", 150);

    expect(usage.get(["issue-1", "issue-2", "missing"])).toEqual(
      new Map([
        ["issue-1", { sentCount: 2, lastSentAtMs: 200 }],
        ["issue-2", { sentCount: 1, lastSentAtMs: 150 }],
      ]),
    );
  });
});
