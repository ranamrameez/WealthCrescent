import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TransactionRows, TransactionsPage } from '../TransactionsPage';
import { DividendsSection } from '../../components/DividendsSection';
import { useWorkbookStore } from '../../../../store/workbookStore';
import { createEmptyWorkbook } from '../../../../store/defaultWorkbook';
import { usePageTopBarStore } from '../../../../store/pageTopBarStore';
vi.mock('../../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
vi.mock('../../../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => ({ uid: 'test' }), useAuthState: () => ({ user: null, authResolved: true }) }));
beforeEach(() => {
  const workbook = createEmptyWorkbook();
  workbook.transactions = [{ id: 'buy', seq: 1, date: '2026-10-01', ticker: 'QNBK', action: 'BUY', shares: 10, price: 12 }, { id: 'sell', seq: 2, date: '2026-10-05', ticker: 'QNBK', action: 'SELL', shares: 5, price: 13 }];
  useWorkbookStore.setState({ workbook });
});
afterEach(cleanup);
function Controls() { const control = usePageTopBarStore(state => state.rightSlot); return <>{control}</>; }
it('filters the trade list without discarding the historical buys used for closed trades', () => {
  const { container } = render(<MemoryRouter initialEntries={['/transactions?section=list&qse-from=2026-10-05']}><Controls /><TransactionsPage /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeVisible();
  const details = screen.getByRole('button', { name: /Closed trades \(realized round-trips\)/ }).closest('section')!;
  expect(within(details).getByText('2026-10-01')).toBeVisible();
  expect(within(details).getByText('2026-10-05')).toBeVisible();
  const menus = within(container.querySelector('[data-page-section=list]')! as HTMLElement).getAllByRole('button', { name: 'Card options' });
  fireEvent.click(menus[0]);
  expect(screen.getByText('Import CSV')).toBeVisible();
  expect(screen.getByText('Export filtered')).toBeVisible();
  expect(screen.getByText('Batch edit')).toBeVisible();
  expect(screen.getByText('Modify')).toBeVisible();
});
it('batch edits dividend estimates while leaving share balances unchanged', async () => {
  render(<MemoryRouter><DividendsSection /></MemoryRouter>);
  fireEvent.click(screen.getAllByRole('button', { name: 'Card options' })[1]);
  fireEvent.click(screen.getByText('Batch edit'));
  fireEvent.change(screen.getByLabelText('Row 1, Annual per share'), { target: { value: '0.75' } });
  fireEvent.click(screen.getByText('Save all changes'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(useWorkbookStore.getState().workbook.dividendEstimates.QNBK).toBe(0.75);
  expect(useWorkbookStore.getState().workbook.transactions[0].shares).toBe(10);
});

function ledgerPage() {
  const view = render(<MemoryRouter initialEntries={['/transactions?section=ledger']}><Controls /><TransactionsPage /></MemoryRouter>);
  const section = view.container.querySelector('[data-page-section=ledger]')! as HTMLElement;
  const header = section.querySelector('.standard-card-header')! as HTMLElement;
  return { ...view, section, header };
}
it('puts every table action in a header and exposes only the central Filters button', () => {
  const { container, header } = ledgerPage();
  expect(screen.getAllByRole('button', { name: /^Filters/ })).toHaveLength(1);
  expect(container.querySelector('.section-toolbar')).toBeNull();
  for (const menu of container.querySelectorAll('.standard-card-menu')) expect(menu.closest('.standard-card-header')).toBeTruthy();
  fireEvent.click(within(header).getByRole('button', { name: 'Card options' }));
  for (const action of ['Import CSV', 'Export filtered', 'Export all', 'Batch edit', 'Modify']) expect(within(header).getByText(action)).toBeVisible();
});
it('edits the original trade from Cash ledger Modify and refreshes its balance', async () => {
  const { section, header } = ledgerPage();
  fireEvent.click(within(header).getByRole('button', { name: 'Card options' }));
  fireEvent.click(within(header).getByText('Modify'));
  expect(within(header).getByRole('button', { name: 'Hide modification options' })).toBeVisible();
  const buyRow = within(section).getByText('Buy').closest('tr')!;
  fireEvent.click(within(buyRow).getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(useWorkbookStore.getState().workbook.transactions.find(row => row.id === 'buy')?.price).toBe(20);
  expect(within(section).getByText('20.00')).toBeVisible();
});
it('batch edits mixed cash ledger sources without replacing unrelated records', async () => {
  useWorkbookStore.setState(state => ({ workbook: { ...state.workbook, transfers: [{ id: 'transfer', date: '2026-10-03', type: 'DEPOSIT', gross: 100, fee: 0, seq: 3 }], adjustments: [{ id: 'adjustment', date: '2026-10-02', amount: 2, note: 'Reward', seq: 4 }] } }));
  const { header } = ledgerPage();
  fireEvent.click(within(header).getByRole('button', { name: 'Card options' }));
  fireEvent.click(within(header).getByText('Batch edit'));
  fireEvent.change(screen.getByLabelText('Row 2, Gross'), { target: { value: '120' } });
  fireEvent.change(screen.getByLabelText('Row 3, Amount'), { target: { value: '5' } });
  fireEvent.click(screen.getByText('Save all changes'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const wb = useWorkbookStore.getState().workbook;
  expect(wb.transfers[0].gross).toBe(120);
  expect(wb.adjustments[0].amount).toBe(5);
  expect(wb.transactions).toHaveLength(2);
  expect(wb.transactions.find(row => row.id === 'buy')?.price).toBe(12);
});
it('uses Bank Account pagination and batches all filtered rows across pages', () => {
  useWorkbookStore.setState(state => ({ workbook: { ...state.workbook, transactions: Array.from({ length: 30 }, (_, index) => ({ id: `buy-${index}`, seq: index + 1, date: '2026-10-01', ticker: 'QNBK', action: 'BUY', shares: 1, price: 12 })) } }));
  const { section, header } = ledgerPage();
  expect(section.querySelectorAll('tbody tr')).toHaveLength(25);
  fireEvent.click(within(section).getByRole('button', { name: 'Next' }));
  expect(section.querySelectorAll('tbody tr')).toHaveLength(5);
  expect(within(section).getByText('Page 2 of 2')).toBeVisible();
  fireEvent.click(within(header).getByRole('button', { name: 'Card options' }));
  fireEvent.click(within(header).getByText('Batch edit'));
  expect(screen.getByLabelText('Row 30, Price')).toBeVisible();
});
it('shows the complete filter set only in the central popup', () => {
  ledgerPage();
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
  for (const label of ['Trade action', 'Group trades', 'Transfer type', 'Ledger type', 'Lot matching']) expect(screen.getByLabelText(label)).toBeVisible();
  expect(screen.getByRole('button', { name: 'This month' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('Ledger type'), { target: { value: 'trade' } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getAllByRole('button', { name: /^Filters/ })).toHaveLength(1);
});
it('shows portfolio-style trade types, share counts and stock/currency units in the cash ledger', () => {
  useWorkbookStore.setState(state => ({ workbook: { ...state.workbook, transfers: [{ id: 'transfer', date: '2026-10-03', type: 'DEPOSIT', gross: 100, fee: 0, description: 'SWIFT TR. FROM', seq: 3 }] } }));
  const { section } = ledgerPage();
  for (const name of ['Type', 'Count', 'Unit']) expect(within(section).getByRole('columnheader', { name })).toBeVisible();
  const buyRow = within(section).getByText('Buy').closest('tr')!;
  expect(within(buyRow).getByText('Buy').closest('td')).toHaveClass('pill-buy');
  expect(within(buyRow).getByText('10')).toBeVisible();
  expect(within(buyRow).getByRole('link')).toHaveAttribute('href', '/stock/QNBK');
  expect(buyRow.querySelector('.ticker-logo, .ticker-logo-fallback')).toBeTruthy();
  const sellRow = within(section).getByText('Sell').closest('tr')!;
  expect(within(sellRow).getByText('Sell').closest('td')).toHaveClass('pill-sell');
  expect(within(section).getByText('SWIFT TR. FROM')).toBeVisible();
  expect(within(section).getByText('Riyal')).toBeVisible();
});

it('matches the ledger column layout, keeps one type info icon and expands details without generated descriptions', () => {
  const { section, header } = ledgerPage();
  const headers = () => within(section).getAllByRole('columnheader').map(cell => cell.textContent);
  expect(headers()).toEqual(['', 'Date', 'Type', 'Count', 'Unit', 'Price', 'Amount', 'Balance']);
  const buyRow = within(section).getByText('Buy').closest('tr')!;
  expect(within(buyRow).getByText('12.00')).toBeVisible();
  const type = within(buyRow).getByText('Buy').closest('td')!;
  expect(type.querySelectorAll('.tooltip-trigger')).toHaveLength(1);
  expect(type.querySelector('.tooltip-trigger')?.querySelectorAll('svg')).toHaveLength(1);
  expect(within(section).queryByText(/BUY 10 QNBK/)).toBeNull();
  fireEvent.click(within(buyRow).getByRole('button', { name: 'Expand details' }));
  expect(within(section).getByText('Fee:')).toBeVisible();
  expect(within(section).queryByText(/BUY 10 QNBK/)).toBeNull();
  fireEvent.click(within(buyRow).getByRole('button', { name: 'Collapse details' }));
  expect(within(section).queryByText(/BUY 10 QNBK/)).toBeNull();
  fireEvent.click(within(header).getByRole('button', { name: 'Card options' }));
  fireEvent.click(within(header).getByText('Modify'));
  expect(headers().slice(-2)).toEqual(['Balance', 'Actions']);
});

it('preserves user-entered descriptions in cash ledger details', () => {
  useWorkbookStore.setState(state => ({ workbook: { ...state.workbook, transfers: [{ id: 'transfer', date: '2026-10-03', type: 'DEPOSIT', gross: 100, fee: 0, description: 'SWIFT TR. FROM', seq: 3 }] } }));
  const { section } = ledgerPage();
  const row = within(section).getByText('SWIFT TR. FROM').closest('tr')!;
  expect(row.children[3]).toBeEmptyDOMElement();
  expect(row.children[5]).toHaveTextContent('-');
  fireEvent.click(within(row).getByRole('button', { name: 'Expand details' }));
  expect(within(section).getByText('Description:')).toBeVisible();
  expect(within(section).getAllByText('SWIFT TR. FROM')).toHaveLength(2);
});


it('saves a trade from the shared FAB form and signals the modal to close only after success', async () => {
  const onSaved = vi.fn();
  render(<MemoryRouter><TransactionRows onSaved={onSaved} /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText('Ticker'), { target: { value: 'QNBK' } });
  fireEvent.change(screen.getByPlaceholderText('Shares'), { target: { value: '5' } });
  fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '12.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
  await waitFor(() => expect(useWorkbookStore.getState().workbook.transactions).toHaveLength(3));
  expect(useWorkbookStore.getState().workbook.transactions[2]).toMatchObject({
    ticker: 'QNBK', action: 'BUY', shares: 5, price: 12.5,
  });
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it('keeps the entered trade open for retry when the store save throws', async () => {
  const onSaved = vi.fn();
  const originalAddTransactions = useWorkbookStore.getState().addTransactions;
  useWorkbookStore.setState({
    addTransactions: (() => { throw new Error('simulated store failure'); }) as typeof originalAddTransactions,
  });
  try {
    render(<MemoryRouter><TransactionRows onSaved={onSaved} /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Ticker'), { target: { value: 'QNBK' } });
    fireEvent.change(screen.getByPlaceholderText('Shares'), { target: { value: '5' } });
    fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Ticker')).toHaveValue('QNBK'));
    expect(screen.getByPlaceholderText('Shares')).toHaveValue(5);
    expect(screen.getByPlaceholderText('Price')).toHaveValue(12.5);
    expect(onSaved).not.toHaveBeenCalled();
  } finally {
    useWorkbookStore.setState({ addTransactions: originalAddTransactions });
  }
});
