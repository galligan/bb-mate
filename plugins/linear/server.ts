import type { BbPluginApi } from "@bb/plugin-sdk";

import {
  createLinearClient,
  formatIssueContext,
  isBareTeamBrowse,
  rankTeamBrowseItems,
  resolveSearchTeamKey,
  type LinearMentionItem,
} from "./linear";
import { MENTION_USAGE_MIGRATIONS, MentionUsageStore } from "./mention-usage";
import { SearchCache, searchCacheKey } from "./search-cache";

const CONFIGURE_MESSAGE =
  "Add a Linear personal API key in the plugin's Settings page.";
const SEARCH_CACHE_FRESH_MS = 60_000;
const SEARCH_CACHE_STALE_MS = 600_000;
const SEARCH_CACHE_MAX_ENTRIES = 100;

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    apiKey: {
      type: "string",
      label: "Linear personal API key",
      secret: true,
    },
    teamKey: {
      type: "string",
      label: "Team key (optional)",
      description: "Restrict mention search to one Linear team, such as PAT.",
      default: "",
    },
  });
  const searchCache = new SearchCache<LinearMentionItem[]>({
    freshForMs: SEARCH_CACHE_FRESH_MS,
    staleForMs: SEARCH_CACHE_STALE_MS,
    maxEntries: SEARCH_CACHE_MAX_ENTRIES,
  });
  const database = bb.storage.database();
  bb.storage.migrate(database, MENTION_USAGE_MIGRATIONS);
  const mentionUsage = new MentionUsageStore(database);
  settings.onChange((next, previous) => {
    if (next.apiKey !== previous.apiKey || next.teamKey !== previous.teamKey) {
      searchCache.clear();
      bb.log.info("Linear mention search cache cleared after settings change");
    }
  });

  const initial = await settings.get();
  if (!initial.apiKey) bb.status.needsConfiguration(CONFIGURE_MESSAGE);

  bb.ui.registerMentionProvider({
    id: "linear-issue",
    label: "Linear issues",
    triggers: ["#"],
    async search({ query }) {
      const { apiKey, teamKey } = await settings.get();
      if (!apiKey) return [];
      const searchTeamKey = resolveSearchTeamKey(teamKey, query);
      const browseTeam = isBareTeamBrowse(searchTeamKey, query);

      try {
        const result = await searchCache.get(
          searchCacheKey(searchTeamKey, query),
          async () => {
            const client = createLinearClient({
              apiKey,
              teamKey: searchTeamKey,
            });
            if (!browseTeam) return client.search(query);

            const items = await client.browseTeam(searchTeamKey);
            const usage = mentionUsage.get(items.map((item) => item.id));
            return rankTeamBrowseItems(items, usage);
          },
        );
        if (result.source === "stale-cache") {
          const message =
            result.error instanceof Error
              ? result.error.message
              : "Unknown error";
          bb.log.warn(
            `Linear mention search refresh failed; using cached results: ${message}`,
          );
        }
        return result.value;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        bb.log.warn(`Linear mention search failed: ${message}`);
        return [];
      }
    },
    async resolve(itemId) {
      const { apiKey, teamKey } = await settings.get();
      if (!apiKey) throw new Error(CONFIGURE_MESSAGE);

      const issue = await createLinearClient({ apiKey, teamKey }).getIssue(
        itemId,
      );
      mentionUsage.recordSent(issue.id);
      searchCache.clear();
      return { context: formatIssueContext(issue) };
    },
  });

  bb.log.info("Linear issue mentions registered on #");
}
