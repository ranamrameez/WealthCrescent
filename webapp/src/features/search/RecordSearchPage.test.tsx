import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { RecordSearchPage, TopBarRecordSearch } from './RecordSearchPage';
import type { SearchWorkbook } from './useSearchRecords';

vi.mock('../../lib/firebase/useAuthState', () => ({ useAuthState: () => ({ user: { uid: 'owner' } }) }));
vi.mock('../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));

const original = useCashWorkbookStore.getState().workbook;
afterEach(() => { cleanup(); useCashWorkbookStore.setState({ workbook: original }); });
const entries = [
  { id: 'one', title: 'Coffee Doha', currencyCode: 'QAR' },
  { id: 'two', title: 'Coffee Lahore', currencyCode: 'PKR' },
].map(row => ({ ...row, date: '2026-11-17', amount: 10, isDeposit: false, source: 'manual' as const }));
const workbookOwners: Record<SearchWorkbook, string | undefined> = {
  cash: 'owner', bank: undefined, cards: undefined, rentals: undefined, funds: undefined, emi: undefined,
  loans: undefined, subscriptions: undefined, qse: undefined, psx: undefined, cashPlans: undefined,
  bankPlans: undefined, cardPlans: undefined, rentalPlans: undefined, transfers: undefined, snapshots: undefined,
};

it('opens topbar search results and narrows to a native currency', () => {
  useCashWorkbookStore.setState({ workbook: { ...original, entries } });
  render(<MemoryRouter>
    <TopBarRecordSearch />
    <Routes><Route path="/search" element={<RecordSearchPage owner="owner" workbookOwners={workbookOwners} />} /><Route path="/" element={null} /></Routes>
  </MemoryRouter>);
  const input = screen.getByRole('searchbox', { name: 'Search app records' });
  fireEvent.change(input, { target: { value: 'COFFEE' } });
  fireEvent.submit(screen.getByRole('search', { name: 'App records' }));
  expect(screen.getByRole('link', { name: 'Coffee Doha' })).toHaveAttribute('href', '/cash/QAR');
  expect(screen.getByRole('link', { name: 'Coffee Lahore' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('Module'), { target: { value: 'Cash' } });
  fireEvent.change(screen.getByLabelText('Submodule'), { target: { value: 'PKR' } });
  expect(screen.queryByRole('link', { name: 'Coffee Doha' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Coffee Lahore' })).toBeVisible();
});

it('never uses cached records or search text from the previous account', () => {
  useCashWorkbookStore.setState({ workbook: { ...original, entries } });
  render(<MemoryRouter initialEntries={[{ pathname: '/search', state: { query: 'Coffee', owner: 'owner' } }]}>
    <RecordSearchPage owner="another-account" workbookOwners={workbookOwners} />
  </MemoryRouter>);
  const input = screen.getByRole('searchbox', { name: 'Keyword' });
  expect(input).toHaveValue('');
  fireEvent.change(input, { target: { value: 'Coffee' } });
  fireEvent.submit(screen.getByRole('search', { name: 'Search results' }));
  expect(screen.queryByRole('link', { name: /Coffee/ })).toBeNull();
});
