import { readTabularXlsx } from './tabularXlsx';
import { parseCSV } from './csv';
import type { Transaction, Transfer, Adjustment } from '../types/workbook';
import { QSE_TICKER_NAMES } from './stockData/qseSeed';

export type StatementRecord = (Transaction & { kind: 'trade' }) | (Transfer & { kind: 'transfer' }) | (Adjustment & { kind: 'adjustment' });
const brokerAliases: Record<string, string> = {
  vodafone: 'VFQS', 'qatar fuel': 'QFLS', mesaied: 'MPHC', mesaieed: 'MPHC',
  'techno q': 'TQES', 'rayyan b': 'MARK', qib: 'QIBK', 'lesha bank': 'QFBQ',
  'industries qatar': 'IQCD', gwc: 'GWCS', 'gulf warehousing company': 'GWCS',
  'qatar german med': 'QGMD', 'qatar german medical devices': 'QGMD',
  'qatar german for medical devices': 'QGMD', 'qatari german co for medical devices': 'QGMD',
};
const normalizeStock = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function stockResolver(catalog: Record<string, string>) {
  const entries = Object.entries({ ...QSE_TICKER_NAMES, ...catalog });
  const symbols = new Set([...entries.map(([ticker]) => ticker.toUpperCase()), ...Object.values(brokerAliases)]);
  const names = new Map<string, Set<string>>();
  for (const [name, ticker] of [...entries.map(([ticker, name]) => [name, ticker.toUpperCase()]), ...Object.entries(brokerAliases)]) {
    const key = normalizeStock(name);
    const matches = names.get(key) ?? new Set<string>();
    matches.add(ticker);
    names.set(key, matches);
  }
  return (unit: string) => {
    const lookup = (text: string) => symbols.has(text.trim().toUpperCase())
      ? new Set([text.trim().toUpperCase()]) : names.get(normalizeStock(text)) ?? new Set<string>();
    const exact = lookup(unit);
    if (exact.size === 1) return [...exact][0];
    if (exact.size > 1) return undefined;
    const parts = unit.split(/\s+[-–—]\s+|[()/|]/).map(part => part.trim()).filter(Boolean);
    if (!parts.some(part => symbols.has(part.toUpperCase()))) return undefined;
    const combined = new Set(parts.flatMap(part => [...lookup(part)]));
    return combined.size === 1 ? [...combined][0] : undefined;
  };
}

type StatementTrade = Extract<StatementRecord, { kind: 'trade' }>;
interface TradeConflict { existing: StatementTrade[]; message: string; }
interface StatementOptions { tickerNames?: Record<string, string>; reviewTrades?: boolean; }
export function readStatementXlsx(bytes: Uint8Array): string[][] {
  const workbook = readTabularXlsx(bytes);
  if (workbook.dateSystem !== '1900') throw new Error('Unsupported statement date system.');
  return workbook.sheets[0]?.rows ?? [];
}
export function parseTheGroupStatement(table: string[][], existing: StatementRecord[] = [], options: StatementOptions = {}) {
  const resolveStock = stockResolver(options.tickerNames ?? {});
  const header = table.findIndex(row => row[0]?.trim().toLowerCase() === 'date' && row[1]?.trim().toLowerCase() === 'type' && row[2]?.trim().toLowerCase() === 'count');
  if (header < 0) throw new Error('Expected The Group Cash statement columns: Date, Type, Count, Unit, Price, Amount.');
  const records: StatementRecord[] = [];
  const usedTransfers = new Set<StatementRecord>();
  const missingRewards: string[] = [];
  const numeric = (value: string | undefined) => Number((value ?? "").replace(/,/g, ""));
  for (const [index, row] of table.slice(header + 1).entries()) {
    if (!row[0]?.trim() || row[0] === 'ⓘ') continue;
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row[0].trim());
    if (!match) continue; // footer, not an event
    const date = `${match[3]}-${match[2]}-${match[1]}`;
    const parsedDate = new Date(date);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new Error(`Statement row ${header + index + 2}: invalid date.`);
    const type = row[1]?.trim().toLowerCase();
    if (options.reviewTrades && type !== 'buy' && type !== 'sell') continue;
    if (type === 'trading reward') {
      const known = existing.filter((r): r is Adjustment & { kind: 'adjustment' } => r.kind === 'adjustment' && r.date === date && /trading reward/i.test(r.note ?? ''));
      if (known.length) records.push(...known);
      else {
        const amount = numeric(row[5]);
        if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid reward on ${date}.`);
        missingRewards.push(`${date}: ${amount} QAR (rounded)`);
      }
      continue;
    }
    if (type === 'buy' || type === 'sell') {
      const unit = row[3]?.trim() ?? '';
      const ticker = resolveStock(unit);
      if (!ticker) throw new Error(`Unknown statement stock: ${unit}. No records were imported.`);
      const shares = numeric(row[2]), price = numeric(row[4]);
      if (!Number.isFinite(shares) || !Number.isFinite(price) || !(shares > 0) || !(price > 0)) throw new Error(`Invalid shares/price on statement row ${header + index + 2}.`);
      records.push({ kind: 'trade', date, ticker, action: type === 'buy' ? 'BUY' : 'SELL', shares, price, timezone: 'Asia/Qatar' });
    } else if (type === 'swift tr. from' || type === 'electronic transfer') {
      const details = table.slice(header + index + 2, header + index + 4);
      const grossRow = details.find(detail => !detail[0] && detail[1]?.trim().toLowerCase() === 'swift tr. from');
      const feeRow = details.find(detail => !detail[0] && detail[1]?.trim().toLowerCase() === 'electronic transfer');
      const known = existing.filter((r): r is Transfer & { kind: 'transfer' } => r.kind === 'transfer' && r.date === date && r.type === 'DEPOSIT' && !usedTransfers.has(r));
      if (grossRow && feeRow) {
        const gross = numeric(grossRow[5]), fee = Math.abs(numeric(feeRow[5]));
        if (!Number.isFinite(gross) || !(gross > 0) || !Number.isFinite(fee) || fee > gross) throw new Error(`Invalid transfer breakdown on ${date}.`);
        const match = known.find(r => r.gross === gross || Number.isInteger(gross) && Math.round(r.gross) === gross);
        if (known.length && !match) throw new Error(`The rounded statement deposit on ${date} differs from the existing gross. Review exact amounts using Modify.`);
        if (match) usedTransfers.add(match);
        records.push({ ...match, id: match?.id ?? crypto.randomUUID(), kind: 'transfer', date, type: 'DEPOSIT', gross: match?.gross ?? gross, fee: match?.fee ?? fee, description: match?.description || row[1], timezone: match?.timezone || 'Asia/Qatar' });
      } else if (known.length === 1) { records.push(known[0]); usedTransfers.add(known[0]); }
      else throw new Error(`Deposit on ${date} needs its gross/fee breakdown. Import exact transfer CSV records first.`);
    } else throw new Error(`Unsupported statement event: ${row[1]}. No records were imported.`);
  }
  if (!records.length) throw new Error('The statement contains no supported records.');
  // Reconcile quantities without moving separated same-price fills across sells.
  // Corrections keep stable IDs so transfer/lot links survive repeated imports.
  const trades = existing.filter((r): r is Transaction & { kind: 'trade' } => r.kind === 'trade' && !r.isPending);
  const tickerOf = (r: Transaction) => resolveStock(r.ticker) ?? r.ticker;
  const key = (r: Transaction) => JSON.stringify([r.date, tickerOf(r), r.action, r.price]);
  const groups = new Map<string, Array<Transaction & { kind: 'trade' }>>();
  for (const row of records) if (row.kind === 'trade') groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  const total = (list: Transaction[]) => list.reduce((sum, r) => sum + r.shares, 0);
  const replacements = new Map<StatementRecord, StatementRecord[]>();
  const used = new Set<StatementRecord>();
  const priceCorrections: string[] = [];
  const conflicts = new Map<StatementRecord, TradeConflict>();
  const markConflict = (group: StatementTrade[], matches: StatementTrade[], message: string) => {
    if (!options.reviewTrades) throw new Error(message);
    for (const row of group) conflicts.set(row, { existing: matches, message });
  };
  for (const [k, group] of groups) {
    const first = group[0];
    let matches = trades.filter(r => key(r) === k && !used.has(r));
    if (!matches.length) {
      // Only a unique same-day, same-size candidate can be a price correction.
      const candidates = trades.filter(r => !used.has(r) && r.date === first.date && tickerOf(r) === first.ticker && r.action === first.action && !groups.has(key(r)));
      const shares = total(group);
      const ambiguousPrice = options.reviewTrades && [...groups.values()].some(other => other !== group &&
        other[0].date === first.date && other[0].ticker === first.ticker && other[0].action === first.action &&
        total(other) === shares && !trades.some(trade => key(trade) === key(other[0])));
      if (candidates.length === 1 && candidates[0].shares === shares && !ambiguousPrice) {
        matches = [{ ...candidates[0], price: first.price }];
        used.add(candidates[0]);
        priceCorrections.push(`${first.ticker} ${first.date}: ${candidates[0].price} → ${first.price} (${shares} shares)`);
      } else {
        if (candidates.length) {
          markConflict(group, candidates, `Existing ${first.ticker} trades on ${first.date} need manual price or quantity reconciliation.`);
          continue;
        }
        const nearby = trades.filter(r => r.date !== first.date && tickerOf(r) === first.ticker && r.action === first.action && r.price === first.price && group.length === 1 && r.shares === first.shares && Math.abs(Date.parse(r.date) - Date.parse(first.date)) <= 3 * 86400000);
        if (nearby.length) markConflict(group, nearby, `A similar ${first.ticker} trade has a different date. Correct it with Modify before importing this trade.`);
        if (options.reviewTrades && !nearby.length) {
          const pending = existing.filter((row): row is StatementTrade => row.kind === 'trade' && !!row.isPending && key(row) === k);
          if (pending.length) markConflict(group, pending, `A pending ${first.ticker} trade matches this date, side and price. Review its settlement with Modify.`);
        }
        continue;
      }
    }
      if (options.reviewTrades && group.length === 1 && matches.length === 1 && matches[0].id) {
      replacements.set(first, [{ ...matches[0], ticker: first.ticker, shares: first.shares }]);
      used.add(matches[0]);
      continue;
    }
    const available = [...matches];
    const exact = group.map(row => {
      const index = available.findIndex(r => r.shares === row.shares);
      return index < 0 ? undefined : available.splice(index, 1)[0];
    });
    if (Math.abs(total(matches) - total(group)) > 1e-7) {
      if (options.reviewTrades) {
        group.forEach((row, i) => {
          if (exact[i]) replacements.set(row, [exact[i]]);
        });
        matches.forEach(row => used.add(row));
        if (!available.length || exact.every(Boolean)) continue;
        markConflict(group.filter((_, i) => !exact[i]), available, `Overlapping fills for ${first.ticker} on ${first.date}: existing and statement quantities differ.`);
      } else {
        markConflict(group, matches, `Overlapping fills for ${first.ticker} on ${first.date}: existing and statement quantities differ.`);
      }
      continue;
    }
    if (exact.every(Boolean)) {
      group.forEach((row, i) => replacements.set(row, [exact[i]!]));
    } else {
      const from = records.indexOf(first), to = records.indexOf(group[group.length - 1]);
      if (records.slice(from, to + 1).some(r => r.kind === 'trade' && tickerOf(r) === first.ticker && key(r) !== k)) {
        markConflict(group, matches, `Combined ${first.ticker} fills cross other trades on ${first.date}. Split them with Modify to preserve cost basis.`);
        continue;
      }
      replacements.set(first, matches);
      group.slice(1).forEach(row => replacements.set(row, []));
    }
    matches.forEach(row => used.add(row));
  }
  const counters = new Map<string, number>();
  const pendingConflicts: Record<number, TradeConflict> = {};
  const reconciled = records.flatMap(row => replacements.get(row) ?? [row]).map((row, index) => {
    const conflict = conflicts.get(row);
    if (conflict) pendingConflicts[index] = conflict;
    if (row.kind === 'trade') row = { ...row, ticker: tickerOf(row) };
    const accountingOrder = (counters.get(row.date) ?? 0) + 1;
    counters.set(row.date, accountingOrder);
    return { ...row, accountingOrder };
  });
  return { records: reconciled, conflicts: pendingConflicts, warning: `Statement order is retained. ${priceCorrections.length} uniquely matched trade prices corrected.${priceCorrections.length ? " " + priceCorrections.join("; ") + "." : ""} Cash amounts and commissions in this export are rounded to whole riyals: trade values use quantity × price and configured fees (existing fee overrides are retained). ${missingRewards.length} missing rounded reward rows excluded; existing exact rewards are retained.${missingRewards.length ? " Review missing rewards using exact records: " + missingRewards.join("; ") + "." : ""} Verify cash against an exact broker record; a zero rounded reward cannot recover its fractional value.` };
}
export const parseTheGroupCsv = (text: string, existing?: StatementRecord[]) => parseTheGroupStatement(parseCSV(text), existing);
