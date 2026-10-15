import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QseRecordActions } from '../QseTableActions';
import { useWorkbookStore } from '../../../../store/workbookStore';
import { createEmptyWorkbook } from '../../../../store/defaultWorkbook';
import { useInterEntityTransfersStore } from '../../../../store/interEntityTransfersStore';
import { toCSV } from '../../../../lib/csv';
import { confirmDialog } from '../../../../components/ConfirmDialog';
import { zipSync, strToU8 } from 'fflate';
vi.mock('../../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
vi.mock('../../../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => ({ uid: 'test' }) }));
vi.mock('../../../../components/ConfirmDialog', () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock('../../../../components/Toast', () => ({ toast: vi.fn() }));
beforeEach(() => {
  vi.mocked(confirmDialog).mockReset().mockResolvedValue(true);
  const workbook = createEmptyWorkbook();
  workbook.transactions = [{ id: 'buy', seq: 1, date: '2026-10-01', ticker: 'QNBK', action: 'BUY', shares: 10, price: 12, feeOverride: 3 }, { id: 'sell', seq: 2, date: '2026-10-02', ticker: 'QNBK', action: 'SELL', shares: 2, price: 13 }];
  useWorkbookStore.setState({ workbook });
  useInterEntityTransfersStore.setState(state => ({ workbook: { ...state.workbook, entries: [] } }));
});
afterEach(cleanup);
function show() {
  return render(<QseRecordActions kind="transactions" rows={[useWorkbookStore.getState().workbook.transactions[0]]} modifying={false} onModify={() => {}} />);
}
function batch() { fireEvent.click(screen.getByRole('button', { name: 'Card options' })); fireEvent.click(screen.getByText('Batch edit')); }
it('edits only the filtered records and retains trade metadata', async () => {
  show(); batch();
  expect(screen.queryByLabelText('Row 2, Price')).toBeNull();
  fireEvent.change(screen.getByLabelText('Row 1, Price'), { target: { value: '15' } });
  fireEvent.click(screen.getByText('Save all changes'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(useWorkbookStore.getState().workbook.transactions.map(row => row.price)).toEqual([15, 13]);
  expect(useWorkbookStore.getState().workbook.transactions[0].feeOverride).toBe(3);
});
it('keeps drafts open when a stored trade changes during batch editing', async () => {
  show(); batch();
  fireEvent.change(screen.getByLabelText('Row 1, Price'), { target: { value: '15' } });
  useWorkbookStore.getState().updateTransaction(0, { price: 20 });
  fireEvent.click(screen.getByText('Save all changes'));
  expect(await screen.findByText(/changed or was removed/)).toBeVisible();
  expect(useWorkbookStore.getState().workbook.transactions[0].price).toBe(20);
});
it('imports validated CSV and skips duplicates despite different sequence numbers', async () => {
  const { container } = show();
  const file = new File([], 'trades.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => toCSV([
    ['date', 'ticker', 'action', 'shares', 'price'],
    ['2026-10-01', 'QNBK', 'BUY', 10, 12],
    ['2026-10-03', 'QIBK', 'BUY', 5, 9],
  ]) });
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
  await waitFor(() => expect(useWorkbookStore.getState().workbook.transactions).toHaveLength(3));
  expect(useWorkbookStore.getState().workbook.transactions[2]).toMatchObject({ ticker: 'QIBK', shares: 5, seq: 3 });
});
it('does not partially import a CSV containing an invalid row', async () => {
  const { container } = show();
  const file = new File([], 'invalid.csv');
  Object.defineProperty(file, 'text', { value: async () => 'date,ticker,action,shares,price\n2026-10-03,QIBK,BUY,5,9\n2026-02-30,QIBK,BUY,5,9' });
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
  await waitFor(async () => { const { toast } = await import('../../../../components/Toast'); expect(toast).toHaveBeenCalledWith(expect.stringContaining('Row 3:')); });
  expect(useWorkbookStore.getState().workbook.transactions).toHaveLength(2);
});
it('exports the filtered records separately from all table records', async () => {
  const blobs: Blob[] = [];
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { blobs.push(blob); return 'blob:test'; } });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Card options' }));
  fireEvent.click(screen.getByText('Export filtered'));
  fireEvent.click(screen.getByRole('button', { name: 'Card options' }));
  fireEvent.click(screen.getByText('Export all'));
  const contents = await Promise.all(blobs.map(blob => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); })));
  expect(contents[0]).toContain('BUY');
  expect(contents[0]).not.toContain('SELL');
  expect(contents[1]).toContain('SELL');
  click.mockRestore();
});
it('persists sequence changes made with the batch reorder controls', async () => {
  useWorkbookStore.getState().updateTransaction(1, { date: '2026-10-01', action: 'BUY' });
  render(<QseRecordActions kind="transactions" rows={useWorkbookStore.getState().workbook.transactions} modifying={false} onModify={() => {}} />);
  batch();
  fireEvent.click(screen.getByRole('button', { name: 'Move row 1 down' }));
  fireEvent.click(screen.getByText('Save all changes'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(useWorkbookStore.getState().workbook.transactions.find(row => row.id === 'buy')?.seq).toBe(2);
});
it('locks linked transfers in the batch editor', () => {
  const transfer = { id: 'transfer', date: '2026-10-01', type: 'DEPOSIT' as const, gross: 100, fee: 0, seq: 1 };
  useWorkbookStore.setState(state => ({ workbook: { ...state.workbook, transfers: [transfer] } }));
  useInterEntityTransfersStore.setState(state => ({ workbook: { ...state.workbook, entries: [{ id: 'link', date: transfer.date, from: { module: 'bank', ref: 'bank-account' }, to: { module: 'qse' }, fromAmount: 100, toAmount: 100, fromRecordId: 'bank-record', toRecordId: 'transfer' }] } }));
  render(<QseRecordActions kind="transfers" rows={[transfer]} modifying={false} onModify={() => {}} />);
  batch();
  expect(screen.getByText('Read-only')).toBeVisible();
  expect(screen.queryByLabelText('Row 1, Gross')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete row 1' })).toBeNull();
});
it('assigns added rows a sequence beyond records hidden by the filter', async () => {
  useWorkbookStore.getState().updateTransaction(1, { seq: 100 });
  show(); batch();
  fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
  fireEvent.change(screen.getByLabelText('Row 2, Ticker'), { target: { value: 'qibk' } });
  fireEvent.change(screen.getByLabelText('Row 2, Shares'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Row 2, Price'), { target: { value: '8' } });
  fireEvent.click(screen.getByText('Save all changes'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(useWorkbookStore.getState().workbook.transactions.find(row => row.ticker === 'QIBK')).toMatchObject({ seq: 101, shares: 3 });
});
it('imports mixed ledger records into their owning collections and skips duplicate trades', async () => {
  const rows = useWorkbookStore.getState().workbook.transactions.map(row => ({ ...row, id: row.id!, kind: 'trade' as const }));
  const { container } = render(<QseRecordActions kind="ledger" rows={rows} modifying={false} onModify={() => {}} />);
  const file = new File([], 'ledger.csv');
  Object.defineProperty(file, 'text', { value: async () => toCSV([
    ['date', 'kind', 'ticker', 'action', 'shares', 'price', 'type', 'gross', 'fee', 'amount', 'note'],
    ['2026-10-01', 'trade', 'QNBK', 'BUY', 10, 12, '', '', '', -120, ''],
    ['2026-10-03', 'transfer', '', '', '', '', 'DEPOSIT', 100, 1, 99, ''],
    ['2026-10-04', 'adjustment', '', '', '', '', '', '', '', -5, 'Correction'],
  ]) });
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
  await waitFor(() => expect(useWorkbookStore.getState().workbook.transfers).toHaveLength(1));
  const wb = useWorkbookStore.getState().workbook;
  expect(wb.transactions).toHaveLength(2);
  expect(wb.transfers[0]).toMatchObject({ gross: 100, fee: 1, type: 'DEPOSIT' });
  expect(wb.adjustments[0]).toMatchObject({ amount: -5, note: 'Correction' });
  expect(wb.transfers[0]).not.toHaveProperty('kind');
  expect(wb.transfers[0]).not.toHaveProperty('shares');
});
it('updates correction CSV IDs in place, adds one sale, and remains idempotent', async () => {
  const { container } = show();
  const makeFile = () => {
    const file = new File([], 'corrections.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => toCSV([
      ['id', 'date', 'ticker', 'action', 'shares', 'price'],
      ['buy', '2026-10-01', 'QNBK', 'BUY', '10', '12.24'],
      ['sale-new', '2026-10-15', 'QNBK', 'SELL', '1', '13'],
    ]) });
    return file;
  };
  const input = container.querySelector('input[type=file]')!;
  fireEvent.change(input, { target: { files: [makeFile()] } });
  await waitFor(() => expect(useWorkbookStore.getState().workbook.transactions).toHaveLength(3));
  expect(useWorkbookStore.getState().workbook.transactions.find(row => row.id === 'buy')).toMatchObject({ price: 12.24, feeOverride: 3 });
  fireEvent.change(input, { target: { files: [makeFile()] } });
  await waitFor(() => expect(useWorkbookStore.getState().workbook.transactions).toHaveLength(3));
});
it('warns about rounded Excel figures before import confirmation and lets the user cancel', async () => {
  const { container } = show();
  const bytes = zipSync({ 'xl/worksheets/sheet1.xml': strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c r="A1" t="inlineStr"><is><t>Date</t></is></c><c r="B1" t="inlineStr"><is><t>Type</t></is></c><c r="C1" t="inlineStr"><is><t>Count</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>15/10/2026</t></is></c><c r="B2" t="inlineStr"><is><t>Buy</t></is></c><c r="C2"><v>1</v></c><c r="D2" t="inlineStr"><is><t>Qatar Fuel</t></is></c><c r="E2"><v>12.24</v></c></row></sheetData></worksheet>') });
  const file = new File([], 'statement.xlsx');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  const input = container.querySelector('input[type=file]')!;
  vi.mocked(confirmDialog).mockResolvedValueOnce(false);
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
  expect(vi.mocked(confirmDialog).mock.calls[0]).toEqual([expect.stringContaining('incorrect balances'), 'Warning: rounded statement figures']);
  expect(useWorkbookStore.getState().workbook.transactions).toHaveLength(2);
  vi.mocked(confirmDialog).mockClear().mockResolvedValue(true);
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(useWorkbookStore.getState().workbook.transactions).toHaveLength(3));
  expect(vi.mocked(confirmDialog).mock.calls.map(call => call[1])).toEqual(['Warning: rounded statement figures', 'Import QSE transactions?']);
});
