import { strFromU8, unzipSync } from 'fflate';
import { parseCSV } from './csv';
import type { Transaction, Transfer, Adjustment } from '../types/workbook';
import { QSE_TICKER_NAMES } from './stockData/qseSeed';

export type StatementRecord = (Transaction & { kind: 'trade' }) | (Transfer & { kind: 'transfer' }) | (Adjustment & { kind: 'adjustment' });
const tickers: Record<string, string> = {
  ...Object.fromEntries(Object.entries(QSE_TICKER_NAMES).map(([ticker, name]) => [name.toLowerCase(), ticker])),
  vodafone: 'VFQS', 'qatar fuel': 'QFLS', mesaied: 'MPHC', mesaieed: 'MPHC',
  'techno q': 'TQES', 'rayyan b': 'MARK', qib: 'QIBK', 'lesha bank': 'QFBQ',
  'industries qatar': 'IQCD',
};
function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid statement XML.');
  return doc;
}
const elements = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS('*', tag));
export function readStatementXlsx(bytes: Uint8Array): string[][] {
  if (bytes.length > 10_000_000) throw new Error('Statement is too large (maximum 10 MB).');
  let total = 0;
  const files = unzipSync(bytes, { filter: entry => {
    if (entry.name.endsWith('.xml')) { total += entry.originalSize; if (total > 30_000_000) throw new Error('Expanded statement is too large.'); return true; }
    return false;
  } });
  const read = (path: string) => files[path] ? xml(strFromU8(files[path])) : null;
  const strings = read('xl/sharedStrings.xml');
  const shared = strings ? elements(strings, 'si').map(si => elements(si, 't').map(t => t.textContent ?? '').join('')) : [];
  // The Group exports its Cash statement as the first worksheet.
  const sheet = read('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('The workbook has no Cash worksheet.');
  return elements(sheet, 'row').map(row => {
    const cells: string[] = [];
    for (const cell of elements(row, 'c')) {
      const letters = (cell.getAttribute('r') ?? '').replace(/\d/g, '');
      const index = [...letters].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1;
      if (index < 0) continue;
      const value = elements(cell, 'v')[0]?.textContent ?? '';
      cells[index] = cell.getAttribute('t') === 's' ? value === '' ? '' : shared[Number(value)] ?? '' : cell.getAttribute('t') === 'inlineStr' ? elements(cell, 't').map(t => t.textContent).join('') : value;
    }
    return cells;
  });
}
export function parseTheGroupStatement(table: string[][], existing: StatementRecord[] = []) {
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
      const ticker = tickers[unit.toLowerCase()] ?? (Object.values(tickers).includes(unit.toUpperCase()) ? unit.toUpperCase() : undefined);
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
  const key = (r: Transaction) => JSON.stringify([r.date, r.ticker, r.action, r.price]);
  const groups = new Map<string, Array<Transaction & { kind: 'trade' }>>();
  for (const row of records) if (row.kind === 'trade') groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  const replacements = new Map<StatementRecord, StatementRecord[]>();
  const used = new Set<StatementRecord>();
  const priceCorrections: string[] = [];
  for (const [k, group] of groups) {
    const first = group[0];
    let matches = trades.filter(r => key(r) === k && !used.has(r));
    if (!matches.length) {
      // Only a unique same-day, same-size candidate can be a price correction.
      const candidates = trades.filter(r => !used.has(r) && r.date === first.date && r.ticker === first.ticker && r.action === first.action && !groups.has(key(r)));
      const total = group.reduce((sum, r) => sum + r.shares, 0);
      if (candidates.length === 1 && candidates[0].shares === total && !groups.has(key(candidates[0]))) {
        matches = [{ ...candidates[0], price: first.price }];
        used.add(candidates[0]);
        priceCorrections.push(`${first.ticker} ${first.date}: ${candidates[0].price} → ${first.price} (${total} shares)`);
      } else {
        if (candidates.length) throw new Error(`Unmatched existing ${first.ticker} trades on ${first.date} need manual price/quantity reconciliation before import.`);
        const near = trades.some(r => r.date !== first.date && r.ticker === first.ticker && r.action === first.action && r.price === first.price && group.length === 1 && r.shares === first.shares && Math.abs(Date.parse(r.date) - Date.parse(first.date)) <= 3 * 86400000);
        if (near) throw new Error(`A similar ${first.ticker} trade has a different date. Correct that record with Modify or the ID-based correction CSV before importing this statement.`);
        continue;
      }
    }
    const total = (list: Transaction[]) => list.reduce((sum, r) => sum + r.shares, 0);
    if (Math.abs(total(matches) - total(group)) > 1e-7) throw new Error(`Overlapping fills for ${first.ticker} on ${first.date} need review. Existing and statement quantities differ.`);
    const available = [...matches];
    const exact = group.map(row => {
      const index = available.findIndex(r => r.shares === row.shares);
      return index < 0 ? undefined : available.splice(index, 1)[0];
    });
    if (exact.every(Boolean)) {
      group.forEach((row, i) => replacements.set(row, [exact[i]!]));
    } else {
      const from = records.indexOf(first), to = records.indexOf(group[group.length - 1]);
      if (records.slice(from, to + 1).some(r => r.kind === 'trade' && r.ticker === first.ticker && key(r) !== k)) {
        throw new Error(`Combined ${first.ticker} fills cross other trades on ${first.date}. Split them with Modify before importing to preserve cost basis.`);
      }
      replacements.set(first, matches);
      group.slice(1).forEach(row => replacements.set(row, []));
    }
    matches.forEach(row => used.add(row));
  }
  const counters = new Map<string, number>();
  const reconciled = records.flatMap(row => replacements.get(row) ?? [row]).map(row => {
    const accountingOrder = (counters.get(row.date) ?? 0) + 1;
    counters.set(row.date, accountingOrder);
    return { ...row, accountingOrder };
  });
  return { records: reconciled, warning: `Statement order is retained. ${priceCorrections.length} uniquely matched trade prices corrected.${priceCorrections.length ? " " + priceCorrections.join("; ") + "." : ""} Cash amounts and commissions in this export are rounded to whole riyals: trade values use quantity × price and configured fees (existing fee overrides are retained). ${missingRewards.length} missing rounded reward rows excluded; existing exact rewards are retained.${missingRewards.length ? " Review missing rewards using exact records: " + missingRewards.join("; ") + "." : ""} Verify cash against an exact broker record; a zero rounded reward cannot recover its fractional value.` };
}
export const parseTheGroupCsv = (text: string, existing?: StatementRecord[]) => parseTheGroupStatement(parseCSV(text), existing);
