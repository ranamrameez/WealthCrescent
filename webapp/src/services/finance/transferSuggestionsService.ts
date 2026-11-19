import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import type { TransferCandidate } from '../../lib/calc/transferLinkSuggestions';
import { getCurrentUser } from '../../lib/firebase/useAuthState';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { useWorkbookStore } from '../../store/workbookStore';
import { usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import { useFundsWorkbookStore } from '../../store/fundsWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';

export type TransferSuggestionOwners = Partial<Record<'cash' | 'bank' | 'cards' | 'qse' | 'psx' | 'funds' | 'transfers', string>>;
export const canScanTransferSuggestions = (owner: string, owners: TransferSuggestionOwners) =>
  getCurrentUser()?.uid === owner && owners.transfers === owner && [owners.bank, owners.cash].includes(owner);

export function subscribeTransferSuggestionSources(listener: () => void) {
  const stops = [useWorkbookStore, usePSXWorkbookStore, useFundsWorkbookStore, useInterEntityTransfersStore].map(store => store.subscribe(listener));
  return () => stops.forEach(stop => stop());
}

function records(owner: string, owners: TransferSuggestionOwners): TransferCandidate[] {
  const rows: TransferCandidate[] = [];
  if (owners.cash === owner) for (const row of useCashWorkbookStore.getState().workbook.entries) {
    if (row.isPending) continue;
    rows.push({ module: 'cash', recordId: row.id, sourceId: row.currencyCode, sourceLabel: row.currencyCode + ' Cash',
      description: [row.title, row.note].filter(Boolean).join(' '), keywords: row.source, date: row.date,
      amount: row.amount, currencyCode: row.currencyCode, direction: row.isDeposit ? 'in' : 'out', categoryId: row.categoryID,
      side: { module: 'cash', currencyCode: row.currencyCode }, url: '/cash/' + encodeURIComponent(row.currencyCode), snapshot: JSON.stringify(row) });
  }
  if (owners.bank === owner) {
    const workbook = useBankWorkbookStore.getState().workbook;
    for (const row of workbook.transactions) {
      const account = workbook.settings.accounts.find(account => account.id === row.accountId);
      if (!account || row.isPending || (row.amount > 0) !== row.isDeposit) continue;
      rows.push({ module: 'bank', recordId: row.id, sourceId: account.id, sourceLabel: account.name,
        description: [row.description, row.note].filter(Boolean).join(' '), keywords: [account.name, account.nickname, account.accountNumber].filter(Boolean).join(' '),
        date: row.date, amount: Math.abs(row.amount), currencyCode: account.currencyCode, direction: row.isDeposit ? 'in' : 'out', categoryId: row.categoryID,
        side: { module: 'bank', ref: account.id, currencyCode: account.currencyCode }, url: '/bank/account/' + encodeURIComponent(account.id), snapshot: JSON.stringify(row) });
    }
  }
  if (owners.cards === owner) {
    const workbook = useCreditCardWorkbookStore.getState().workbook;
    for (const row of workbook.transactions) {
      const card = workbook.cards.find(card => card.id === row.cardId);
      if (!card || row.kind !== 'payment') continue;
      rows.push({ module: 'creditCard', recordId: row.id, sourceId: card.id, sourceLabel: card.name,
        description: row.description, keywords: card.name, date: row.date, amount: row.amount, currencyCode: card.currencyCode, direction: 'in', categoryId: row.categoryID,
        side: { module: 'creditCard', ref: card.id, currencyCode: card.currencyCode }, url: '/bank/card/' + encodeURIComponent(card.id), snapshot: JSON.stringify(row) });
    }
  }
  for (const [module, store] of [['qse', useWorkbookStore], ['psx', usePSXWorkbookStore]] as const) {
    if (owners[module] !== owner) continue;
    const workbook = store.getState().workbook;
    for (const profile of workbook.brokerProfiles) {
      for (const row of profile.id === workbook.activeBrokerId ? workbook.transfers : profile.data?.transfers ?? []) {
        if ((row.brokerId && row.brokerId !== profile.id) || !Number.isFinite(row.fee) || row.fee < 0) continue;
        rows.push({ module, recordId: row.id, sourceId: profile.id, sourceLabel: profile.name,
          description: row.description ?? '', keywords: [profile.name, profile.accountLabel].filter(Boolean).join(' '), date: row.date,
          amount: row.gross, currencyCode: profile.settings.currency, direction: row.type === 'DEPOSIT' ? 'in' : 'out',
          side: { module, ref: profile.id, currencyCode: profile.settings.currency, fee: row.fee },
          url: `${module === 'qse' ? '' : '/psx'}/brokers?broker=${encodeURIComponent(profile.id)}`, snapshot: JSON.stringify(row) });
      }
    }
  }
  if (owners.funds === owner) {
    const workbook = useFundsWorkbookStore.getState().workbook;
    for (const row of workbook.transfers) {
      if (!Number.isFinite(row.fee) || row.fee < 0) continue;
      const currencyCode = row.currencyCode || workbook.settings.legacyTransferCurrency || workbook.settings.defaultCurrency;
      rows.push({ module: 'funds', recordId: row.id, sourceId: currencyCode, sourceLabel: 'Funds', description: row.description ?? '',
        date: row.date, amount: row.gross, currencyCode, direction: row.type === 'DEPOSIT' ? 'in' : 'out',
        side: { module: 'funds', currencyCode, fee: row.fee }, url: '/funds', snapshot: JSON.stringify(row) });
    }
  }
  const counts = new Map<string, number>();
  const identity = (row: TransferCandidate) => JSON.stringify([row.module, row.recordId]);
  for (const row of rows) counts.set(identity(row), (counts.get(identity(row)) ?? 0) + 1);
  const links = useInterEntityTransfersStore.getState().workbook.entries;
  return rows.filter(row => counts.get(identity(row)) === 1 && !links.some(link =>
    (link.from.module === row.module && link.fromRecordId === row.recordId) || (link.to.module === row.module && link.toRecordId === row.recordId)));
}

export function scanTransferSuggestions(owner: string, owners: TransferSuggestionOwners) {
  if (!canScanTransferSuggestions(owner, owners)) return [];
  return CalculationEngine.linkSuggestions.suggestTransferLinks(records(owner, owners)).map(row => ({ ...row, owner }));
}
export type TransferSuggestion = ReturnType<typeof scanTransferSuggestions>[number];

/** Only the link workbook changes. Both existing ledger records remain byte-for-byte intact. */
export function acceptTransferSuggestion(reviewed: TransferSuggestion, owners: TransferSuggestionOwners) {
  const candidate = scanTransferSuggestions(reviewed.owner, owners).find(row => row.id === reviewed.id);
  if (!candidate || JSON.stringify(candidate) !== JSON.stringify(reviewed)) throw new Error('These records changed. Scan again before linking them.');
  const { from, to } = candidate;
  useInterEntityTransfersStore.getState().addEntry({ id: crypto.randomUUID(), date: from.date,
    from: from.side, to: to.side, fromAmount: from.amount, toAmount: to.amount, fromRecordId: from.recordId, toRecordId: to.recordId,
    categoryID: from.categoryId, note: [from.description, to.description].filter(Boolean).join(' · ') });
}
