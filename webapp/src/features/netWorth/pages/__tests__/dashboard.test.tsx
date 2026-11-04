import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { NetWorthPage } from '../NetWorthPage';
import { TopBar } from '../../../../components/TopBar';
import { useCashWorkbookStore } from '../../../../store/cashWorkbookStore';
import { useBankWorkbookStore } from '../../../../store/bankWorkbookStore';
import { createEmptyBankWorkbook } from '../../../../store/defaultBankWorkbook';
import { useEnabledCurrenciesStore } from '../../../../store/enabledCurrenciesStore';
import { saveFxRates } from '../../../../lib/fx';

vi.mock('react-chartjs-2', () => ({ Chart: () => <div>Trend chart</div>, Doughnut: () => <div>Allocation chart</div> }));
vi.mock('../../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => false }));
vi.mock('../../../../lib/firebase/useAuthState', () => ({ useAuthState: () => ({ user: null }) }));
vi.mock('../../../../hooks/useUpcomingItems', () => ({ useUpcomingItems: () => [] }));

beforeEach(() => {
  useEnabledCurrenciesStore.setState({ enabledCodes: ['USD', 'QAR'] });
  useCashWorkbookStore.setState({ workbook: { settings: { defaultCurrency: 'USD' }, entries: [
    { id: 'cash1', date: new Date().toISOString().slice(0, 10), currencyCode: 'USD', amount: 100, isDeposit: true, note: 'Cash deposit', source: 'manual' },
  ] } });
  const bank = createEmptyBankWorkbook();
  bank.settings.accounts = [{ id: 'bank1', name: 'Checking', currencyCode: 'QAR', openingBalance: 200 }];
  useBankWorkbookStore.setState({ workbook: bank });
  saveFxRates({ base: 'USD', rates: { USD: 1, QAR: 2 }, fetchedAt: new Date().toISOString(), source: 'manual' });
});
afterEach(cleanup);
function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function show(url = '/net-worth') {
  return render(<MemoryRouter initialEntries={[url]}><TopBar /><Location /><NetWorthPage syncStatus="idle" cloudEmpty={false} uploadLocalToCloud={async () => {}} /></MemoryRouter>);
}
it('shows converted overall summaries in both currencies before the per-currency breakdown', () => {
  show();
  const usd = screen.getByRole('heading', { name: 'Overall summary — USD' }).parentElement!;
  const qar = screen.getByRole('heading', { name: 'Overall summary — QAR' }).parentElement!;
  expect(usd.textContent).toContain('200.00');
  expect(qar.textContent).toContain('400.00');
  const sections = document.querySelectorAll('.standard-section-anchor');
  expect(sections[0].textContent).toContain('Overall summary');
  expect(sections[1].textContent).toContain('Current balances by currency');
  expect(screen.queryByLabelText('Show total in')).toBeNull();
});
it('centralizes URL-backed section and source filters and restores defaults', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const modal = document.querySelector<HTMLElement>('.modal-box')!;
  expect(within(modal).getByText('Include in Net Worth')).toBeTruthy();
  fireEvent.click(within(modal).getByRole('button', { name: 'Per currency summary' }));
  expect(screen.getByTestId('location').textContent).toContain('show-currencies=false');
  fireEvent.click(within(modal).getByRole('button', { name: 'CASH' }));
  expect(screen.getByTestId('location').textContent).toContain('entities=');
  const usd = screen.getByRole('heading', { name: 'Overall summary — USD' }).parentElement!;
  expect(usd.textContent).toContain('100.00');
  fireEvent.click(within(modal).getByRole('button', { name: 'Reset' }));
  expect(screen.getByTestId('location').textContent).toBe('');
  fireEvent.click(within(modal).getByRole('button', { name: 'Done' }));
  expect(document.querySelector('.modal-box')).toBeNull();
});

it('applies the URL-backed custom date range to flow figures and exposes the selected dates', () => {
  const todayISO = new Date().toISOString().slice(0, 10);
  show(`/net-worth?period=custom&from=${todayISO}&to=${todayISO}`);
  const summary = screen.getByRole('heading', { name: 'Overall summary — USD' }).parentElement!;
  expect(summary.textContent).toContain('Period net flow');
  expect(summary.textContent).toContain('100.00');

  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const modal = document.querySelector<HTMLElement>('.modal-box')!;
  expect((within(modal).getByLabelText('From date') as HTMLInputElement).value).toBe(todayISO);
  expect((within(modal).getByLabelText('To date') as HTMLInputElement).value).toBe(todayISO);
  expect(within(modal).getByText(new RegExp(todayISO))).toBeTruthy();
});

it('renders the dashboard sections without nesting cards and provides period insights', () => {
  const todayISO = new Date().toISOString().slice(0, 10);
  show(`/net-worth?section=analytics&period=custom&from=${todayISO}&to=${todayISO}`);
  expect(document.querySelector('.standard-card .card')).toBeNull();
  expect(screen.getByRole('heading', { name: new RegExp('Insights') })).toBeTruthy();
  expect(screen.getAllByText(/Largest asset:/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Recorded net activity:/).length).toBeGreaterThan(0);
});

it('restores hidden sections from a deep link and opens exchange rates only from the FAB', () => {
  show('/net-worth?show-currencies=false&show-plans=false&show-analytics=false');
  expect(document.querySelectorAll('.standard-section-anchor')).toHaveLength(1);
  expect(screen.queryByText('Refresh rates')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Exchange rates' }));
  expect(within(document.querySelector<HTMLElement>('.modal-box')!).getByText('Refresh rates')).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.querySelector('.modal-box')).toBeNull();
});
