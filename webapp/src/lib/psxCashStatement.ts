import { parseCSV } from './csv';
import { readTabularXlsx } from './tabularXlsx';
import type { Transfer } from '../types/workbook';

export type CashTransferSource = Pick<Transfer, 'date' | 'type' | 'gross' | 'description' | 'time' | 'timezone'> & {
  sourceId: string;
  fee?: number;
  brokerId?: string;
  currencyCode?: string;
  accountName?: string;
  linkedTransferId?: string;
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/^\uFEFF/, '');
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function statementDate(value: string, dateSystem?: '1900' | '1904') {
  const named = /^([a-z]{3})\s+(\d{1,2}),\s*(\d{4})$/i.exec(value);
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  const serial = dateSystem && /^\d+(?:\.\d+)?$/.test(value) ? Math.floor(Number(value)) : NaN;
  const iso = named ? [named[3], String(months.indexOf(named[1].toLowerCase()) + 1).padStart(2, '0'), named[2].padStart(2, '0')].join('-')
    : numeric ? [numeric[3], numeric[2].padStart(2, '0'), numeric[1].padStart(2, '0')].join('-')
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
    for (const [index, row] of table.slice(headerAt + 1).entries()) {
      const get = (key: string) => row[headers.indexOf(key)]?.trim() ?? '';
      const description = get('description');
      const direction = get('type').toUpperCase();
      if (explicit ? !direction || direction === 'TYPE' : !cashNarration.test(description)) continue;
      try {
        if (explicit && direction !== 'DEPOSIT' && direction !== 'WITHDRAWAL') throw new Error('Expected DEPOSIT or WITHDRAWAL.');
        const credit = explicit ? 0 : amount(get('credit'));
        const debit = explicit ? 0 : amount(get('debit'));
        if (!explicit && (credit > 0) === (debit > 0)) throw new Error('Expected a debit or a credit.');
        const type = explicit ? direction as Transfer['type'] : credit ? 'DEPOSIT' : 'WITHDRAWAL';
        const gross = explicit ? amount(get('gross')) : credit || debit;
        const fee = explicit && get('fee') ? amount(get('fee')) : undefined;
        if (gross <= 0 || (type === 'DEPOSIT' && fee !== undefined && fee > gross)) throw new Error('Invalid gross amount or fee.');
        const date = statementDate(get('date'), dateSystem);
        const key = explicit && get('id') ? JSON.stringify(['id', get('id')]) : JSON.stringify([date, type, gross, description.toLowerCase().replace(/\s+/g, ' ')]);
        const occurrence = (occurrences.get(key) ?? 0) + 1;
        if (explicit && get('id') && occurrence > 1) throw new Error('Duplicate transfer ID.');
        occurrences.set(key, occurrence);
        records.push({ date, type, gross, fee, description, brokerId: get('brokerid') || undefined,
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
  if (file.size > 10_000_000) throw new Error('Statement is too large (maximum 10 MB).');
  if (/\.xlsx$/i.test(file.name)) {
    const { sheets, dateSystem } = readTabularXlsx(new Uint8Array(await file.arrayBuffer()));
    return parsePsxCashStatement(sheets.map(sheet => sheet.rows), dateSystem);
  }
  const text = await file.text();
  if (!/<table(?:\s|>)/i.test(text)) return parsePsxCashStatement([parseCSV(text)]);
  // Template content stays inert and is never inserted into the page.
  const template = document.createElement('template');
  template.innerHTML = text;
  const tables = Array.from(template.content.querySelectorAll('table'), table =>
    Array.from(table.rows, row => Array.from(row.cells, cell => cell.textContent ?? '')));
  return parsePsxCashStatement(tables);
}
