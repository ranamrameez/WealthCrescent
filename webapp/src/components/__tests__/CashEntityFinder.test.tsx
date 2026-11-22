import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { AppEntityFinder } from '../AppEntityFinder';
import { getNavigationItems, toggleNavigationFavorite } from '../../services/navigationService';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePageTopBarStore } from '../../store/pageTopBarStore';

vi.mock('../../lib/firebase/client', () => ({ auth: { currentUser: { uid: 'fixture' } } }));
vi.mock('../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));

const originalCash = useCashWorkbookStore.getState().workbook;
const originalPlans = usePlannedCashWorkbookStore.getState().workbook;
afterEach(() => {
  cleanup();
  useCashWorkbookStore.setState({ workbook: originalCash });
  usePlannedCashWorkbookStore.setState({ workbook: originalPlans });
  usePageTopBarStore.getState().setLoading(false);
});

function fixture() {
  useCashWorkbookStore.setState({ workbook: {
    settings: { defaultCurrency: 'QAR' },
    entries: [{ id: 'cash', date: '2026-11-01', source: 'manual', currencyCode: 'PKR', amount: 1, isDeposit: true, title: 'Cash' }],
  } });
  usePlannedCashWorkbookStore.setState({ workbook: {
    ...originalPlans,
    entries: [{ id: 'plan', date: '2026-12-01', currencyCode: 'USD', amount: 1, type: 'IN' }],
  } });
}

function Location() {
  const { pathname, search } = useLocation();
  return <output>{pathname + search}</output>;
}

it('lists each Cash currency once and favorites only the selected currency', () => {
  fixture();
  const cashCurrencies = () => getNavigationItems().find(section => section.title === 'Cash currencies')!.items;
  expect(cashCurrencies().map(item => item.url)).toEqual(['/cash/PKR', '/cash/QAR', '/cash/USD']);
  toggleNavigationFavorite('cashCurrency:USD');
  expect(cashCurrencies()[0]).toMatchObject({ id: 'USD', isFavorite: true });
  expect(useCashWorkbookStore.getState().workbook.settings.favoriteCurrencies).toEqual(['USD']);
  toggleNavigationFavorite('cashCurrency:USD');
  expect(cashCurrencies().every(item => !item.isFavorite)).toBe(true);
});

it('opens Cash detail from the finder and carries forward current Cash filters', () => {
  fixture();
  render(<MemoryRouter initialEntries={['/cash?entities=QAR&period=all&direction=out']}><AppEntityFinder/><Location/></MemoryRouter>);
  const input = screen.getByRole('combobox', { name: 'Find an item' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'PKR cash' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByText('/cash/PKR?period=all&direction=out')).toBeVisible();
});
