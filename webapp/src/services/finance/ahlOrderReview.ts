import { ahlFillKey, type AhlFill } from '../../lib/ahlOrderHistory';
import { validateTransactionEdit } from '../../lib/calc/tradeValidation';
import { getCurrentUser } from '../../lib/firebase/useAuthState';
import { flushLocalStorageWrites } from '../../lib/localStoragePersistence';
import { PSX_WORKBOOK_STORAGE_KEY, usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import type { Transaction } from '../../types/workbook';
import { isAhlBroker } from './psxCashTransferReview';

const importId = (fill: AhlFill, brokerId: string) => `${fill.sourceId}:${encodeURIComponent(brokerId)}`;

export function classifyAhlFills(fills: AhlFill[], records: Transaction[], brokerId: string) {
  const byTrade = new Map<string, Transaction[]>();
  const byDay = new Set<string>();
  const sourceIds = new Set(records.flatMap(record => record.id ? [record.id] : []));
  const dayKey = (trade: Pick<Transaction, 'ticker' | 'date' | 'action'>) =>
    `${trade.date}:${trade.ticker.trim().toUpperCase()}:${trade.action}`;
  for (const record of records) {
    byDay.add(dayKey(record));
    if (record.isPending || record.id?.startsWith('ahl-order:')) continue;
    const key = ahlFillKey(record);
    const exact = byTrade.get(key) ?? [];
    exact.push(record);
    byTrade.set(key, exact);
  }
  return fills.map(fill => {
    const exact = byTrade.get(ahlFillKey(fill));
    const known = sourceIds.has(importId(fill, brokerId)) || !!exact?.shift();
    const status = known ? 'existing' : byDay.has(dayKey(fill)) ? 'overlap' : 'new';
    return { fill, status } as const;
  });
}

function context() {
  const owner = getCurrentUser()?.uid;
  const workbook = usePSXWorkbookStore.getState().workbook;
  const broker = workbook.brokerProfiles.find(item => item.id === workbook.activeBrokerId);
  if (!owner || !broker || broker.archived || broker.deactivated || !isAhlBroker(broker.id, broker.name)) {
    throw new Error('Sign in and select an active Al Habib broker.');
  }
  return { owner, workbook, broker };
}

export function prepareAhlOrderReview(fills: AhlFill[], requestedBrokerId: string, requestedOwner?: string) {
  flushLocalStorageWrites();
  const { owner, workbook, broker } = context();
  if (broker.id !== requestedBrokerId || (requestedOwner && owner !== requestedOwner)) {
    throw new Error('The account or broker changed. Open a new review.');
  }
  const snapshot = JSON.stringify(workbook);
  const persisted = localStorage.getItem(PSX_WORKBOOK_STORAGE_KEY);
  if (persisted !== null && persisted !== snapshot) throw new Error('The saved workbook differs from this tab. Reload and try again.');
  return {
    owner, brokerId: broker.id, brokerName: broker.name, snapshot, persisted,
    rows: classifyAhlFills(fills, workbook.transactions, broker.id),
  };
}

export function applyAhlOrderReview(preview: ReturnType<typeof prepareAhlOrderReview>, selected: ReadonlySet<string>) {
  const { owner, workbook, broker } = context();
  if (owner !== preview.owner || broker.id !== preview.brokerId || JSON.stringify(workbook) !== preview.snapshot) {
    throw new Error('The account or workbook changed. Open a new review.');
  }
  const timestamp = new Date().toISOString();
  const additions = preview.rows.flatMap(({ fill, status }): Transaction[] =>
    status === 'existing' || !selected.has(fill.sourceId) ? [] : [{
      id: importId(fill, broker.id), brokerId: broker.id, date: fill.date, ticker: fill.ticker,
      action: fill.action, shares: fill.shares, price: fill.price, timestamp,
    }]);
  if (!additions.length || additions.length !== selected.size) throw new Error('Select at least one available fill.');
  const transactions = [...workbook.transactions, ...additions];
  const invalid = validateTransactionEdit(workbook.transactions, transactions);
  if (invalid) throw new Error(`The selection creates ${invalid.additionalUnmatchedShares} unmatched ${invalid.ticker} sell shares. Include the earlier buys or skip those sells.`);
  usePSXWorkbookStore.getState().setWorkbook({ ...workbook, transactions }, { expectedPersistedSnapshot: preview.persisted });
  return additions.length;
}
