import { isSupportedLinkPair } from '../interEntityLink';
import { UNCATEGORIZED_ID } from '../categories';
import type { LinkModule, LinkSideConfig } from '../../types/interEntityTransfer';

export interface TransferCandidate {
  module: LinkModule;
  recordId: string;
  sourceId: string;
  sourceLabel: string;
  description: string;
  keywords?: string;
  date: string;
  amount: number;
  currencyCode: string;
  direction: 'in' | 'out';
  categoryId?: string;
  side: LinkSideConfig;
  url: string;
  /** Native snapshot for approval-time revalidation, never written over a ledger. */
  snapshot: string;
}
const tokens = (text: string): string[] => text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const generic = new Set(['transfer', 'payment', 'deposit', 'withdrawal', 'bank', 'cash', 'card', 'account', 'manual', 'funds', 'from', 'into', 'the']);
const meaningful = (text: string) => tokens(text).filter(word => word.length >= 4 && !generic.has(word));
const identifiers = (text: string) => [...text.matchAll(/(?:[x*•]{2,}\s*(\d{4,8})\b|\[\s*(\d{4,8})\s*\]|\b(\d{7,15})\b)/gi)].map(match => match[1] ?? match[2] ?? match[3]);
const day = (date: string) => {
  const instant = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === date ? instant : NaN;
};

/** Suggestions never resolve ambiguous peers automatically or guess an FX rate. */
export function suggestTransferLinks(records: TransferCandidate[]) {
  const valid = records.filter(row => row.amount > 0 && Number.isFinite(row.amount) && Number.isFinite(day(row.date)));
  const key = (row: TransferCandidate) => JSON.stringify([row.currencyCode, Math.round(row.amount * 100)]);
  const incoming = new Map<string, TransferCandidate[]>();
  for (const row of valid) {
    if (row.direction === 'in') incoming.set(key(row), [...(incoming.get(key(row)) ?? []), row]);
  }
  return valid.filter(row => row.direction === 'out').flatMap(from => (incoming.get(key(from)) ?? []).flatMap(to => {
    if (to.direction !== 'in' || !isSupportedLinkPair(from.module, to.module) ||
      (from.module === to.module && from.sourceId === to.sourceId) || from.currencyCode !== to.currencyCode ||
      Math.round(from.amount * 100) !== Math.round(to.amount * 100)) return [];
    const distance = Math.abs(day(from.date) - day(to.date)) / 86400000;
    if (distance > 3) return [];
    const left = [from.description, from.keywords].filter(Boolean).join(' ');
    const right = [to.description, to.keywords].filter(Boolean).join(' ');
    const sameIdentifier = identifiers(left).some(a => identifiers(right).some(b => a.endsWith(b) || b.endsWith(a)));
    const rightTokens = new Set(meaningful(right));
    const sharedWords = meaningful(left).some(word => rightTokens.has(word));
    const sourceMention = meaningful(from.sourceLabel).some(word => tokens(right).includes(word)) ||
      meaningful(to.sourceLabel).some(word => tokens(left).includes(word));
    const sameCategory = !!from.categoryId && from.categoryId !== UNCATEGORIZED_ID && from.categoryId === to.categoryId;
    if (!sameIdentifier && !sharedWords && !sourceMention && !sameCategory) return [];
    const reasons = ['Same currency and amount', sameIdentifier && 'Matching identifier', sharedWords && 'Shared description keywords',
      sourceMention && 'Account or broker name in description', sameCategory && 'Same category', `Dates within ${distance} days`]
      .filter((reason): reason is string => typeof reason === 'string');
    return [{ id: JSON.stringify(['transfer', from.module, from.sourceId, from.recordId, to.module, to.sourceId, to.recordId]),
      from, to, reasons, score: (sameIdentifier ? 8 : 0) + (sourceMention ? 4 : 0) + (sharedWords ? 2 : 0) + (sameCategory ? 2 : 0) - distance }];
  })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
