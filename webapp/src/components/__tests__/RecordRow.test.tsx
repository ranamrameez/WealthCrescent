import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { RecordRow } from '../RecordRow';
import { TransactionEntryModal } from '../TransactionEntryModal';
import { useWorkbookStore } from '../../store/workbookStore';
import { createEmptyWorkbook } from '../../store/defaultWorkbook';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { createEmptyBankWorkbook } from '../../store/defaultBankWorkbook';
import { MemoryRouter } from 'react-router-dom';
import { createLinkedTransfer } from '../../lib/linkCascade';
import { linkedEditChoiceDialog } from '../LinkedEditChoiceDialog';
vi.mock('../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
vi.mock('../../lib/firebase/useAuthState', () => ({ useAuthState: () => ({ user: null, authResolved: true }), getCurrentUser: () => ({ uid: 'test' }) }));
vi.mock('../LinkedEditChoiceDialog', () => ({ linkedEditChoiceDialog: vi.fn(async () => 'both') }));
afterEach(cleanup);
it('lets cell navigation, nested handlers and links run without also opening details', () => {
  const navigate = vi.fn();
  render(<table><tbody><RecordRow record={{ ticker: 'QFLS' }}>
    <td onClick={navigate}><span>QFLS ticker</span></td>
    <td><span onClick={navigate}><svg data-testid="ticker-logo" /></span></td>
    <td><a href="#stock/QFLS">Ticker link</a></td>
    <td>Plain record cell</td>
  </RecordRow></tbody></table>);
  fireEvent.click(screen.getByText('QFLS ticker'));
  fireEvent.click(screen.getByTestId('ticker-logo'));
  fireEvent.click(screen.getByText('Ticker link'));
  expect(navigate).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Record details')).toBeNull();
  fireEvent.click(screen.getByText('Plain record cell'));
  expect(screen.getByText('Record details')).toBeVisible();
});
it('shows complete source values by click and keyboard and opens the existing editor', () => {
  const edit = vi.fn(), link = vi.fn();
  render(<table><thead><tr><th>Description</th><th>Actions</th></tr></thead><tbody><RecordRow record={{ id: 'record', description: 'A complete untruncated description', timezone: 'Asia/Qatar', amount: 123.456 }} onEdit={edit}><td>Short description</td><td><button onClick={link}>Existing action</button></td></RecordRow></tbody></table>);
  fireEvent.click(screen.getByRole('button', { name: 'Existing action' }));
  expect(link).toHaveBeenCalledOnce(); expect(screen.queryByText('Record details')).toBeNull();
  fireEvent.click(screen.getByText('Short description'));
  expect(screen.getByText('A complete untruncated description')).toBeVisible();
  expect(screen.getByText('Asia/Qatar')).toBeVisible(); expect(screen.getByText('123.456')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(edit).toHaveBeenCalledOnce(); expect(screen.queryByText('Record details')).toBeNull();
  fireEvent.keyDown(screen.getByText('Short description').closest('tr')!, { key: 'Enter' });
  expect(screen.getByText('Record details')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByText('Record details')).toBeNull();
});
it('puts legacy inline editing controls into a form popup and retains cancel', () => {
  function Example() {
    const [editing, setEditing] = useState(false);
    return <table><thead><tr><th>Amount</th><th>Actions</th></tr></thead><tbody><RecordRow record={{ amount: 10 }} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}>{editing ? <><td><input aria-label="Amount" defaultValue="10" /></td><td><button onClick={() => setEditing(false)}>Save</button><button onClick={() => setEditing(false)}>Cancel</button></td></> : <><td>10</td><td><button onClick={() => setEditing(true)}>Edit</button></td></>}</RecordRow></tbody></table>;
  }
  render(<Example />); fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Amount').closest('.modal-overlay')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText('Edit record')).toBeNull();
});
it('uses the standard transfer form to edit both linked sides without losing fees or IDs', async () => {
  useWorkbookStore.getState().setWorkbook(createEmptyWorkbook());
  useBankWorkbookStore.getState().setWorkbook({ ...createEmptyBankWorkbook(), settings: { accounts: [{ id: 'bank', name: 'QAR bank', currencyCode: 'QAR', openingBalance: 0 }] } });
  useInterEntityTransfersStore.getState().setWorkbook({ settings: {}, entries: [] });
  const result = createLinkedTransfer({ date: '2026-10-15', time: '10:00', timezone: 'Asia/Qatar', from: { module: 'bank', ref: 'bank', currencyCode: 'QAR' }, to: { module: 'qse', currencyCode: 'QAR' }, fromAmount: 6010, toAmount: 6010 });
  expect('link' in result).toBe(true); if (!('link' in result)) return;
  const record = useWorkbookStore.getState().workbook.transfers[0];
  const close = vi.fn();
  render(<MemoryRouter><TransactionEntryModal editTransfer={{ module: 'qse', record }} onClose={close} /></MemoryRouter>);
  expect(screen.getByText('Edit transfer')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '6100' } });
  fireEvent.blur(screen.getByLabelText('Amount'));
  const fee = within(screen.getByText('QSE transfer fee').closest('label')!).getByRole('textbox');
  fireEvent.change(fee, { target: { value: '12' } }); fireEvent.blur(fee);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(linkedEditChoiceDialog).toHaveBeenCalled();
  expect(useWorkbookStore.getState().workbook.transfers).toHaveLength(1);
  expect(useWorkbookStore.getState().workbook.transfers[0]).toMatchObject({ id: record.id, gross: 6100, fee: 12, time: '10:00', timezone: 'Asia/Qatar' });
  expect(useBankWorkbookStore.getState().workbook.transactions[0].amount).toBe(-6100);
});
it('edits the exchange fee through the same transfer form opened from the bank side', async () => {
  useWorkbookStore.getState().setWorkbook(createEmptyWorkbook());
  useBankWorkbookStore.getState().setWorkbook({ ...createEmptyBankWorkbook(), settings: { accounts: [{ id: 'bank', name: 'QAR bank', currencyCode: 'QAR', openingBalance: 0 }] } });
  useInterEntityTransfersStore.getState().setWorkbook({ settings: {}, entries: [] });
  const result = createLinkedTransfer({ date: '2026-10-15', time: '10:00', timezone: 'Asia/Qatar', from: { module: 'bank', ref: 'bank', currencyCode: 'QAR' }, to: { module: 'qse', currencyCode: 'QAR' }, fromAmount: 6010, toAmount: 6010 });
  if (!('link' in result)) throw new Error(result.error);
  const close = vi.fn();
  render(<MemoryRouter><TransactionEntryModal editLink={{ link: result.link, recordId: result.link.fromRecordId }} onClose={close} /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '6100' } }); fireEvent.blur(screen.getByLabelText('Amount'));
  const fee = within(screen.getByText('QSE transfer fee').closest('label')!).getByRole('textbox');
  fireEvent.change(fee, { target: { value: '12' } }); fireEvent.blur(fee);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(useWorkbookStore.getState().workbook.transfers[0]).toMatchObject({ gross: 6100, fee: 12 });
  expect(useBankWorkbookStore.getState().workbook.transactions[0].amount).toBe(-6100);
  expect(useInterEntityTransfersStore.getState().workbook.entries[0]).toMatchObject({ fromAmount: 6100, toAmount: 6100 });
});
it('keeps the entered time when the date changes and defaults new rows to outgoing', () => {
  useBankWorkbookStore.getState().setWorkbook({
    ...createEmptyBankWorkbook(),
    settings: { accounts: [{ id: 'bank', name: 'QAR bank', currencyCode: 'QAR', openingBalance: 0 }] },
  });
  render(<MemoryRouter><TransactionEntryModal defaultFinance={{ module: 'bank', ref: 'bank', currencyCode: 'QAR' }} onClose={vi.fn()} /></MemoryRouter>);

  const time = screen.getByLabelText('Time (optional)') as HTMLInputElement;
  const originalTime = time.value;
  expect(screen.getByRole('button', { name: 'Withdrawal' }).className).toContain('active');
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-14' } });
  expect(time.value).toBe(originalTime);
});
