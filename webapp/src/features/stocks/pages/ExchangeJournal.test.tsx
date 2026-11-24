import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { parseCSV } from '../../../lib/csv';
import type { Transaction } from '../../../types/workbook';
import { ExchangeJournal } from './ExchangeJournal';

it('reports completed broker fills using native fees and realized results', () => {
  const transactions: Transaction[] = [
    { id: 'sale', date: '2026-11-10', ticker: 'OGDC', action: 'SELL', shares: 2, price: 100 },
    { id: 'buy', date: '2026-11-09', ticker: 'HBL', action: 'BUY', shares: 3, price: 90 },
    { id: 'pending', date: '2026-11-11', ticker: 'PENDING', action: 'BUY', shares: 1, price: 90, isPending: true },
  ];
  const calcFee = vi.fn(() => 2);
  render(<MemoryRouter><ExchangeJournal exchange="PSX" transactions={transactions}
    currency="PKR" calcFee={calcFee} realizedBySellTxId={{ sale: { netPL: 25 } }} /></MemoryRouter>);

  const table = screen.getByRole('table', { name: 'Executed trades' });
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(screen.queryByRole('option', { name: 'PENDING' })).toBeNull();
  expect(calcFee).toHaveBeenCalledWith(200, false, { tx: transactions[0], shares: 2 });

  fireEvent.change(screen.getByRole('combobox', { name: 'Ticker' }), { target: { value: 'OGDC' } });
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  const daily = within(screen.getByRole('table', { name: 'Daily results' }));
  const tickers = within(screen.getByRole('table', { name: 'Ticker results' }));
  expect(daily.getAllByRole('row')).toHaveLength(2);
  expect(daily.getByRole('rowheader', { name: '2026-11-10' })).toBeTruthy();
  expect(tickers.getAllByRole('row')).toHaveLength(2);
  expect(tickers.getByRole('rowheader', { name: 'OGDC' })).toBeTruthy();
  expect(tickers.getByText(/25\.00/)).toBeTruthy();
  expect(within(table).getByText(/25\.00/)).toBeTruthy();
});

it('exports the filtered daily and ticker reports across all pages', async () => {
  const transactions: Transaction[] = Array.from({ length: 26 }, (_, index) => ({
    id: String(index + 1),
    date: `2026-11-${String(index + 1).padStart(2, '0')}`,
    ticker: 'OGDC',
    action: index === 0 ? 'SELL' : 'BUY',
    shares: 2,
    price: 100,
  }));
  transactions.push(
    { ...transactions[0], id: 'other', ticker: 'HBL' },
    { ...transactions[0], id: 'pending', date: '2026-11-27', isPending: true },
  );
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:journal');
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = vi.fn();
  });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const readRows = async (blob: Blob) => parseCSV(await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  }));

  try {
    render(<MemoryRouter><ExchangeJournal exchange="PSX" transactions={transactions}
      currency="PKR" calcFee={() => 0.125} realizedBySellTxId={{ '1': { netPL: -2.125 } }} /></MemoryRouter>);
    fireEvent.change(screen.getByRole('combobox', { name: 'Ticker' }), { target: { value: 'OGDC' } });

    for (const title of ['Daily results', 'Ticker results']) {
      const card = screen.getByRole('button', { name: title }).closest('section')!;
      fireEvent.click(within(card).getByRole('button', { name: 'Card options' }));
      fireEvent.click(within(card).getByRole('button', { name: `Export ${title.toLowerCase()}` }));
    }

    const daily = await readRows(createObjectURL.mock.calls[0][0]);
    expect(click.mock.contexts[0]).toHaveProperty('download', 'psx-trade-journal-daily-results.csv');
    expect(daily).toHaveLength(27);
    expect(daily[0]).toEqual(['Trade date', 'Fills', 'Fees', 'Realized P/L', 'Currency']);
    expect(daily[1]).toEqual(['2026-11-26', '1', '0.125', '', 'PKR']);
    expect(daily.at(-1)).toEqual(['2026-11-01', '1', '0.125', '-2.125', 'PKR']);

    const tickers = await readRows(createObjectURL.mock.calls[1][0]);
    expect(click.mock.contexts[1]).toHaveProperty('download', 'psx-trade-journal-ticker-results.csv');
    expect(tickers).toEqual([
      ['Ticker', 'Fills', 'Fees', 'Realized P/L', 'Currency'],
      ['OGDC', '26', '3.25', '-2.125', 'PKR'],
    ]);
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
  }
});
