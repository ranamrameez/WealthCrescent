import { getCurrentUser } from '../../lib/firebase/useAuthState';
import { getAccountingEventRefs, syncAccountingEventCollections } from '../../lib/seq';
import { parseTheGroupStatement, type StatementRecord } from '../../lib/theGroupStatement';
import { useWorkbookStore } from '../../store/workbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import type { Workbook } from '../../types/workbook';

export async function prepareQseStatementTradeReview(
  table: string[][],
  fileName: string,
  tickerNames: Record<string, string>,
  requested: { owner?: string; brokerId: string },
  ensureSignedIn: (message: string) => Promise<boolean>,
) {
  if (!(await ensureSignedIn('Sign in to review the statement for import.'))) return null;
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
  const existing: StatementRecord[] = [
    ...workbook.transactions.map(row => ({ ...row, kind: 'trade' as const })),
    ...workbook.transfers.map(row => ({ ...row, kind: 'transfer' as const })),
    ...workbook.adjustments.map(row => ({ ...row, kind: 'adjustment' as const })),
  ];
  const existingById = new Map(existing.filter(row => row.id).map(row => [recordKey(row), row]));
  const result = parseTheGroupStatement(table, existing, { tickerNames, reviewTrades: true });
  const rows = result.records.map((row, index) => {
    const incoming = result.incomingValues[index] ?? row;
    const match = row.id ? existingById.get(recordKey(row)) : undefined;
    const conflict = result.conflicts[index];
    const mismatched = !!match && Boolean(statementChanges(match, incoming));
    const blocked = match?.kind === 'transfer' && incoming.kind === 'transfer' &&
      match.gross !== incoming.gross && isLinkedTransfer(match.id);
    return { index, incoming, match, conflict, mismatched, blocked };
  });
  return {
    rows, fileName, owner, snapshot: ledgerSnapshot(workbook), brokerId: workbook.activeBrokerId,
    brokerName: workbook.brokerProfiles.find(broker => broker.id === workbook.activeBrokerId)?.name ?? 'Active QSE broker',
    currency: workbook.settings.currency,
  };
}

function recordKey(row: { kind: string; id?: string }) {
  return `${row.kind}:${row.id}`;
}

function isLinkedTransfer(id: string) {
  return useInterEntityTransfersStore.getState().workbook.entries.some(link =>
    (link.from.module === 'qse' && link.fromRecordId === id) ||
    (link.to.module === 'qse' && link.toRecordId === id));
}

function statementChanges(match: StatementRecord, incoming: StatementRecord): StatementRecord | undefined {
  if (match.kind === 'trade' && incoming.kind === 'trade' &&
    (match.ticker !== incoming.ticker || match.price !== incoming.price || match.shares !== incoming.shares)) {
    return { ...match, ticker: incoming.ticker, price: incoming.price, shares: incoming.shares };
  }
  if (match.kind === 'transfer' && incoming.kind === 'transfer' && (match.gross !== incoming.gross || match.fee !== incoming.fee)) {
    return { ...match, gross: incoming.gross, fee: incoming.fee };
  }
  if (match.kind === 'adjustment' && incoming.kind === 'adjustment' && match.amount !== incoming.amount) {
    return { ...match, amount: incoming.amount };
  }
  return undefined;
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
  if (!chosen.length || chosen.length !== selected.size || chosen.some(row => row.conflict || row.blocked)) {
    throw new Error('Select at least one available statement record.');
  }
  const updates = new Map<string, StatementRecord>();
  const additions = new Map<number, StatementRecord>();
  for (const { index, incoming, match } of chosen) {
    if (!match?.id) {
      const record = { ...incoming, id: crypto.randomUUID(), brokerId: workbook.activeBrokerId };
      additions.set(index, record.kind === 'trade' ? { ...record, timestamp: new Date().toISOString() } : record);
      continue;
    }
    const changed = statementChanges(match, incoming);
    if (!changed) continue;
    if (changed.kind === 'transfer' && match.kind === 'transfer' && changed.gross !== match.gross && isLinkedTransfer(match.id)) {
      throw new Error('Use Modify to change the gross amount of a linked transfer.');
    }
    updates.set(recordKey(changed), changed);
  }

  if (!updates.size && !additions.size) return { added: 0, updated: 0 };

  // Keep existing accounting order. Insert new trades beside statement matches,
  // while preserving the relative order of all previously recorded events.
  const refs = getAccountingEventRefs(syncAccountingEventCollections(workbook));
  const order = new Map<string, number>();
  for (const date of new Set([...additions.values()].map(row => row.date))) {
    const day = refs.filter(row => row.date === date);
    const positions = new Map(day.map((row, at) => [recordKey(row), at]));
    const insertions = new Map<number, string[]>();
    const incomingDay = preview.rows.filter(row => row.incoming.date === date && !row.conflict);
    const anchors = (tradeOnly: boolean) => incomingDay.flatMap(({ match }) => {
      if (!match?.id || (tradeOnly && match.kind !== 'trade')) return [];
      const position = positions.get(recordKey(match));
      return position === undefined ? [] : [position];
    });
    const ordered = (items: number[]) => items.every((position, index) => index === 0 || position >= items[index - 1]);
    const tradeOnly = !ordered(anchors(false));
    if (tradeOnly && !ordered(anchors(true))) {
      throw new Error(`Existing trades on ${date} are ordered differently from the statement. Review their order using Modify before adding new same-day records.`);
    }
    let nextAnchor = day.length;
    for (const row of [...incomingDay].reverse()) {
      if (row.match?.id && (!tradeOnly || row.match.kind === 'trade')) {
        nextAnchor = positions.get(recordKey(row.match)) ?? nextAnchor;
      }
      const addition = additions.get(row.index);
      if (!addition) continue;
      const chunk = insertions.get(nextAnchor) ?? [];
      chunk.push(recordKey(addition));
      insertions.set(nextAnchor, chunk);
    }
    const keys = day.flatMap((row, at) => [
      ...(insertions.get(at) ?? []).reverse(),
      `${row.kind}:${row.id}`,
    ]);
    keys.push(...(insertions.get(day.length) ?? []).reverse());
    keys.forEach((key, index) => order.set(key, index + 1));
  }

  const withOrder = <T extends { id?: string; accountingOrder?: number }>(record: T, kind: string) => {
    const accountingOrder = order.get(recordKey({ kind, id: record.id }));
    return accountingOrder === undefined ? record : { ...record, accountingOrder };
  };
  const reconcile = <K extends StatementRecord['kind']>(
    rows: Omit<Extract<StatementRecord, { kind: K }>, 'kind'>[],
    kind: K,
  ) => {
    const isKind = (row: StatementRecord | undefined): row is Extract<StatementRecord, { kind: K }> => row?.kind === kind;
    const stripKind = ({ kind: _kind, ...record }: Extract<StatementRecord, { kind: K }>) => record;
    const existing = rows.map(row => {
      const update = updates.get(recordKey({ kind, id: row.id }));
      return isKind(update) ? stripKind(update) : row;
    });
    return [...existing, ...[...additions.values()].filter(isKind).map(stripKind)].map(row => withOrder(row, kind));
  };
  store.setWorkbook({
    ...workbook,
    transactions: reconcile(workbook.transactions, 'trade'),
    transfers: reconcile(workbook.transfers, 'transfer'),
    adjustments: reconcile(workbook.adjustments, 'adjustment'),
    dividends: workbook.dividends.map(row => withOrder(row, 'dividend')),
  });
  return { added: additions.size, updated: updates.size };
}
