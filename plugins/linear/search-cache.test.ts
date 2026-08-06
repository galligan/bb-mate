import { describe, expect, test } from "vitest";

import { SearchCache, searchCacheKey } from "./search-cache";

describe("SearchCache", () => {
  test("normalizes query and team scope and reuses fresh results", async () => {
    let loads = 0;
    const cache = new SearchCache<string[]>({
      freshForMs: 60_000,
      staleForMs: 600_000,
      maxEntries: 100,
      now: () => 1_000,
    });
    const key = searchCacheKey(" PAT ", "  Linear Mentions ");
    const load = async () => {
      loads += 1;
      return ["PAT-80"];
    };

    await expect(cache.get(key, load)).resolves.toEqual({
      value: ["PAT-80"],
      source: "network",
    });
    await expect(
      cache.get(searchCacheKey("pat", "linear mentions"), load),
    ).resolves.toEqual({ value: ["PAT-80"], source: "fresh-cache" });
    expect(loads).toBe(1);
  });

  test("coalesces identical in-flight searches", async () => {
    let resolveLoad: ((value: string[]) => void) | undefined;
    let loads = 0;
    const cache = new SearchCache<string[]>({
      freshForMs: 60_000,
      staleForMs: 600_000,
      maxEntries: 100,
      now: () => 1_000,
    });
    const load = () => {
      loads += 1;
      return new Promise<string[]>((resolve) => {
        resolveLoad = resolve;
      });
    };

    const first = cache.get("pat\0memory", load);
    const second = cache.get("pat\0memory", load);
    resolveLoad?.(["PAT-72"]);

    await expect(first).resolves.toEqual({
      value: ["PAT-72"],
      source: "network",
    });
    await expect(second).resolves.toEqual({
      value: ["PAT-72"],
      source: "network",
    });
    expect(loads).toBe(1);
  });

  test("falls back to stale results when refresh fails", async () => {
    let now = 1_000;
    const cache = new SearchCache<string[]>({
      freshForMs: 60_000,
      staleForMs: 600_000,
      maxEntries: 100,
      now: () => now,
    });

    await cache.get("pat\0linear", async () => ["PAT-80"]);
    now += 60_001;

    const result = await cache.get("pat\0linear", async () => {
      throw new Error("timed out");
    });

    expect(result).toMatchObject({
      value: ["PAT-80"],
      source: "stale-cache",
    });
    if (result.source !== "stale-cache") {
      throw new Error("Expected a stale cache result");
    }
    expect(result.error).toEqual(new Error("timed out"));
  });

  test("does not hide failures after stale results expire", async () => {
    let now = 1_000;
    const cache = new SearchCache<string[]>({
      freshForMs: 60_000,
      staleForMs: 600_000,
      maxEntries: 100,
      now: () => now,
    });

    await cache.get("pat\0linear", async () => ["PAT-80"]);
    now += 600_001;

    await expect(
      cache.get("pat\0linear", async () => {
        throw new Error("timed out");
      }),
    ).rejects.toThrow("timed out");
  });

  test("evicts the oldest result when the cache reaches its bound", async () => {
    let now = 1_000;
    const cache = new SearchCache<string[]>({
      freshForMs: 60_000,
      staleForMs: 600_000,
      maxEntries: 2,
      now: () => now,
    });

    await cache.get("one", async () => ["one"]);
    now += 1;
    await cache.get("two", async () => ["two"]);
    now += 1;
    await cache.get("three", async () => ["three"]);

    let loads = 0;
    await cache.get("one", async () => {
      loads += 1;
      return ["one-again"];
    });
    expect(loads).toBe(1);
  });
});
