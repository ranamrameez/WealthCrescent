import { strFromU8, unzipSync } from 'fflate';
import { parseCSV } from './csv';
import type { Transaction, Transfer } from '../types/workbook';
import { QSE_TICKER_NAMES } from './stockData/qseSeed';

export type StatementRecord = (Transaction & { kind: 'trade' }) | (Transfer & { kind: 'transfer' });
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
  let skippedRewards = 0;
  for (const [index, row] of table.slice(header + 1).entries()) {
    if (!row[0]?.trim() || row[0] === 'ⓘ') continue;
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row[0].trim());
    if (!match) continue; // footer, not an event
    const date = `${match[3]}-${match[2]}-${match[1]}`;
    const parsedDate = new Date(date);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new Error(`Statement row ${header + index + 2}: invalid date.`);
    const type = row[1]?.trim().toLowerCase();
    if (type === 'trading reward') { skippedRewards++; continue; }
    if (type === 'buy' || type === 'sell') {
      const unit = row[3]?.trim() ?? '';
      const ticker = tickers[unit.toLowerCase()] ?? (Object.values(tickers).includes(unit.toUpperCase()) ? unit.toUpperCase() : undefined);
      if (!ticker) throw new Error(`Unknown statement stock: ${unit}. No records were imported.`);
      const shares = Number(row[2]), price = Number(row[4]);
      if (!(shares > 0) || !(price > 0)) throw new Error(`Invalid shares/price on statement row ${header + index + 2}.`);
      records.push({ kind: 'trade', date, ticker, action: type === 'buy' ? 'BUY' : 'SELL', shares, price, timezone: 'Asia/Qatar' });
    } else if (type === 'swift tr. from' || type === 'electronic transfer') {
      const details = table.slice(header + index + 2, header + index + 4);
      const grossRow = details.find(detail => !detail[0] && detail[1]?.trim().toLowerCase() === 'swift tr. from');
      const feeRow = details.find(detail => !detail[0] && detail[1]?.trim().toLowerCase() === 'electronic transfer');
      const known = existing.filter((r): r is Transfer & { kind: 'transfer' } => r.kind === 'transfer' && r.date === date && r.type === 'DEPOSIT');
      if (known.length > 1) throw new Error(`Multiple deposits on ${date} need manual reconciliation.`);
      if (grossRow && feeRow) {
        const gross = Number(grossRow[5]), fee = Math.abs(Number(feeRow[5]));
        if (!(gross > 0) || !Number.isFinite(fee) || fee > gross) throw new Error(`Invalid transfer breakdown on ${date}.`);
        if (known.length && known[0].gross !== gross) throw new Error(`The rounded statement deposit on ${date} differs from the existing gross. Review exact amounts using Modify.`);
        records.push({ ...known[0], kind: 'transfer', date, type: 'DEPOSIT', gross, fee, description: known[0]?.description || row[1], timezone: known[0]?.timezone || 'Asia/Qatar' });
      } else if (known.length === 1) records.push(known[0]);
      else throw new Error(`Deposit on ${date} needs its gross/fee breakdown. Import exact transfer CSV records first.`);
    } else throw new Error(`Unsupported statement event: ${row[1]}. No records were imported.`);
  }
  if (!records.length) throw new Error('The statement contains no supported records.');
  // Preserve combined fills already recorded in the app; never double-count them.
  const key = (r: Transaction) => JSON.stringify([r.date, r.ticker, r.action, r.price]);
  const grouped = new Map<string, StatementRecord[]>();
  for (const row of records) { const k = row.kind === 'trade' ? key(row) : row.id!; grouped.set(k, [...(grouped.get(k) ?? []), row]); }
  const reconciled = [...grouped.values()].flatMap(group => {
    const row = group[0]; if (row.kind !== 'trade') return group;
    const matches = existing.filter((r): r is Transaction & { kind: 'trade' } => r.kind === 'trade' && key(r) === key(row));
    if (!matches.length) {
      const near = existing.some(r => r.kind === 'trade' && r.action === row.action && r.ticker === row.ticker && r.price === row.price && group.length === 1 && r.shares === row.shares && Math.abs(Date.parse(r.date) - Date.parse(row.date)) <= 3 * 86400000);
      if (near) throw new Error(`A similar ${row.ticker} trade has a different date. Correct that record with Modify or the ID-based correction CSV before importing this statement.`);
      return group;
    }
    const quantity = (list: StatementRecord[]) => list.reduce((sum, r) => sum + (r.kind === 'trade' ? r.shares : 0), 0);
    if (Math.abs(quantity(matches) - quantity(group)) > 1e-7) throw new Error(`Overlapping fills for ${row.ticker} on ${row.date} need review. Existing and statement quantities differ.`);
    return matches;
  });
  return { records: reconciled, warning: `This statement stores whole-riyal cash values. Transfer gross/fees use the statement breakdown; verify their precision. ${skippedRewards} rounded reward rows are excluded; existing exact rewards are retained. Add missing rewards from exact records.` };
}
export const parseTheGroupCsv = (text: string, existing?: StatementRecord[]) => parseTheGroupStatement(parseCSV(text), existing);
