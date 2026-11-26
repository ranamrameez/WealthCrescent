import { parseDateInput } from './format';

export type PdfTextChunk = { text: string; x: number; y: number };

export function pdfStatementLines(chunks: PdfTextChunk[]): string[] {
  const lines: { y: number; chunks: PdfTextChunk[] }[] = [];
  for (const chunk of [...chunks].sort((a, b) => b.y - a.y)) {
    if (!chunk.text.trim()) continue;
    const line = lines.at(-1);
    if (line && Math.abs(line.y - chunk.y) <= 2) line.chunks.push(chunk);
    else lines.push({ y: chunk.y, chunks: [chunk] });
  }
  let boundaries: [number, number] | undefined;
  return lines.map(line => {
    const ordered = line.chunks.sort((a, b) => a.x - b.x);
    const text = ordered.map(chunk => chunk.text.trim()).join(' ');
    if (balanceHeader.test(text)) {
      const amount = ordered.find(chunk => /^amount$/i.test(chunk.text.trim()));
      const balance = ordered.find(chunk => /^balance$/i.test(chunk.text.trim()));
      const description = ordered.find(chunk => /^(description|narration|details)$/i.test(chunk.text.trim()));
      if (!description || !amount || !balance || description.x >= amount.x || amount.x >= balance.x) {
        throw new Error('The PDF amount and balance columns could not be separated.');
      }
      boundaries = [(description.x + amount.x) / 2, (amount.x + balance.x) / 2];
      return text;
    }
    if (tableHeader.test(text)) boundaries = undefined;
    if (!boundaries || !datePrefix.test(text)) return text;
    const [amountStart, balanceStart] = boundaries;
    const columns: string[][] = [[], [], []];
    for (const chunk of ordered) columns[chunk.x >= balanceStart ? 2 : chunk.x >= amountStart ? 1 : 0].push(chunk.text.trim());
    return columns.map(column => column.join(' ')).join('\t');
  });
}

const tableHeader = /^date\s+(?:description|narration|details)\s+amount$/i;
const balanceHeader = /^date\s+(?:description|narration|details)\s+amount\s+balance$/i;
const balanceAmount = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
const datePrefix = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[\s-][a-z]{3}[\s-]\d{4})(?=\s|$)/i;
const unsupportedDate = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?=\s|$)/;
const rowFields = /^\s+(.+?)\s+([+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?)$/;

export function parseBankPdfStatement(pages: string[][]): string[][] {
  const rows: string[][] = [['Date', 'Description', 'Amount']];
  let foundHeader = false;
  for (const lines of pages) {
    let inTable = false;
    let hasBalance = false;
    for (const line of lines) {
      if (tableHeader.test(line) || balanceHeader.test(line)) {
        inTable = true;
        hasBalance = balanceHeader.test(line);
        foundHeader = true;
        continue;
      }
      if (!inTable) {
        if (foundHeader && (datePrefix.test(line) || unsupportedDate.test(line))) {
          throw new Error('A transaction page is missing the Date, Description and Amount headers.');
        }
        continue;
      }
      if (unsupportedDate.test(line)) throw new Error('PDF dates must use YYYY-MM-DD or a month name.');
      const rawDate = datePrefix.exec(line)?.[0];
      if (!rawDate) continue;
      const date = parseDateInput(rawDate.replace(/\s+/g, '-').replace(/^(\d)-/, '0$1-'), 'DD-MMM-YYYY');
      const columns = line.split('\t');
      if (hasBalance && (columns.length !== 3 || !balanceAmount.test(columns[1]) || !balanceAmount.test(columns[2]))) {
        throw new Error('A PDF transaction is missing a distinct amount or running balance.');
      }
      const row = hasBalance ? columns[0] + ' ' + columns[1] : line;
      const fields = rowFields.exec(row.slice(rawDate.length));
      const amount = fields?.[2].replaceAll(',', '');
      if (!date || !fields || !amount || !Number.isFinite(Number(amount)) || Number(amount) === 0) {
        throw new Error('A PDF transaction row could not be read reliably. Export the statement as CSV instead.');
      }
      rows.push([date, fields[1], amount]);
    }
  }
  if (rows.length === 1) {
    throw new Error('No supported text transactions in this PDF. Use a PDF with Date, Description and Amount columns, or export a CSV.');
  }
  return rows;
}

export async function readBankStatementPdf(file: File): Promise<string[][]> {
  if (file.size > 10_000_000) throw new Error('Choose a PDF no larger than 10 MB.');
  const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 100) throw new Error('Choose a statement with no more than 100 pages.');
    const pages: string[][] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      pages.push(pdfStatementLines(content.items.flatMap(item =>
        'str' in item ? [{ text: item.str, x: item.transform[4], y: item.transform[5] }] : [],
      )));
      page.cleanup();
    }
    return parseBankPdfStatement(pages);
  } finally {
    await task.destroy();
  }
}
