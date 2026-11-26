import { readPdfTextPages, type PdfTextChunk } from './bankStatementPdf';

export type StatementPdfLayout = 'qse' | 'psx' | 'installment' | 'funds';
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

function isHeader(cells: string[], layout: StatementPdfLayout) {
  const includes = (...fields: string[]) => fields.every(field => cells.includes(field));
  switch (layout) {
    case 'qse': return ['date', 'type', 'count', 'unit', 'price', 'amount'].every((field, index) => cells[index] === field);
    case 'psx': return includes('date', 'description', 'debit', 'credit') || includes('scrip', 'quantity', 'grossrate', 'type', 'executiondate');
    case 'installment': return (includes('scheduledamount') && (includes('duemonth') || includes('duedate'))) ||
      (cells.some(cell => ['paymentdate', 'paiddate', 'actualpaymentdate'].includes(cell)) &&
        cells.some(cell => ['paidinstallment', 'paymentamount', 'paidamount'].includes(cell)));
    case 'funds': return cells.length === 11 && cells[2] === 'fundcode' &&
      cells[4] === 'totalinvested' && cells[5] === 'withdrawn' && cells[7] === 'currentbalance';
  }
}

function positionedLines(page: PdfTextChunk[]) {
  const lines: PdfTextChunk[][] = [];
  for (const chunk of [...page].filter(item => item.text.trim()).sort((a, b) => b.y - a.y)) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0].y - chunk.y) <= 2) line.push(chunk);
    else lines.push([chunk]);
  }
  return lines.map(line => line.sort((a, b) => a.x - b.x));
}

export function extractStatementPdfTable(pages: PdfTextChunk[][], layout: StatementPdfLayout): string[][] {
  let header: string[] | undefined;
  const rows: string[][] = [];
  for (const page of pages) {
    const lines = positionedLines(page);
    const index = lines.findIndex(line => isHeader(line.map(chunk => normalize(chunk.text)), layout));
    if (index < 0) throw new Error('Each PDF page must have the supported statement column headers in selectable text.');
    const headings = lines[index];
    const pageHeader = headings.map(chunk => chunk.text.trim());
    if (header && header.map(normalize).join('|') !== pageHeader.map(normalize).join('|')) {
      throw new Error('The PDF column layout changes between pages.');
    }
    header = pageHeader;
    const boundary = headings.slice(1).map((chunk, index) => (headings[index].x + chunk.x) / 2);
    for (const line of lines.slice(index + 1)) {
      if (line.length === 1 && /^(?:page \d+(?: of \d+)?|\d+\/\d+)$/i.test(line[0].text.trim())) continue;
      const cells = header.map(() => '');
      for (const chunk of line) {
        const before = boundary.findIndex(x => chunk.x < x);
        const col = before < 0 ? boundary.length : before;
        cells[col] = (cells[col] + ' ' + chunk.text.trim()).trim();
      }
      rows.push(cells);
    }
  }
  if (!header || !rows.length) throw new Error('No supported statement rows were found in this PDF.');
  return [header, ...rows];
}

export async function readStatementPdfTable(file: File, layout: StatementPdfLayout) {
  return extractStatementPdfTable(await readPdfTextPages(file), layout);
}
