import { strFromU8, unzipSync } from 'fflate';

const elements = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS('*', tag));
/** Read cached values only; never evaluate workbook formulas or external links. */
export function readTabularXlsx(bytes: Uint8Array) {
  if (bytes.length > 10_000_000) throw new Error('Workbook is too large (maximum 10 MB).');
  let expanded = 0;
  const files = unzipSync(bytes, { filter: entry => {
    if (!entry.name.endsWith('.xml') && !entry.name.endsWith('.rels')) return false;
    expanded += entry.originalSize;
    if (expanded > 30_000_000) throw new Error('Expanded workbook is too large.');
    return true;
  } });
  const read = (path: string) => {
    if (!files[path]) return null;
    const doc = new DOMParser().parseFromString(strFromU8(files[path]), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid workbook XML.');
    return doc;
  };
  const sharedXml = read('xl/sharedStrings.xml');
  const shared = sharedXml ? elements(sharedXml, 'si').map(si => elements(si, 't').map(t => t.textContent ?? '').join('')) : [];
  const workbook = read('xl/workbook.xml'), relationships = read('xl/_rels/workbook.xml.rels');
  const targets = new Map(relationships ? elements(relationships, 'Relationship').map(row => [row.getAttribute('Id'), row.getAttribute('Target') ?? '']) : []);
  const sheets = workbook ? elements(workbook, 'sheet').map(sheet => {
    const target = targets.get(sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')) ?? '';
    return { name: sheet.getAttribute('name') ?? 'Sheet', path: target.startsWith('/xl/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}` };
  }) : [{ name: 'Sheet 1', path: 'xl/worksheets/sheet1.xml' }];
  const date1904 = workbook ? ['1', 'true'].includes(elements(workbook, 'workbookPr')[0]?.getAttribute('date1904') ?? '') : false;
  let cellsRead = 0;
  return { dateSystem: date1904 ? '1904' as const : '1900' as const, sheets: sheets.map(sheet => {
    const doc = read(sheet.path);
    if (!doc) throw new Error(`Missing worksheet: ${sheet.name}.`);
    const sourceRows = elements(doc, 'row');
    if (sourceRows.length > 100_000) throw new Error('Worksheet has too many rows.');
    const rows = sourceRows.map(row => {
      const cells: string[] = [];
      for (const cell of elements(row, 'c')) {
        if (++cellsRead > 1_000_000) throw new Error('Workbook has too many cells.');
        const letters = (cell.getAttribute('r') ?? '').replace(/\d/g, '');
        const index = [...letters].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
        if (index < 0 || index >= 16384) throw new Error('Invalid worksheet column.');
        const value = elements(cell, 'v')[0]?.textContent ?? '';
        cells[index] = cell.getAttribute('t') === 's' ? value === '' ? '' : shared[Number(value)] ?? '' : cell.getAttribute('t') === 'inlineStr' ? elements(cell, 't').map(t => t.textContent ?? '').join('') : value;
      }
      return cells;
    });
    return { name: sheet.name, rows };
  }) };
}
