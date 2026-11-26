import { parseCSV } from './csv';
import { readTabularXlsx } from './tabularXlsx';

export const STATEMENT_FILE_ACCEPT = '.pdf,.csv,.tsv,.txt,.xlsx,.xlsm,.html,.htm,.json';
export const STATEMENT_FILE_FORMATS = 'PDF, Excel, CSV, TSV, text, HTML, or JSON';

const aliases = {
  date: ['date', 'transaction date', 'posting date', 'value date', 'payment date'],
  description: ['description', 'details', 'narration', 'particulars', 'memo'],
  amount: ['amount', 'transaction amount', 'net amount', 'signed amount', 'payment amount'],
  category: ['category', 'transaction category'],
};

export function suggestStatementColumn(headers: string[], field: keyof typeof aliases): string {
  const matches = headers.filter(header => aliases[field].includes(
    header.replace(/ \(column \d+\)+$/, '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' '),
  ));
  return matches.length === 1 ? matches[0] : '';
}

function readDelimited(text: string, extension: string): string[][] {
  if (extension === 'tsv') return parseCSV(text, '\t');
  const choices = [',', '\t', ';', '|'].map(delimiter => parseCSV(text, delimiter));
  const consistent = choices.filter(rows => {
    const width = rows[0]?.length ?? 0;
    return width > 1 && rows.length > 1 && rows.slice(1, 20).every(row => row.length === width);
  });
  if (consistent.length === 1) return consistent[0];
  if (extension === 'csv') return choices[0];
  throw new Error('Could not identify the text columns. Use a header and a consistent delimiter, or save the file as CSV.');
}

function readJson(text: string): string[][] {
  const rows: unknown = JSON.parse(text);
  if (!Array.isArray(rows) || !rows.length || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('JSON statements must contain an array of transaction objects.');
  }
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return [headers, ...rows.map(row => headers.map(header => {
    const value: unknown = Object.hasOwn(row, header) ? row[header] : null;
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    throw new Error('JSON statement fields must be text, numbers, or booleans.');
  }))];
}

export async function readStatementImportFile(file: File): Promise<string[][]> {
  if (file.size > 10_000_000) throw new Error('Statement is too large (maximum 10 MB).');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  let rows: string[][];
  switch (extension) {
    case 'pdf': {
      const { readBankStatementPdf } = await import('./bankStatementPdf');
      rows = await readBankStatementPdf(file);
      break;
    }
    case 'xlsx':
    case 'xlsm': {
      const { sheets, dateSystem } = readTabularXlsx(new Uint8Array(await file.arrayBuffer()));
      const populated = sheets.filter(sheet => sheet.rows.filter(row => row.some(cell => cell.trim())).length > 1);
      if (populated.length !== 1) throw new Error('Save the statement worksheet as its own workbook or CSV and try again.');
      rows = populated[0].rows.filter(row => row.some(cell => cell.trim()));
      const dateHeader = suggestStatementColumn(rows[0], 'date');
      const dateIndex = dateHeader ? rows[0].indexOf(dateHeader) : -1;
      for (const row of rows.slice(1)) {
        const value = row[dateIndex]?.trim();
        if (!value || !/^\d+(?:\.\d+)?$/.test(value)) continue;
        const serial = Math.floor(Number(value));
        if (serial < (dateSystem === '1904' ? 0 : 1) || serial > 2_957_000 || (dateSystem === '1900' && serial === 60)) {
          throw new Error('A workbook date is invalid. Format the date column as YYYY-MM-DD text and try again.');
        }
        const epoch = dateSystem === '1904' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, serial < 60 ? 31 : 30);
        row[dateIndex] = new Date(epoch + serial * 86_400_000).toISOString().slice(0, 10);
      }
      break;
    }
    case 'html':
    case 'htm': {
      const doc = document.implementation.createHTMLDocument();
      const template = doc.createElement('template');
      template.innerHTML = await file.text();
      const tables = [...template.content.querySelectorAll('table')].filter(table => !table.querySelector('table') && table.rows.length > 1);
      if (tables.length !== 1) throw new Error('Save the statement table as its own HTML or CSV file and try again.');
      if ([...tables[0].querySelectorAll('td, th')].some(cell => {
        const tableCell = cell as HTMLTableCellElement;
        return tableCell.colSpan !== 1 || tableCell.rowSpan !== 1;
      })) throw new Error('Save tables with merged cells as CSV before importing.');
      template.content.querySelectorAll('script, style').forEach(element => element.remove());
      rows = [...tables[0].rows].map(row => [...row.cells].map(cell => cell.textContent?.trim() ?? ''));
      break;
    }
    case 'json':
      rows = readJson(await file.text());
      break;
    case 'csv':
    case 'tsv':
    case 'txt':
      rows = readDelimited(await file.text(), extension);
      break;
    default:
      throw new Error(`Choose a statement in one of these formats: ${STATEMENT_FILE_FORMATS}.`);
  }
  const [header, ...body] = rows.filter(row => row.some(cell => cell.trim()));
  if (!header || !body.length) throw new Error('Could not find any data rows in that file.');
  const width = body.reduce((maximum, row) => Math.max(maximum, row.length), header.length);
  if (width > 256 || body.length * width > 500_000) throw new Error('Statement table has too many cells.');
  const labels = Array.from({ length: width }, (_, index) => header[index]?.trim() || `Column ${index + 1}`);
  const used = new Set<string>();
  return [labels.map((label, index) => {
    let unique = label;
    while (used.has(unique)) unique += ` (column ${index + 1})`;
    used.add(unique);
    return unique;
  }), ...body];
}
