import { getCurrentUser } from '../../lib/firebase/useAuthState';
import { getAccountingEventRefs, syncAccountingEventCollections } from '../../lib/seq';
import { parseTheGroupStatement } from '../../lib/theGroupStatement';
import { useWorkbookStore } from '../../store/workbookStore';
import type { Transaction, Workbook } from '../../types/workbook';

export async function prepareQseStatementTradeReview(
  table: string[][],
  fileName: string,
  tickerNames: Record<string, string>,
  requested: { owner?: string; brokerId: string },
  ensureSignedIn: (message: string) => Promise<boolean>,
) {
  if (!(await ensureSignedIn('Sign in to review trades for import.'))) return null;
  const owner = getCurrentUser()?.uid;
  const workbook = useWorkbookStore.getState().workbook;
  if (!owner || (requested.owner && owner !== requested.owner) || workbook.activeBrokerId !== requested.brokerId) {
    throw new Error('The account or broker changed. Open the statement again.');
  }
  return previewQseStatementTrades(table, fileName, tickerNames, workbook, owner);
}

function ledgerSnapshot(workbook: Workbook) {
  const { transactions, transfers, adjustments, dividends } = workbook;
  return JSON.stringify({ transactions, transfers, adjustments, dividends });
}

export function previewQseStatementTrades(table: string[][], fileName: string, tickerNames: Record<string, string>, workbook: Workbook, owner?: string) {
  const existingById = new Map(workbook.transactions.map(row => [row.id, row]));
  const result = parseTheGroupStatement(table, workbook.transactions.map(row => ({ ...row, kind: 'trade' })), { tickerNames, reviewTrades: true });
  const rows = result.records.flatMap((row, index) => {
    if (row.kind !== 'trade') return [];
    const { kind: _kind, ...incoming } = row;
    const conflict = result.conflicts[index];
    const match = incoming.id ? existingById.get(incoming.id) : undefined;
    return [{ index, incoming, match, conflict }];
  });
  return {
    rows, fileName, owner, snapshot: ledgerSnapshot(workbook), brokerId: workbook.activeBrokerId,
    brokerName: workbook.brokerProfiles.find(broker => broker.id === workbook.activeBrokerId)?.name ?? 'Active QSE broker',
    currency: workbook.settings.currency,
  };
}

export type QseStatementTradePreview = ReturnType<typeof previewQseStatementTrades>;
export type QseStatementTradeReviewRow = QseStatementTradePreview['rows'][number];

export function applyQseStatementTrades(preview: QseStatementTradePreview, selected: ReadonlySet<number>) {
  const user = getCurrentUser();
  if (!user || user.uid !== preview.owner) throw new Error('The signed-in account changed. Open the statement again.');
  const store = useWorkbookStore.getState();
  const workbook = store.workbook;
  if (workbook.activeBrokerId !== preview.brokerId || workbook.settings.currency !== preview.currency || ledgerSnapshot(workbook) !== preview.snapshot) {
    throw new Error('The broker or its ledger changed. Open the statement again.');
  }
  const chosen = preview.rows.filter(row => selected.has(row.index));
  if (!chosen.length || chosen.length !== selected.size || chosen.some(row => row.conflict)) {
    throw new Error('Select at least one available statement trade.');
  }
  const updates = new Map<string, Transaction>();
  const additions = new Map<number, Transaction & { id: string }>();
  for (const { index, incoming, match } of chosen) {
    if (!match?.id) {
      additions.set(index, { ...incoming, id: crypto.randomUUID(), brokerId: workbook.activeBrokerId, timestamp: new Date().toISOString() });
    } else if (match.ticker !== incoming.ticker || match.price !== incoming.price || match.shares !== incoming.shares) {
      updates.set(match.id, { ...match, ticker: incoming.ticker, price: incoming.price, shares: incoming.shares });
    }
  }

  if (!updates.size && !additions.size) return { added: 0, updated: 0 };

  // Keep existing accounting order. Insert new trades beside statement matches,
  // while preserving the relative order of all previously recorded events.
  const refs = getAccountingEventRefs(syncAccountingEventCollections(workbook));
  const order = new Map<string, number>();
  for (const date of new Set([...additions.values()].map(row => row.date))) {
    const day = refs.filter(row => row.date === date);
    const positions = new Map(day.flatMap((row, at) => row.kind === 'trade' ? [[row.id, at] as const] : []));
    const insertions = new Map<number, string[]>();
    const incomingDay = preview.rows.filter(row => row.incoming.date === date && !row.conflict);
    const anchorPositions = incomingDay.flatMap(row => row.match?.id && positions.has(row.match.id) ? [positions.get(row.match.id)!] : []);
    if (anchorPositions.some((position, index) => index > 0 && position < anchorPositions[index - 1])) {
      throw new Error(`Existing trades on ${date} are ordered differently from the statement. Review their order using Modify before adding new same-day trades.`);
    }
    let nextAnchor = day.length;
    for (const row of [...incomingDay].reverse()) {
      if (row.match?.id && positions.has(row.match.id)) nextAnchor = positions.get(row.match.id)!;
      const addition = additions.get(row.index);
      if (!addition) continue;
      const chunk = insertions.get(nextAnchor) ?? [];
      chunk.push(addition.id);
      insertions.set(nextAnchor, chunk);
    }
    const keys = day.flatMap((row, at) => [
      ...(insertions.get(at) ?? []).reverse().map(id => `trade:${id}`),
      `${row.kind}:${row.id}`,
    ]);
    keys.push(...(insertions.get(day.length) ?? []).reverse().map(id => `trade:${id}`));
    keys.forEach((key, index) => order.set(key, index + 1));
  }

  const withOrder = <T extends { id?: string; accountingOrder?: number }>(row: T, kind: 'trade' | 'transfer' | 'adjustment' | 'dividend') => {
    const accountingOrder = order.get(`${kind}:${row.id}`);
    return accountingOrder === undefined ? row : { ...row, accountingOrder };
  };
  store.setWorkbook({
    ...workbook,
    transactions: [...workbook.transactions.map(row => updates.get(row.id ?? '') ?? row), ...additions.values()].map(row => withOrder(row, 'trade')),
    transfers: workbook.transfers.map(row => withOrder(row, 'transfer')),
    adjustments: workbook.adjustments.map(row => withOrder(row, 'adjustment')),
    dividends: workbook.dividends.map(row => withOrder(row, 'dividend')),
  });
  return { added: additions.size, updated: updates.size };
}
