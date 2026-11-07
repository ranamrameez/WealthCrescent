import { auth } from '../lib/firebase/client';
import { useBankWorkbookStore } from '../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../store/creditCardWorkbookStore';
import { useFundsWorkbookStore } from '../store/fundsWorkbookStore';
import { useEMIWorkbookStore } from '../store/emiWorkbookStore';
import { usePersonalLoansWorkbookStore } from '../store/personalLoansWorkbookStore';
import { useRentalsWorkbookStore } from '../store/rentalsWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../store/subscriptionsWorkbookStore';

export type NavigationKind = 'fund' | 'fundBroker' | 'bank' | 'account' | 'card' | 'emi' | 'personalLoan' | 'property' | 'subscription';
export interface NavigationItem { value: string; id: string; label: string; url: string; kind: NavigationKind; isFavorite: boolean; keywords: string }
export interface NavigationSection { title: string; items: NavigationItem[] }
const listeners = new Set<() => void>();
let cache: NavigationSection[] | undefined;
const invalidate = () => { cache = undefined; listeners.forEach(listener => listener()); };
[useBankWorkbookStore, useCreditCardWorkbookStore, useFundsWorkbookStore, useEMIWorkbookStore,
  usePersonalLoansWorkbookStore, useRentalsWorkbookStore, useSubscriptionsWorkbookStore].forEach(store => store.subscribe(invalidate));
export function subscribeNavigation(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function getNavigationItems(): NavigationSection[] {
  if (cache) return cache;
  const bank = useBankWorkbookStore.getState().workbook;
  const funds = useFundsWorkbookStore.getState().workbook;
  const section = <T extends { id: string; name?: string; person?: string; isActive?: boolean; isFavorite?: boolean; currencyCode?: string }>(
    title: string, kind: NavigationKind, records: T[], path: (id: string) => string,
  ): NavigationSection => ({ title, items: records.filter(item => item.isActive !== false).map(item => ({
    value: `${kind}:${item.id}`, id: item.id, kind, label: `${item.name ?? item.person ?? item.id}${item.currencyCode ? ` (${item.currencyCode})` : ''}`,
    isFavorite: !!item.isFavorite, keywords: `${title} ${item.currencyCode ?? ''}`, url: path(encodeURIComponent(item.id)),
  })).sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.label.localeCompare(b.label)) });
  cache = [
    section('Funds', 'fund', funds.funds, id => `/funds?fund=${id}`),
    section('Fund brokers', 'fundBroker', funds.brokers, id => `/funds?broker=${id}`),
    section('Banks', 'bank', bank.settings.banks ?? [], id => `/bank/bank/${id}`),
    section('Bank accounts', 'account', bank.settings.accounts.filter(account => !account.migratedToCreditCardId), id => `/bank/account/${id}`),
    section('Credit cards', 'card', useCreditCardWorkbookStore.getState().workbook.cards, id => `/bank/card/${id}`),
    section('EMI loans', 'emi', useEMIWorkbookStore.getState().workbook.entries, id => `/emi-loans?loan=${id}`),
    section('Personal loans', 'personalLoan', usePersonalLoansWorkbookStore.getState().workbook.loans, id => `/personal-loans?loan=${id}`),
    section('Properties', 'property', useRentalsWorkbookStore.getState().workbook.settings.properties, id => `/rentals/${id}`),
    section('Subscriptions', 'subscription', useSubscriptionsWorkbookStore.getState().workbook.entries, id => `/subscriptions?subscription=${id}`),
  ];
  return cache;
}

export function findNavigationItem(value: string) { return getNavigationItems().flatMap(section => section.items).find(item => item.value === value); }
export function toggleNavigationFavorite(value: string) {
  if (!auth?.currentUser) throw new Error('Sign in to save favorites.');
  const item = findNavigationItem(value);
  if (!item) throw new Error('This item no longer exists or is archived.');
  const patch = { isFavorite: !item.isFavorite };
  switch (item.kind) {
    case 'bank': useBankWorkbookStore.getState().updateBank(item.id, patch); break;
    case 'account': useBankWorkbookStore.getState().updateAccount(item.id, patch); break;
    case 'card': useCreditCardWorkbookStore.getState().updateCard(item.id, patch); break;
    case 'emi': useEMIWorkbookStore.getState().updateEntry(item.id, patch); break;
    case 'personalLoan': usePersonalLoansWorkbookStore.getState().updateLoan(item.id, patch); break;
    case 'property': useRentalsWorkbookStore.getState().updateProperty(item.id, patch); break;
    case 'subscription': useSubscriptionsWorkbookStore.getState().updateEntry(item.id, patch); break;
    case 'fund': case 'fundBroker': {
      const store = useFundsWorkbookStore.getState(), field = item.kind === 'fund' ? 'funds' : 'brokers';
      store.setWorkbook({ ...store.workbook, [field]: store.workbook[field].map(record => record.id === item.id ? { ...record, ...patch } : record) });
      break;
    }
  }
}
