export type SearchCacheResult<T> =
  | { value: T; source: "network" | "fresh-cache" }
  | { value: T; source: "stale-cache"; error: unknown };

interface SearchCacheEntry<T> {
  value: T;
  storedAt: number;
}

interface SearchCacheOptions {
  freshForMs: number;
  staleForMs: number;
  maxEntries: number;
  now?: () => number;
}

export class SearchCache<T> {
  private readonly entries = new Map<string, SearchCacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<SearchCacheResult<T>>>();
  private readonly now: () => number;
  private generation = 0;

  constructor(private readonly options: SearchCacheOptions) {
    this.now = options.now ?? Date.now;
  }

  async get(
    key: string,
    load: () => Promise<T>,
  ): Promise<SearchCacheResult<T>> {
    const cached = this.entries.get(key);
    if (cached && this.now() - cached.storedAt <= this.options.freshForMs) {
      return { value: cached.value, source: "fresh-cache" };
    }

    const active = this.inFlight.get(key);
    if (active) return active;

    const generation = this.generation;
    const pending = this.load(key, cached, generation, load);
    this.inFlight.set(key, pending);

    try {
      return await pending;
    } finally {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    }
  }

  clear(): void {
    this.generation += 1;
    this.entries.clear();
    this.inFlight.clear();
  }

  private async load(
    key: string,
    cached: SearchCacheEntry<T> | undefined,
    generation: number,
    load: () => Promise<T>,
  ): Promise<SearchCacheResult<T>> {
    try {
      const value = await load();
      if (generation === this.generation) this.store(key, value);
      return { value, source: "network" };
    } catch (error) {
      if (cached && this.now() - cached.storedAt <= this.options.staleForMs) {
        return { value: cached.value, source: "stale-cache", error };
      }
      throw error;
    }
  }

  private store(key: string, value: T): void {
    if (
      !this.entries.has(key) &&
      this.entries.size >= this.options.maxEntries
    ) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, storedAt: this.now() });
  }
}

export function searchCacheKey(teamKey: string, query: string): string {
  return `${teamKey.trim().toLowerCase()}\0${query.trim().toLowerCase()}`;
}
