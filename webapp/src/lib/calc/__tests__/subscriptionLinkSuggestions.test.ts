import { expect, it } from 'vitest';
import type { Subscription } from '../../../types/subscriptionsWorkbook';
import { suggestSubscriptionLinks, type SubscriptionPaymentCandidate } from '../subscriptionLinkSuggestions';

const subscription: Subscription = {
  id: 'mobile', name: 'Sim xxx5678', amount: 50, currencyCode: 'QAR',
  billingCycle: 'custom', customDays: 28, startDate: '2026-10-22', active: true,
};
const payment: SubscriptionPaymentCandidate = {
  module: 'creditCard', sourceId: 'card', recordId: 'payment', currencyCode: 'QAR',
  date: '2026-11-19', amount: 50, description: 'Recharge [5678]',
};

it('matches a masked phone suffix to a near-due 28-day renewal and retains competing candidates', () => {
  const matches = suggestSubscriptionLinks(payment, [subscription, { ...subscription, id: 'other' }]);
  expect(matches.map(match => match.subscriptionId)).toEqual(['mobile', 'other']);
  expect(matches[0]).toMatchObject({ occurrenceDate: '2026-11-19', reasons: ['Matching identifier', 'Same amount'] });
});

it('requires useful description or category evidence and rejects pending, linked and out-of-window records', () => {
  expect(suggestSubscriptionLinks({ ...payment, description: 'Receipt 5678' }, [subscription])).toEqual([]);
  expect(suggestSubscriptionLinks({ ...payment, isPending: true }, [subscription])).toEqual([]);
  expect(suggestSubscriptionLinks({ ...payment, linkedSubscriptionId: 'mobile' }, [subscription])).toEqual([]);
  expect(suggestSubscriptionLinks({ ...payment, date: '2026-11-25' }, [subscription])).toEqual([]);
  expect(suggestSubscriptionLinks({ ...payment, description: 'Merchant', categoryId: 'mobile-category' },
    [{ ...subscription, categoryID: 'mobile-category' }])[0]?.reasons).toEqual(['Same category', 'Same amount']);
});
