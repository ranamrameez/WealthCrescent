import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../../store/subscriptionsWorkbookStore';
import { scanSuggestedLinks } from '../../services/finance/suggestedLinksService';
import { SuggestedLinksActions, SuggestedLinksPage, SuggestedLinksProvider } from './SuggestedLinks';

vi.mock('../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => ({ uid: 'fixture' }) }));
const cards = useCreditCardWorkbookStore.getState().workbook;
const subscriptions = useSubscriptionsWorkbookStore.getState().workbook;
const owners = { cards: 'fixture', subscriptions: 'fixture' };
const payment = { id: 'charge', timestamp: '2026-11-19T00:00:00Z', cardId: 'card', date: '2026-11-19', amount: 50, kind: 'charge' as const, description: 'Recharge [5678]' };
afterEach(() => {
  cleanup();
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
