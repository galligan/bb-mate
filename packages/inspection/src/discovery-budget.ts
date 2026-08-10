export interface DiscoveryRootBudget {
  maxVisitedEntries: number;
  readonly maxCandidates: number;
  visitedEntries: number;
  acceptedCandidates: number;
}

/**
 * Reserve a deterministic first-pass share for every admitted root so an
 * earlier noisy root cannot starve a later root. The scan coordinator may
 * redistribute unused capacity only after every root receives that share.
 */
export function allocateDiscoveryRootBudgets(
  rootCount: number,
  maxVisitedEntries: number,
  maxCandidates: number,
): DiscoveryRootBudget[] {
  const entryShares = allocateFairShares(maxVisitedEntries, rootCount);
  const candidateShares = allocateFairShares(maxCandidates, rootCount);
  return entryShares.map((maxEntries, index) => ({
    maxVisitedEntries: maxEntries,
    maxCandidates: candidateShares[index] ?? 0,
    visitedEntries: 0,
    acceptedCandidates: 0,
  }));
}

export function allocateFairShares(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}
