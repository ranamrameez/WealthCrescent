import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
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

  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(screen.queryByRole('option', { name: 'PENDING' })).toBeNull();
  expect(calcFee).toHaveBeenCalledWith(200, false, { tx: transactions[0], shares: 2 });

  fireEvent.change(screen.getByRole('combobox', { name: 'Ticker' }), { target: { value: 'OGDC' } });
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(within(table).getByText(/25\.00/)).toBeTruthy();
});
