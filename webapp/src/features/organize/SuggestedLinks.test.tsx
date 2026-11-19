import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../../store/subscriptionsWorkbookStore';
import { scanSuggestedLinks } from '../../services/finance/suggestedLinksService';
import { SuggestedLinksActions, SuggestedLinksPage, SuggestedLinksProvider } from './SuggestedLinks';

vi.mock('../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => ({ uid: 'fixture' }) }));
const cards = useCreditCardWorkbookStore.getState().workbook;
const subscriptions = useSubscriptionsWorkbookStore.getState().workbook;
const bank = useBankWorkbookStore.getState().workbook;
const cash = useCashWorkbookStore.getState().workbook;
const links = useInterEntityTransfersStore.getState().workbook;
const owners = { cards: 'fixture', subscriptions: 'fixture' };
const payment = { id: 'charge', timestamp: '2026-11-19T00:00:00Z', cardId: 'card', date: '2026-11-19', amount: 50, kind: 'charge' as const, description: 'Recharge [5678]' };
afterEach(() => {
  cleanup();
  useBankWorkbookStore.setState({ workbook: bank });
  useCashWorkbookStore.setState({ workbook: cash });
  useInterEntityTransfersStore.setState({ workbook: links });
  useCreditCardWorkbookStore.setState({ workbook: cards });
  useSubscriptionsWorkbookStore.setState({ workbook: subscriptions });
  localStorage.removeItem('wc:suggested-links:fixture');
});
function show() {
  return render(<MemoryRouter><SuggestedLinksProvider owner="fixture" owners={owners}>
    <SuggestedLinksActions /><SuggestedLinksPage />
  </SuggestedLinksProvider></MemoryRouter>);
}
function fixture() {
  useCreditCardWorkbookStore.setState({ workbook: { ...cards, cards: [{ id: 'card', name: 'Card', currencyCode: 'QAR' }], transactions: [payment] } });
  useSubscriptionsWorkbookStore.setState({ workbook: { ...subscriptions, entries: [{
    id: 'sim', name: 'Sim xxx5678', amount: 50, currencyCode: 'QAR', billingCycle: 'custom', customDays: 28,
    active: true, startDate: '2026-10-22',
  }] } });
}

it('links the existing native payment without adding a duplicate', () => {
  fixture();
  show();
  expect(screen.getByText(/Matching identifier/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(useCreditCardWorkbookStore.getState().workbook.transactions).toEqual([
    { ...payment, subscriptionMatch: { subscriptionId: 'sim', occurrenceDate: '2026-11-19' } },
  ]);
  expect(scanSuggestedLinks('fixture', owners)).toEqual([]);
});

it('ignores workbooks of another owner and remembers rejection across reopening', () => {
  fixture();
  expect(scanSuggestedLinks('fixture', { ...owners, cards: 'another' })).toEqual([]);
  const page = show();
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  page.unmount();
  show();
  expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  expect(useCreditCardWorkbookStore.getState().workbook.transactions).toEqual([payment]);
});

it('automatically scans new transfer records and accepts them through the shared review page', async () => {
  useInterEntityTransfersStore.setState({ workbook: { ...links, entries: [] } });
  useBankWorkbookStore.setState({ workbook: { ...bank, settings: { ...bank.settings, accounts: [{ id: 'a', name: 'Savings', currencyCode: 'QAR', openingBalance: 0 }] }, transactions: [] } });
  useCashWorkbookStore.setState({ workbook: { ...cash, entries: [{ id: 'in', timestamp: '2026-11-19T00:00:00Z', date: '2026-11-19', amount: 100, currencyCode: 'QAR', isDeposit: true, source: 'manual', note: 'ATM [5678]' }] } });
  render(<MemoryRouter><SuggestedLinksProvider owner="fixture" owners={{ bank: 'fixture', cash: 'fixture', transfers: 'fixture' }}><SuggestedLinksPage /></SuggestedLinksProvider></MemoryRouter>);
  expect(screen.getByText('No suggestions to review.')).toBeVisible();
  useBankWorkbookStore.getState().addTransaction({ id: 'out', timestamp: '2026-11-19T00:00:00Z', accountId: 'a', date: '2026-11-19', amount: -100, isDeposit: false, source: 'manual', description: 'ATM [5678]' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' })).toBeVisible());
  expect(screen.getByRole('heading', { name: 'Savings → QAR Cash' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(useInterEntityTransfersStore.getState().workbook.entries).toHaveLength(1);
  expect(screen.getByText('Linked the existing transfer records.')).toBeVisible();
});
