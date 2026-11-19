import { auth } from '../../lib/firebase/client';
import { useSubscriptionsWorkbookStore } from '../../store/subscriptionsWorkbookStore';
import type { Subscription } from '../../types/subscriptionsWorkbook';

export function requireSubscriptionOwner(owner: string) {
  if (!auth?.currentUser || auth.currentUser.uid !== owner) {
    throw new Error('The signed-in account changed. Review the subscription again.');
  }
  return useSubscriptionsWorkbookStore.getState();
}

export function requireCurrentSubscription(store: ReturnType<typeof requireSubscriptionOwner>, expected: Subscription) {
  const current = store.workbook.entries.find(item => item.id === expected.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error('The subscription changed. Review it again.');
  }
  return current;
}

export function saveSubscription(draft: Subscription, owner: string, expected?: Subscription) {
  const store = requireSubscriptionOwner(owner);
  const name = draft.name.trim();
  if (!name) throw new Error('Enter a subscription name.');
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) throw new Error('Enter a valid amount.');
  if (draft.billingCycle === 'custom' && (!draft.customDays || !Number.isInteger(draft.customDays) || draft.customDays <= 0)) {
    throw new Error('Enter a whole number of days for the custom cycle.');
  }
  if (expected) {
    const current = requireCurrentSubscription(store, expected);
    store.updateEntry(current.id, { ...draft, id: current.id, name });
  } else {
    store.addEntry({ ...draft, id: crypto.randomUUID(), name });
  }
  return name;
}

export function toggleSubscriptionActive(expected: Subscription, owner: string, date: string) {
  const store = requireSubscriptionOwner(owner);
  const current = requireCurrentSubscription(store, expected);
  const active = !current.active;
  store.updateEntry(current.id, { active, cancelledDate: active ? undefined : date });
  return active;
}

export function deleteSubscription(expected: Subscription, owner: string) {
  const store = requireSubscriptionOwner(owner);
  store.deleteEntry(requireCurrentSubscription(store, expected).id);
}
