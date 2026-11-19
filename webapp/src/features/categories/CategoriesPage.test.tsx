import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it } from 'vitest';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import type { SearchWorkbook } from '../search/useSearchRecords';
import { CategoriesPage } from './CategoriesPage';

it('lists transactions by exact category ID from the signed-in account only', () => {
  const cash = useCashWorkbookStore.getState();
  const bank = useBankWorkbookStore.getState();
  try {
    cash.setWorkbook({ ...cash.workbook, entries: [
      { id: 'matching', date: '2026-01-02', amount: 20, isDeposit: false, currencyCode: 'USD', note: 'Fresh groceries', categoryID: 'cat_grocery', source: 'manual' },
      { id: 'qar', date: '2026-01-04', amount: 12, isDeposit: false, currencyCode: 'QAR', note: 'Qatar groceries', categoryID: 'cat_grocery', source: 'manual' },
      { id: 'nonmatching', date: '2026-01-02', amount: 30, isDeposit: false, currencyCode: 'USD', note: 'Grocery keyword only', categoryID: 'cat_uncategorized', source: 'manual' },
    ] });
    bank.setWorkbook({ ...bank.workbook, transactions: [
      { id: 'foreign', accountId: 'bank', date: '2026-01-02', isDeposit: false, amount: -50, description: 'Other owner activity', categoryID: 'cat_grocery', source: 'manual' },
    ] });
    const owners = { cash: 'owner', bank: 'another' } as Record<SearchWorkbook, string>;
    render(<MemoryRouter initialEntries={['/organize/categories/cat_grocery']}><Routes>
      <Route path="/organize/categories/:categoryId" element={<CategoriesPage owner="owner" workbookOwners={owners} />} />
    </Routes></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Fresh groceries' }).getAttribute('href')).toBe('/cash/USD');
    expect(screen.queryByText('Grocery keyword only')).toBeNull();
    expect(screen.queryByText('Other owner activity')).toBeNull();
    expect(screen.getByRole('table', { name: 'USD transactions' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'QAR transactions' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-03' } });
    expect(screen.queryByText('Fresh groceries')).toBeNull();
    expect(screen.getByText('Qatar groceries')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: JSON.stringify(['Cash', 'USD']) } });
    expect(screen.getByRole('status').textContent).toBe('No transactions match these filters.');
  } finally {
    cash.setWorkbook(cash.workbook);
    bank.setWorkbook(bank.workbook);
  }
});
