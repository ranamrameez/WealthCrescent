import { parseDateInput } from '../../../lib/format';
import { readStatementImportFile, STATEMENT_FILE_ACCEPT, suggestStatementColumn } from '../../../lib/statementImportFile';
import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { StandardButton } from '../../../components/standard/Button';
import { Field, Select, TextInput } from '../../../components/ui/Field';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { getCurrentUser } from '../../../lib/firebase/useAuthState';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { useCreditCardWorkbookStore } from '../../../store/creditCardWorkbookStore';
import type { CreditCard, CreditCardTransaction, CreditCardTransactionKind } from '../../../types/creditCard';

type Entry = Pick<CreditCardTransaction, 'date' | 'description' | 'amount'>;
const key = (row: Entry) => JSON.stringify([row.date, row.description.trim().toLowerCase().replace(/\s+/g, ' '), Math.abs(row.amount)]);
const kinds: [CreditCardTransactionKind, string][] = [
  ['charge', 'Charge'], ['payment', 'Payment'], ['fee', 'Fee'], ['markup', 'Interest or markup'], ['cashAdvance', 'Cash advance'],
];

export function CardPdfImport({ card, onClose }: { card: CreditCard; onClose: () => void }) {
  const ensureSignedIn = useEnsureSignedIn();
  const transactions = useCreditCardWorkbookStore(state => state.workbook.transactions);
  const [table, setTable] = useState<string[][]>([]);
  const [mapping, setMapping] = useState({ date: '', description: '', amount: '' });
  const [columns = [], ...body] = table;
  const rows: Entry[] = body.map(row => ({
    date: row[columns.indexOf(mapping.date)]?.trim() ?? '',
    description: row[columns.indexOf(mapping.description)]?.trim() ?? '',
    amount: Number(row[columns.indexOf(mapping.amount)] ?? 0),
  }));
  const [choices, setChoices] = useState<Record<number, CreditCardTransactionKind | ''>>({});
  const [owner, setOwner] = useState<string>();
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recorded = new Set(transactions.filter(row => row.cardId === card.id).map(key));
  const seen = new Set<string>();
  const report = rows.map((row, index) => {
    const identity = key(row);
    const invalid = !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !parseDateInput(row.date, 'DD-MMM-YYYY') ||
      !row.description || !Number.isFinite(row.amount) || row.amount === 0;
    const disabled = invalid || recorded.has(identity) || seen.has(identity);
    if (!invalid) seen.add(identity);
    return { row, index, disabled, invalid };
  });
  const selected = report.filter(row => choices[row.index] && !row.disabled);
  const page = useTablePagination(report);

  async function read(file: File) {
    setBusy(true);
    setError('');
    setTable([]);
    setChoices({});
    const currentOwner = getCurrentUser()?.uid;
    try {
      const table = await readStatementImportFile(file);
      setMapping({
        date: suggestStatementColumn(table[0], 'date'),
        description: suggestStatementColumn(table[0], 'description'),
        amount: suggestStatementColumn(table[0], 'amount'),
      });
      setTable(table);
      setFilename(file.name);
      setOwner(currentOwner);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the card statement.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      if (!(await ensureSignedIn('Sign in to import card transactions.'))) return;
      const user = getCurrentUser()?.uid;
      const store = useCreditCardWorkbookStore.getState();
      const target = store.workbook.cards.find(item => item.id === card.id);
      if (!user || (owner && owner !== user) || !target || target.isActive === false || target.currencyCode !== card.currencyCode) {
        throw new Error('The account or card changed. Open the import again.');
      }
      const latest = new Set(store.workbook.transactions.filter(row => row.cardId === card.id).map(key));
      if (selected.some(({ row }) => latest.has(key(row)))) throw new Error('The card ledger changed. Review the matching rows again.');
      const additions = selected.map(({ row, index }): CreditCardTransaction => ({
        ...row, id: crypto.randomUUID(), cardId: card.id, amount: Math.abs(row.amount),
        kind: choices[index] as CreditCardTransactionKind, source: 'statement-import', statementRef: filename,
      }));
      store.setWorkbook({ ...store.workbook, transactions: [...store.workbook.transactions, ...additions] });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import card transactions.');
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="Import card statement" onClose={onClose} widthClass="60">
    <div className="stack-md">
      <p>Review the column mapping and original signs. Choose an import type for each transaction to add.</p>
      <Field label="Credit card statement"><TextInput type="file" accept={STATEMENT_FILE_ACCEPT} disabled={busy}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void read(file); }} /></Field>
      {error && <div role="alert"><Notice tone="danger">{error}</Notice></div>}
      {rows.length > 0 && <>
        <div className="row">
          {(['date', 'description', 'amount'] as const).map(field => <Field key={field} label={field[0].toUpperCase() + field.slice(1) + ' column'}>
            <Select value={mapping[field]} disabled={busy} onChange={event => {
              const column = event.target.value;
              setMapping(previous => ({ ...previous, [field]: column }));
              setChoices({});
            }}>
              <option value="">Select a column</option>
              {columns.map(column => <option key={column} value={column}>{column}</option>)}
            </Select>
          </Field>)}
        </div>
        <div className="table-scroll"><table>
          <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Statement amount ({card.currencyCode})</th><th scope="col">Import as</th></tr></thead>
          <tbody>{page.rows.map(({ row, index, disabled, invalid }) => <tr key={index}>
            <td>{row.date}</td><td>{row.description}</td><td>{row.amount}</td>
            <td>{invalid ? 'Check the date, description, and amount' : disabled ? 'Matching row already recorded or listed above' : <Select aria-label={`Import type for row ${index + 1}`} disabled={busy} value={choices[index] ?? ''}
              onChange={event => setChoices(previous => ({ ...previous, [index]: event.target.value as CreditCardTransactionKind | '' }))}>
              <option value="">Skip</option>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>}</td>
          </tr>)}</tbody>
        </table></div>
        {page.controls}
        <StandardButton disabled={busy || !selected.length} onClick={() => void save()}>Import selected ({selected.length})</StandardButton>
      </>}
    </div>
  </Modal>;
}
