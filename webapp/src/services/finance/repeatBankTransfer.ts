import type { InterEntityTransfer } from '../../types/interEntityTransfer';

export function suggestRepeatBankTransfer(
  links: readonly InterEntityTransfer[],
  accountId: string,
  activeAccountIds: ReadonlySet<string>,
) {
  const routes = new Map<string, { count: number; latest: InterEntityTransfer }>();
  for (const link of links) {
    const { from, to } = link;
    if (from.module !== 'bank' || to.module !== 'bank' || !from.ref || !to.ref || from.ref === to.ref) continue;
    if (from.ref !== accountId && to.ref !== accountId) continue;
    if (!activeAccountIds.has(from.ref) || !activeAccountIds.has(to.ref)) continue;
    const key = JSON.stringify([from.ref, to.ref]);
    const route = routes.get(key);
    const latest = route && route.latest.date + (route.latest.time ?? '') > link.date + (link.time ?? '') ? route.latest : link;
    routes.set(key, { count: (route?.count ?? 0) + 1, latest });
  }
  const ranked = [...routes.values()].sort((a, b) => b.count - a.count || b.latest.date.localeCompare(a.latest.date));
  const best = ranked[0];
  if (!best || best.count < 2) return undefined;
  if (best.count === ranked[1]?.count && best.latest.date === ranked[1].latest.date) return undefined;
  const direction = best.latest.from.ref === accountId ? 'out' as const : 'in' as const;
  return {
    direction,
    otherAccountId: direction === 'out' ? best.latest.to.ref! : best.latest.from.ref!,
    categoryID: best.latest.categoryID,
    rateSource: best.latest.rateSource,
  };
}
