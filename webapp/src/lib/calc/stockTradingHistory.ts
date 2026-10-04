import type { Transaction } from '../../types/workbook';
import { sortTransactionsChronological } from './sortTransactions';
export interface TradingPoint {
  date: string; label: string; buy: number; sell: number; buyValue: number; sellValue: number;
  bought: number; sold: number; boughtShares: number; soldShares: number;
}
export function stockTradingHistory(transactions: Transaction[]) {
  const trades = sortTransactionsChronological(transactions.filter(tx => !tx.isPending)).sort((a, b) => a.date.localeCompare(b.date));
  const entries: TradingPoint[] = [], byDay = new Map<string, TradingPoint>();
  let bought = 0, sold = 0, boughtShares = 0, soldShares = 0;
  for (const tx of trades) {
    const buy = tx.action === 'BUY' ? tx.shares : 0, sell = tx.action === 'SELL' ? tx.shares : 0;
    const buyValue = buy * tx.price, sellValue = sell * tx.price;
    bought += buyValue; sold += sellValue; boughtShares += buy; soldShares += sell;
    const point = { date: tx.date, label: `${tx.date} ${tx.time ?? ''} ${tx.ticker} ${tx.action} #${entries.length + 1}`.trim(), buy, sell, buyValue, sellValue, bought, sold, boughtShares, soldShares };
    entries.push(point);
    const previous = byDay.get(tx.date);
    byDay.set(tx.date, { ...point, label: tx.date, buy: (previous?.buy ?? 0) + buy, sell: (previous?.sell ?? 0) + sell,
      buyValue: (previous?.buyValue ?? 0) + buyValue, sellValue: (previous?.sellValue ?? 0) + sellValue });
  }
  return { daily: [...byDay.values()], entries };
}
