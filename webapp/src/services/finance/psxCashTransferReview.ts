import { flushLocalStorageWrites } from '../../lib/localStoragePersistence';
import { getCurrentUser } from '../../lib/firebase/useAuthState';
import { nextSeq } from '../../lib/seq';
import type { CashTransferSource } from '../../lib/psxCashStatement';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { PSX_WORKBOOK_STORAGE_KEY, usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import type { BankWorkbook } from '../../types/bankWorkbook';
import type { InterEntityTransfer } from '../../types/interEntityTransfer';
import type { Transfer } from '../../types/workbook';

const hasAhl = (description: string) => /\b(?:AHL|AL[\s-]+HABIB|AHCML)\b/i.test(description);
export const isAhlBroker = (id: string, name: string) => id === 'psx-al-habib-capital-markets' || hasAhl(name);

export function bankCashSources(bank: BankWorkbook, links: InterEntityTransfer[], brokerId: string, currency: string, otherBrokerTransfers: Transfer[]) {
  const bankLinks = new Map(links.flatMap(link => {
    if (link.from.module === 'bank') return [[link.fromRecordId, { side: link.to, id: link.toRecordId }] as const];
    if (link.to.module === 'bank') return [[link.toRecordId, { side: link.from, id: link.fromRecordId }] as const];
    return [];
  }));
  const otherSources = new Set(otherBrokerTransfers.flatMap(row => row.cashSourceIds ?? []));
  const accounts = new Map(bank.settings.accounts.filter(account =>
    account.currencyCode === currency && !account.isLiability && !account.migratedToCreditCardId,
  ).map(account => [account.id, account]));
  return bank.transactions.flatMap((row): CashTransferSource[] => {
    const account = accounts.get(row.accountId);
    const link = bankLinks.get(row.id);
    const sourceId = `bank:${row.id}`;
    if (!account || row.isPending || !Number.isFinite(row.amount) || !row.amount || otherSources.has(sourceId)) return [];
    if (link ? link.side.module !== 'psx' || (link.side.ref && link.side.ref !== brokerId)
      : !/\bPSX\b/i.test(row.description) || !hasAhl(row.description)) return [];
    return [{
      sourceId, accountName: account.name, linkedTransferId: link?.id,
      date: row.date, time: row.time, timezone: row.timezone, description: row.description,
      type: row.amount < 0 ? 'DEPOSIT' : 'WITHDRAWAL', gross: Math.abs(row.amount),
    }];
  });
}

function amountAgrees(source: number, existing: number, decimals?: number) {
  if (Math.abs(source - existing) < 1e-8) return true;
  if (decimals === undefined || decimals > 10 || !Number.isFinite(existing)) return false;
  const scale = 10 ** decimals;
  return Math.round((existing + Number.EPSILON * existing) * scale) === Math.round(source * scale);
}

const grossAgrees = (source: CashTransferSource, row: Transfer) =>
  amountAgrees(source.gross, row.gross, source.grossDecimals);

export function statementAmountsAgree(source: CashTransferSource, row: Transfer) {
  return grossAgrees(source, row) && (source.fee === undefined || amountAgrees(source.fee, row.fee, source.feeDecimals));
}

const exact = (source: CashTransferSource, row: Transfer) =>
  source.date === row.date && source.type === row.type && grossAgrees(source, row);

export function matchCashTransfers(sources: CashTransferSource[], existing: Transfer[], bankLinkedIds = new Set<string>()) {
  const available = (source: CashTransferSource, row: Transfer) => !source.sourceId.startsWith('bank:') ||
    (!bankLinkedIds.has(row.id) && !row.cashSourceIds?.some(id => id.startsWith('bank:')));
  // Source references outrank heuristics. Reserve them before looking for older manual matches.
  const references = sources.map(source => existing.find(row => row.id === source.linkedTransferId || row.cashSourceIds?.includes(source.sourceId)));
  const claimed = new Set(references.flatMap(row => row ? [row.id] : []));
  const exactCandidates = sources.map((source, index) => references[index] || source.linkedTransferId ? [] :
    existing.filter(row => !claimed.has(row.id) && available(source, row) && exact(source, row) &&
      (!source.sourceId.startsWith('statement:') || !row.cashSourceIds?.some(id => id.startsWith('statement:')))));
  const demand = new Map<string, number>();
  for (const candidates of exactCandidates) {
    for (const row of candidates) demand.set(row.id, (demand.get(row.id) ?? 0) + 1);
  }
  const matches = references.map((reference, index) => {
    const candidates = exactCandidates[index];
    return reference ?? (candidates.length === 1 && demand.get(candidates[0].id) === 1 ? candidates[0] : undefined);
  });
  const matched = new Set(matches.flatMap(row => row ? [row.id] : []));
  const rows = sources.map((source, index) => {
    const match = matches[index];
    const candidates = match ? [match] : source.linkedTransferId ? [] : existing.filter(row =>
      !matched.has(row.id) && available(source, row) && row.type === source.type && (
        row.date === source.date ||
        (Math.abs(source.gross - row.gross) < 1e-8 && Math.abs(Date.parse(row.date) - Date.parse(source.date)) <= 7 * 86400000)
      ));
    const status = match ? exact(source, match) && statementAmountsAgree(source, match) &&
      (source.description === undefined || source.description === match.description) &&
      (source.time === undefined || source.time === match.time) &&
      (source.timezone === undefined || source.timezone === match.timezone) ? 'matched' : 'mismatch'
      : candidates.length || source.linkedTransferId ? 'ambiguous' : 'new';
    return { source, candidates, status } as const;
  });
  return { rows, existingOnly: existing.filter(row => !matched.has(row.id) && !rows.some(review => review.candidates.includes(row))) };
}

function getContext() {
  const workbook = usePSXWorkbookStore.getState().workbook;
  const broker = workbook.brokerProfiles.find(profile => profile.id === workbook.activeBrokerId);
  const links = useInterEntityTransfersStore.getState().workbook.entries;
  const bank = useBankWorkbookStore.getState().workbook;
  return { workbook, broker, links, bank, owner: getCurrentUser()?.uid };
}

function sourcesFromBank({ workbook, bank, links }: ReturnType<typeof getContext>) {
  const otherTransfers = workbook.brokerProfiles.flatMap(profile => profile.id === workbook.activeBrokerId ? [] : profile.data?.transfers ?? []);
  return bankCashSources(bank, links, workbook.activeBrokerId, workbook.settings.currency, otherTransfers);
}

export function previewPsxCashTransfers(statement?: CashTransferSource[]) {
  const context = getContext();
  const { workbook, broker, owner, links } = context;
  if (!owner || !broker || broker.archived || broker.deactivated) throw new Error('Sign in and select an active PSX broker.');
  if (!statement && !isAhlBroker(broker.id, broker.name)) throw new Error('Select the PSX Al Habib broker to sync bank transfers.');
  const sources = statement ?? sourcesFromBank(context);
  const { transfers, activeBrokerId, settings } = workbook;
  if (statement?.some(row => (row.brokerId && row.brokerId !== activeBrokerId) ||
    (row.currencyCode && row.currencyCode !== settings.currency))) {
    throw new Error('The statement contains transfers from a different broker or currency.');
  }
  const linkedIds = new Set(links.flatMap(link => [
    ...(link.from.module === 'psx' ? [link.fromRecordId] : []),
    ...(link.to.module === 'psx' ? [link.toRecordId] : []),
  ]));
  return {
    ...matchCashTransfers(sources, transfers, linkedIds), sources, linkedIds, statement: !!statement,
    owner, brokerId: activeBrokerId, brokerName: broker.name, currency: settings.currency,
    ledgerSnapshot: JSON.stringify(transfers),
    persistedSnapshot: localStorage.getItem(PSX_WORKBOOK_STORAGE_KEY),
  };
}

export function preparePsxCashTransferReview(statement?: CashTransferSource[]) {
  flushLocalStorageWrites();
  const preview = previewPsxCashTransfers(statement);
  if (preview.persistedSnapshot !== null &&
    preview.persistedSnapshot !== JSON.stringify(usePSXWorkbookStore.getState().workbook)) {
    throw new Error('The saved ledger differs from this tab. Reload and open the review again.');
  }
  return preview;
}

export type PsxCashPreview = ReturnType<typeof previewPsxCashTransfers>;
export type CashChoice = { action: 'add' } | { action: 'keep' | 'replace'; id: string };

export function applyPsxCashTransfers(preview: PsxCashPreview, choices: ReadonlyMap<string, CashChoice>) {
  const fresh = previewPsxCashTransfers(preview.statement ? preview.sources : undefined);
  if (fresh.owner !== preview.owner || fresh.brokerId !== preview.brokerId || fresh.currency !== preview.currency ||
    fresh.ledgerSnapshot !== preview.ledgerSnapshot || JSON.stringify(fresh.sources) !== JSON.stringify(preview.sources)) {
    throw new Error('The account or ledger changed. Open the review again.');
  }
  const store = usePSXWorkbookStore.getState();
  const workbook = store.workbook;
  const updates = new Map<string, Transfer>();
  const additions: Transfer[] = [];
  let seq = nextSeq(workbook.transfers);
  let applied = 0;
  for (const { source, candidates, status } of fresh.rows) {
    const choice = choices.get(source.sourceId);
    if (!choice) continue;
    applied++;
    const { date, type, gross, fee, description, time, timezone, sourceId } = source;
    if (choice.action === 'add') {
      if (status === 'matched' || status === 'mismatch' || source.linkedTransferId) throw new Error('This source is already matched.');
      additions.push({ id: crypto.randomUUID(), brokerId: fresh.brokerId, seq: seq++, date, type, gross, fee: fee ?? 0,
        description, time, timezone, timestamp: new Date().toISOString(), cashSourceIds: [sourceId] });
      continue;
    }
    const existing = candidates.find(row => row.id === choice.id);
    if (!existing || updates.has(existing.id)) throw new Error('Choose a different existing transfer for each source row.');
    if (choice.action === 'replace' && fresh.linkedIds.has(existing.id)) throw new Error('Edit linked values through the existing transfer link.');
    if (fresh.statement && choice.action === 'keep' && !statementAmountsAgree(source, existing)) {
      throw new Error('Use the statement amounts for conflicting values or skip this source row.');
    }
    const nextGross = fresh.statement && grossAgrees(source, existing) ? existing.gross : gross;
    const nextFee = fee === undefined || (fresh.statement && amountAgrees(fee, existing.fee, source.feeDecimals)) ? existing.fee : fee;
    if (choice.action === 'replace' && type === 'DEPOSIT' && nextFee > nextGross) throw new Error('The existing fee exceeds the incoming deposit. Correct the fee in the ledger first.');
    const replacement = choice.action === 'replace' ? {
      date, type, gross: nextGross, fee: nextFee,
      description: description ?? existing.description,
      time: time ?? existing.time,
      timezone: timezone ?? existing.timezone,
    } : {};
    updates.set(existing.id, { ...existing, ...replacement,
      ...(date !== existing.date && choice.action === 'replace' ? { accountingOrder: undefined } : {}),
      cashSourceIds: [...new Set([...(existing.cashSourceIds ?? []), sourceId])],
    });
  }
  if (!applied || applied !== choices.size) throw new Error('Select at least one available record.');
  store.setWorkbook({ ...workbook, transfers: [...workbook.transfers.map(row => updates.get(row.id) ?? row), ...additions] }, { expectedPersistedSnapshot: preview.persistedSnapshot });
  return { added: additions.length, reconciled: updates.size };
}
