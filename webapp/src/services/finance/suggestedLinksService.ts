import { categoryName } from '../../lib/categories';
import { suggestSubscriptionLinks, type SubscriptionPaymentCandidate } from '../../lib/calc/subscriptionLinkSuggestions';
import { getCurrentUser } from '../../lib/firebase/useAuthState';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../../store/subscriptionsWorkbookStore';
import type { PlanLink } from '../../types/planLink';
import type { SubscriptionMatch } from '../../types/subscriptionMatch';

export type SuggestedLinkOwners = Partial<Record<'cash' | 'bank' | 'cards' | 'subscriptions' | 'categories', string>>;
type NativePayment = SubscriptionPaymentCandidate & {
  planLink?: PlanLink;
  subscriptionMatch?: SubscriptionMatch;
  sourceLabel: string;
  url: string;
};

const occurrenceKey = (match: SubscriptionMatch) => JSON.stringify([match.subscriptionId, match.occurrenceDate]);
export const canScanSuggestedLinks = (owner: string, owners: SuggestedLinkOwners) => getCurrentUser()?.uid === owner &&
  owners.subscriptions === owner && [owners.cash, owners.bank, owners.cards].includes(owner);

export function subscribeSuggestedLinkSources(listener: () => void) {
  const stops = [useBankWorkbookStore, useCashWorkbookStore, useCreditCardWorkbookStore, useSubscriptionsWorkbookStore, useCategoryStore]
    .map(store => store.subscribe(listener));
  return () => stops.forEach(stop => stop());
}

function getPayments(owner: string, owners: SuggestedLinkOwners): NativePayment[] {
  if (!canScanSuggestedLinks(owner, owners)) return [];
  const categories = owners.categories === owner ? useCategoryStore.getState().workbook.categories : [];
  const cash = owners.cash === owner ? useCashWorkbookStore.getState().workbook.entries : [];
  const bank = owners.bank === owner ? useBankWorkbookStore.getState().workbook : undefined;
  const cards = owners.cards === owner ? useCreditCardWorkbookStore.getState().workbook : undefined;
  const accountById = new Map((bank?.settings.accounts ?? []).map(account => [account.id, account]));
  const cardById = new Map((cards?.cards ?? []).map(card => [card.id, card]));
  const category = (id?: string) => ({ categoryId: id, categoryName: id ? categoryName(id, categories) : undefined });
  return [
    ...cash.filter(row => !row.isDeposit).map(row => ({
      module: 'cash' as const, sourceId: row.currencyCode, recordId: row.id, date: row.date, amount: row.amount,
      currencyCode: row.currencyCode, description: [row.title, row.note].filter(Boolean).join(' · '), ...category(row.categoryID),
      isPending: row.isPending, planLink: row.planLink, subscriptionMatch: row.subscriptionMatch,
      sourceLabel: row.currencyCode + ' Cash', url: '/cash/' + encodeURIComponent(row.currencyCode),
    })),
    ...(bank?.transactions ?? []).flatMap(row => {
      const account = accountById.get(row.accountId);
      if (!account || row.isDeposit || row.amount >= 0) return [];
      return [{ module: 'bank' as const, sourceId: account.id, recordId: row.id, date: row.date, amount: -row.amount,
        currencyCode: account.currencyCode, description: [row.description, row.note].filter(Boolean).join(' · '),
        ...category(row.categoryID), isPending: row.isPending, planLink: row.planLink, subscriptionMatch: row.subscriptionMatch,
        sourceLabel: account.name, url: '/bank/account/' + encodeURIComponent(account.id) }];
    }),
    ...(cards?.transactions ?? []).flatMap(row => {
      const card = cardById.get(row.cardId);
      if (!card || row.kind !== 'charge') return [];
      return [{ module: 'creditCard' as const, sourceId: card.id, recordId: row.id, date: row.date, amount: row.amount,
        currencyCode: card.currencyCode, description: row.description, ...category(row.categoryID),
        planLink: row.planLink, subscriptionMatch: row.subscriptionMatch, sourceLabel: card.name,
        url: '/bank/card/' + encodeURIComponent(card.id) }];
    }),
  ];
}

export function scanSuggestedLinks(owner: string, owners: SuggestedLinkOwners) {
  if (!canScanSuggestedLinks(owner, owners)) return [];
  const subscriptions = useSubscriptionsWorkbookStore.getState().workbook.entries;
  const names = new Map(subscriptions.map(row => [row.id, row.name]));
  const payments = getPayments(owner, owners);
  const occupied = new Set(payments.flatMap(payment => {
    if (payment.isPending) return [];
    if (payment.subscriptionMatch) return [occurrenceKey(payment.subscriptionMatch)];
    const { planLink } = payment;
    return planLink?.source?.module === 'subscription'
      ? [occurrenceKey({ subscriptionId: planLink.source.id, occurrenceDate: planLink.occurrenceDate })] : [];
  }));
  return payments.flatMap(payment => {
    if (payment.subscriptionMatch || payment.planLink?.source) return [];
    return suggestSubscriptionLinks(payment, subscriptions).filter(match => !occupied.has(occurrenceKey(match)))
      .map(match => ({ ...match, payment, subscriptionName: names.get(match.subscriptionId) ?? '', owner }));
  }).sort((a, b) => b.payment.date.localeCompare(a.payment.date) || b.score - a.score || a.id.localeCompare(b.id));
}

export type SuggestedLink = ReturnType<typeof scanSuggestedLinks>[number];

export function acceptSuggestedLink(reviewed: SuggestedLink, owners: SuggestedLinkOwners) {
  const candidate = scanSuggestedLinks(reviewed.owner, owners).find(match => match.id === reviewed.id);
  if (!candidate || JSON.stringify(candidate) !== JSON.stringify(reviewed)) {
    throw new Error('This payment or renewal changed. Scan again before linking it.');
  }
  const subscriptionMatch = { subscriptionId: candidate.subscriptionId, occurrenceDate: candidate.occurrenceDate };
  const { module, recordId } = candidate.payment;
  if (module === 'cash') useCashWorkbookStore.getState().updateEntry(recordId, { subscriptionMatch });
  else if (module === 'bank') useBankWorkbookStore.getState().updateTransaction(recordId, { subscriptionMatch });
  else useCreditCardWorkbookStore.getState().updateTransaction(recordId, { subscriptionMatch });
}

export function getReviewedSubscriptionPayments(owner: string, owners: SuggestedLinkOwners) {
  return getPayments(owner, owners).flatMap(payment => payment.subscriptionMatch && !payment.isPending
    ? [{ ...payment.subscriptionMatch, payment }] : []);
}
