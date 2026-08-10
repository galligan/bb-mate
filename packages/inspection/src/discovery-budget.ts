export interface DiscoveryRootBudget {
  maxVisitedEntries: number;
  readonly maxCandidates: number;
  visitedEntries: number;
  acceptedCandidates: number;
}

/**
 * Partition each global bound across admitted roots so an earlier noisy root
 * cannot consume the share needed to inspect an independent later root.
 * Unused shares stay unused; borrowing would make the result order-dependent.
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
