import type { Adjustment, CashLedgerEvent, FeeCalculator, Transaction, Transfer } from '../../types/workbook';
import { fmt } from '../format';
import { toInstantMs } from '../datetime';
import { sortTransactionsChronological } from './sortTransactions';

/** Merges completed trades, transfers and adjustments into one chronological
 * cash ledger. An executed SELL is always a real cash event, even if the
 * stock engine flags some shares as unmatched; only matched shares receive
 * cost basis and realized P/L. Pending orders remain excluded. */
export function buildCashLedger(
  transactions: Transaction[],
  transfers: Transfer[],
  adjustments: Adjustment[],
  calcFee: FeeCalculator,
): CashLedgerEvent[] {
  const events: Omit<CashLedgerEvent, 'balance'>[] = [];

  sortTransactionsChronological(transactions.filter((tx) => !tx.isPending)).forEach((tx) => {
    const isBuy = tx.action === 'BUY';
    const amount = tx.shares * tx.price;
    const fee = calcFee(amount, isBuy, { shares: tx.shares, tx });
    const cashDelta = isBuy ? -(amount + fee) : amount - fee;
    events.push({ sourceId: tx.id, ticker: tx.ticker, date: tx.date, time: tx.time, timezone: tx.timezone, seq: tx.perTickerIndex ?? tx.seq, accountingOrder: tx.accountingOrder, globalTransactionIndex: tx.globalTransactionIndex ?? tx.transactionIndex, perTickerIndex: tx.perTickerIndex ?? tx.seq, transactionIndex: tx.globalTransactionIndex ?? tx.transactionIndex, kind: 'trade', action: tx.action, label: `${tx.action} ${fmt(tx.shares, 0)} ${tx.ticker} @ ${fmt(tx.price, 3)}`, amount: cashDelta, fee });
  });

  transfers.forEach((t) => {
    const cashDelta = t.type === 'DEPOSIT' ? t.gross - t.fee : -(t.gross + t.fee);
    events.push({ sourceId: t.id, date: t.date, time: t.time, timezone: t.timezone, seq: t.seq, accountingOrder: t.accountingOrder, kind: 'transfer', action: t.type, label: t.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal', amount: cashDelta, fee: t.fee });
  });

  (adjustments || []).forEach((a) => {
    events.push({ sourceId: a.id, date: a.date, time: a.time, timezone: a.timezone, seq: a.seq, accountingOrder: a.accountingOrder, kind: 'adjustment', action: a.amount >= 0 ? 'REWARD' : 'CORRECTION', label: a.note || (a.amount >= 0 ? 'Trading reward' : 'Adjustment'), amount: a.amount, fee: 0 });
  });

  events.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate) return byDate;
    const aHasOrder = Number.isInteger(a.accountingOrder);
    const bHasOrder = Number.isInteger(b.accountingOrder);
    if (aHasOrder && bHasOrder && a.accountingOrder !== b.accountingOrder) return a.accountingOrder! - b.accountingOrder!;
    if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
    const byInstant = toInstantMs(a.date, a.time, a.timezone) - toInstantMs(b.date, b.time, b.timezone);
    if (byInstant !== 0) return byInstant;
    if (a.kind === 'trade' && b.kind === 'trade' && a.globalTransactionIndex !== undefined && b.globalTransactionIndex !== undefined) return a.globalTransactionIndex - b.globalTransactionIndex;
    const byKind = (a.kind === 'transfer' ? -1 : 1) - (b.kind === 'transfer' ? -1 : 1);
    if (byKind !== 0) return byKind;
    return (a.seq ?? 0) - (b.seq ?? 0);
  });

  let balance = 0;
  return events.map((e) => {
    balance += e.amount;
    return { ...e, balance };
  });
}

export function totalTransferFees(transfers: Transfer[]): number {
  return transfers.reduce((sum, t) => sum + (t.fee || 0), 0);
}
