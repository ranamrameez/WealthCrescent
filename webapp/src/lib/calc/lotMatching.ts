export type LotMatchOrder = 'fifo' | 'lowestCostFirst';

export interface LotConsumption<T> {
  lot: T;
  take: number;
}

/** Consumes only currently-open lots. Fully consumed lots are removed immediately,
 * so a later position lifecycle can never draw from a previously closed lot. */
export function consumeLotsForSell<T extends { remainingShares: number; buyPrice: number; buyId?: string }>(
  lots: T[],
  shares: number,
  matchOrder: LotMatchOrder,
  lotAllocations?: { buyId: string; shares: number }[],
  targetLotBuyId?: string,
): LotConsumption<T>[] {
  const out: LotConsumption<T>[] = [];
  let toSell = shares;

  const takeFrom = (idx: number, want: number) => {
    if (idx < 0 || want <= 1e-7) return;
    const lot = lots[idx];
    const take = Math.min(want, lot.remainingShares);
    if (take <= 1e-7) return;
    lot.remainingShares -= take;
    toSell -= take;
    out.push({ lot, take });
    if (lot.remainingShares <= 1e-7) lots.splice(idx, 1);
  };

  for (const allocation of lotAllocations ?? []) {
    if (toSell <= 1e-7) break;
    takeFrom(lots.findIndex(lot => lot.buyId === allocation.buyId), Math.min(allocation.shares, toSell));
  }
  if (toSell > 1e-7 && targetLotBuyId) {
    takeFrom(lots.findIndex(lot => lot.buyId === targetLotBuyId), toSell);
  }
  while (toSell > 1e-7 && lots.length) {
    const idx = matchOrder === 'fifo'
      ? 0
      : lots.reduce((best, lot, index) => lot.buyPrice < lots[best].buyPrice ? index : best, 0);
    const before = toSell;
    takeFrom(idx, toSell);
    if (Math.abs(before - toSell) < 1e-7) break;
  }
  return out;
}
