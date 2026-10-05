import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionsPage } from '../SubscriptionsPage';
import { useSubscriptionsWorkbookStore } from '../../../../store/subscriptionsWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../../../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../../../store/plannedBankWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../../../store/plannedCreditCardWorkbookStore';

afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('Subscription renewal scopes', () => {
  it('does not propose a renewal again when it was fulfilled before its due date', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    useSubscriptionsWorkbookStore.getState().setWorkbook({ settings: { defaultCurrency: 'QAR' }, entries: [{ id: 's', name: 'Membership', amount: 20, currencyCode: 'QAR', billingCycle: 'monthly', startDate: '2026-09-01', active: true, paidVia: { module: 'cash' } }] });
    const cash = usePlannedCashWorkbookStore.getState();
    cash.setWorkbook({ ...cash.workbook, entries: [{ id: 'paid', sourceSubscriptionId: 's', date: '2026-11-01', fulfilledDate: '2026-10-05', amount: 20, currencyCode: 'QAR', type: 'OUT', executed: true }] });
    const bank = usePlannedBankWorkbookStore.getState(); bank.setWorkbook({ ...bank.workbook, entries: [] });
    const cards = usePlannedCreditCardWorkbookStore.getState(); cards.setWorkbook({ ...cards.workbook, entries: [] });
    render(<MemoryRouter initialEntries={['/subscriptions?section=plans&period=custom&from=2026-11-01&to=2026-11-30']}><SubscriptionsPage user={null} syncStatus="local" cloudEmpty={false} uploadLocalToCloud={async () => {}} /></MemoryRouter>);
    expect(screen.getByText('No unpaid renewals in this period.')).toBeTruthy();
    expect(screen.queryByText('Planned', { selector: 'h4' })).toBeNull();
  });
});
