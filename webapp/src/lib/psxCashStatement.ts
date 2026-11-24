import { parseCSV } from './csv';
import { readTabularXlsx } from './tabularXlsx';
import type { Transfer } from '../types/workbook';

export type CashTransferSource = Pick<Transfer, 'date' | 'type' | 'gross' | 'description' | 'time' | 'timezone'> & {
  sourceId: string;
  fee?: number;
  grossDecimals?: number;
  feeDecimals?: number;
  brokerId?: string;
  currencyCode?: string;
  accountName?: string;
  linkedTransferId?: string;
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/^\uFEFF/, '');
const numericDate = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
type DateOrder = 'day-first' | 'month-first';
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function statementDate(value: string, dateSystem?: '1900' | '1904', order?: DateOrder) {
  const named = /^([a-z]{3})\s+(\d{1,2}),\s*(\d{4})$/i.exec(value);
  const numeric = numericDate.exec(value);
  if (numeric && !order && Number(numeric[1]) !== Number(numeric[2])) {
    throw new Error('Ambiguous numeric date. Use YYYY-MM-DD dates or include an unambiguous date in the same format.');
  }
  const serial = dateSystem && /^\d+(?:\.\d+)?$/.test(value) ? Math.floor(Number(value)) : NaN;
  const iso = named ? [named[3], String(months.indexOf(named[1].toLowerCase()) + 1).padStart(2, '0'), named[2].padStart(2, '0')].join('-')
    : numeric ? [numeric[3], numeric[order === 'month-first' ? 1 : 2].padStart(2, '0'), numeric[order === 'month-first' ? 2 : 1].padStart(2, '0')].join('-')
    : serial >= 1 && serial <= 2_958_000
      ? new Date(Date.UTC(dateSystem === '1904' ? 1904 : 1899, dateSystem === '1904' ? 0 : 11, dateSystem === '1904' ? 1 : serial < 60 ? 31 : 30) + serial * 86400000).toISOString().slice(0, 10)
      : value;
  const parsed = new Date(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== iso) {
    throw new Error('Invalid transfer date.');
  }
  return iso;
}

function amount(value: string) {
  if (!value || value === '-') return 0;
  const number = Number(value.replace(/,/g, ''));
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value) || !Number.isFinite(number)) throw new Error('Invalid transfer amount.');
  return number;
}

const cashNarration = /^(?:funds? transfer\b|(?:cash|bank) (?:deposit|withdrawal)\b|(?:deposit|withdrawal)\b|(?:bank|cash|online|cheque) (?:receipt|payment)\b)/i;

const chargeNarration = /\b(?:fees?|charges?|commission|tax)\b/i;
const isCashNarration = (description: string) => cashNarration.test(description) && !chargeNarration.test(description);

export function inferDateOrder(dates: string[]): DateOrder | undefined {
  const orders = new Set<DateOrder>();
  for (const date of dates) {
    const parts = numericDate.exec(date);
    if (!parts) continue;
    if (Number(parts[1]) > 12) orders.add('day-first');
    if (Number(parts[2]) > 12) orders.add('month-first');
  }
  if (orders.size > 1) throw new Error('Mixed numeric date formats. Convert dates to YYYY-MM-DD and try again.');
  return orders.values().next().value;
}

export function parsePsxCashStatement(tables: string[][][], dateSystem?: '1900' | '1904'): CashTransferSource[] {
  const occurrences = new Map<string, number>();
  const records: CashTransferSource[] = [];
  let foundHeader = false;
  for (const table of tables) {
    const headerAt = table.findIndex(row => {
      const keys = row.map(normalizeHeader);
      return keys.includes('date') && (['debit', 'credit', 'description'].every(key => keys.includes(key)) ||
        ['type', 'gross'].every(key => keys.includes(key)));
    });
    if (headerAt < 0) continue;
    foundHeader = true;
    const headers = table[headerAt].map(normalizeHeader);
    const explicit = headers.includes('type') && headers.includes('gross');
    const data = table.slice(headerAt + 1);
    const dateColumn = headers.indexOf('date');
    const descriptionColumn = headers.indexOf('description');
    const order = inferDateOrder(data.filter(row => explicit || isCashNarration(row[descriptionColumn]?.trim() ?? ''))
      .map(row => row[dateColumn]?.trim() ?? ''));
    for (const [index, row] of data.entries()) {
      const get = (key: string) => row[headers.indexOf(key)]?.trim() ?? '';
      const description = get('description');
      const direction = get('type').toUpperCase();
      if (explicit ? !direction || direction === 'TYPE' : !isCashNarration(description)) continue;
      try {
        if (explicit && direction !== 'DEPOSIT' && direction !== 'WITHDRAWAL') throw new Error('Expected DEPOSIT or WITHDRAWAL.');
        const credit = explicit ? 0 : amount(get('credit'));
        const debit = explicit ? 0 : amount(get('debit'));
        if (!explicit && (credit > 0) === (debit > 0)) throw new Error('Expected a debit or a credit.');
        const type = explicit ? direction as Transfer['type'] : credit ? 'DEPOSIT' : 'WITHDRAWAL';
        const grossText = get(explicit ? 'gross' : credit ? 'credit' : 'debit');
        const feeText = explicit ? get('fee') : '';
        const gross = explicit ? amount(grossText) : credit || debit;
        const fee = feeText ? amount(feeText) : undefined;
        const decimals = (value: string) => value.split('.')[1]?.length ?? 0;
        if (gross <= 0 || (type === 'DEPOSIT' && fee !== undefined && fee > gross)) throw new Error('Invalid gross amount or fee.');
        const date = statementDate(get('date'), dateSystem, order);
        const reference = get('id') || get('reference');
        const balance = get('balance').replace(/[,\s]/g, '');
        const time = get('time') || undefined;
        const timezone = get('timezone') || undefined;
        const key = reference ? JSON.stringify(['id', reference]) : JSON.stringify([date, type, gross,
          description.toLowerCase().replace(/\s+/g, ' '), balance, time, timezone]);
        const occurrence = (occurrences.get(key) ?? 0) + 1;
        if (reference && occurrence > 1) throw new Error('Duplicate transfer ID.');
        occurrences.set(key, occurrence);
        records.push({ date, type, gross, fee,
          grossDecimals: dateSystem ? undefined : decimals(grossText),
          feeDecimals: fee === undefined || dateSystem ? undefined : decimals(feeText),
          description: description || undefined, time, timezone, brokerId: get('brokerid') || undefined,
          currencyCode: get('currencycode') || undefined, sourceId: `statement:${key}:${occurrence}` });
      } catch (error) {
        throw new Error(`Statement row ${headerAt + index + 2}. ${(error as Error).message}`);
      }
    }
  }
  if (!foundHeader) throw new Error('Expected Date, Description, Debit and Credit columns, or a transfer export with Date, Type and Gross.');
  if (!records.length) throw new Error('No cash deposits or withdrawals found.');
  return records;
}

export async function readPsxCashStatement(file: File) {
  const { tables, dateSystem } = await readPsxBrokerTables(file);
  return parsePsxCashStatement(tables, dateSystem);
}

export async function readPsxBrokerTables(file: File): Promise<{ tables: string[][][]; dateSystem?: '1900' | '1904' }> {
  if (file.size > 10_000_000) throw new Error('Statement is too large (maximum 10 MB).');
  if (/\.xlsx$/i.test(file.name)) {
    const { sheets, dateSystem } = readTabularXlsx(new Uint8Array(await file.arrayBuffer()));
    return { tables: sheets.map(sheet => sheet.rows), dateSystem };
  }
  const text = await file.text();
  if (/\.csv$/i.test(file.name) || !/<table(?:\s|>)/i.test(text)) return { tables: [parseCSV(text)] };
  // Parse text into an inert syntax tree without invoking browser DOM sinks.
  const { parseFragment } = await import('parse5');
  const fragment = parseFragment(text);
  type Node = (typeof fragment.childNodes)[number];
  const children = (node: Node) => 'childNodes' in node ? node.childNodes : [];
  const findTables = (nodes: Node[]): Node[] => nodes.flatMap(node => {
    const nested = findTables(children(node));
    return 'tagName' in node && node.tagName === 'table' ? [node, ...nested] : nested;
  });
  const hasTag = (node: Node, tags: string[]) => 'tagName' in node && tags.includes(node.tagName);
  const plainText = (node: Node): string => {
    if ('tagName' in node && ['script', 'style', 'template', 'table'].includes(node.tagName)) return '';
    return 'value' in node ? node.value : children(node).map(plainText).join('');
  };
  const tables = findTables(fragment.childNodes).map(table =>
    children(table)
      .flatMap(node => hasTag(node, ['thead', 'tbody', 'tfoot']) ? children(node) : [node])
      .filter(row => hasTag(row, ['tr']))
      .map(row => children(row).filter(cell => hasTag(cell, ['td', 'th'])).map(plainText)));
  return { tables };
}
