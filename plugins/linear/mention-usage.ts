import type Database from "better-sqlite3";

import type { LinearMentionUsage } from "./linear";

export const MENTION_USAGE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS mention_usage (
    issue_id TEXT PRIMARY KEY,
    sent_count INTEGER NOT NULL DEFAULT 0,
    last_sent_at_ms INTEGER NOT NULL
  )`,
];

interface MentionUsageRow {
  issue_id: string;
  sent_count: number;
  last_sent_at_ms: number;
}

export class MentionUsageStore {
  constructor(private readonly database: Database.Database) {}

  recordSent(issueId: string, sentAtMs = Date.now()): void {
    this.database
      .prepare(
        `INSERT INTO mention_usage (issue_id, sent_count, last_sent_at_ms)
         VALUES (?, 1, ?)
         ON CONFLICT(issue_id) DO UPDATE SET
           sent_count = mention_usage.sent_count + 1,
           last_sent_at_ms = excluded.last_sent_at_ms`,
      )
      .run(issueId, sentAtMs);
  }

  get(issueIds: string[]): Map<string, LinearMentionUsage> {
    if (issueIds.length === 0) return new Map();
    const placeholders = issueIds.map(() => "?").join(", ");
    const rows = this.database
      .prepare<unknown[], MentionUsageRow>(
        `SELECT issue_id, sent_count, last_sent_at_ms
         FROM mention_usage
         WHERE issue_id IN (${placeholders})`,
      )
      .all(...issueIds);

    return new Map(
      rows.map((row) => [
        row.issue_id,
        { sentCount: row.sent_count, lastSentAtMs: row.last_sent_at_ms },
      ]),
    );
  }
}
