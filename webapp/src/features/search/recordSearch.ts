export interface SearchRecord {
  key: string;
  module: string;
  scopeId: string;
  scope: string;
  kind: string;
  title: string;
  detail: string;
  date?: string;
  url: string;
  terms: string;
  categoryId?: string;
}

type SearchableFields = {
  id?: string;
  title?: string;
  name?: string;
  person?: string;
  description?: string;
  note?: string;
  notes?: string;
  reference?: string;
  statementRef?: string;
  ticker?: string;
  date?: string;
  currencyCode?: string;
  amount?: number;
  categoryID?: string;
};

interface RecordSource<T> {
  module: string;
  kind: string;
  records: T[];
  context: (row: T) => { id: string; label: string; url: string };
}

export function collectSearchRecords<T extends SearchableFields>({ module, kind, records, context }: RecordSource<T>): SearchRecord[] {
  return records.map((row, index) => {
    const { id: scopeId, label: scope, url } = context(row);
    const title = row.title || row.name || row.person || row.description || row.ticker || row.note || kind;
    const detail = [row.description, row.note, row.notes, row.reference, row.statementRef]
      .filter((value): value is string => !!value && value !== title).join(' · ');
    const terms = [title, detail, row.id, row.ticker, row.date, row.currencyCode, row.amount, module, kind, scope]
      .filter(value => value !== undefined).join(' ');
    return { key: JSON.stringify([module, kind, scopeId, row.id, index]), module, scopeId, scope, kind, title, detail, date: row.date, url, terms, categoryId: row.categoryID };
  });
}

const normalize = (value: string) => value.normalize('NFKC').toLowerCase();

export function findSearchRecords(records: SearchRecord[], query: string, module: string, scopeId: string) {
  const tokens = normalize(query).trim().split(/\s+/u).filter(Boolean);
  if (!tokens.length) return [];
  return records.filter(row => {
    if (module && (row.module !== module || (scopeId && row.scopeId !== scopeId))) return false;
    const text = normalize(row.terms);
    return tokens.every(token => text.includes(token));
  }).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
}

/** Native transactions and repayments only. Plans and linked transfer shadows are separate records. */
export function categoryTransactions(records: SearchRecord[], categoryId: string) {
  return records.filter(row => row.categoryId === categoryId && (row.kind === 'Transaction' || row.kind === 'Repayment' || row.kind === 'Trade'))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
}
