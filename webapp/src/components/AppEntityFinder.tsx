import { useMemo, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StandardDropdown } from './ui/StandardDropdown';
import { BankIcon, EMIIcon, FundsIcon, PersonalLoanIcon, RentalsIcon, SubscriptionsIcon } from './icons';
import { findNavigationItem, getNavigationItems, subscribeNavigation, toggleNavigationFavorite, type NavigationKind } from '../services/navigationService';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { usePageTopBarStore } from '../store/pageTopBarStore';
import { toast } from './Toast';

const icons: Record<NavigationKind, typeof FundsIcon> = { fund: FundsIcon, fundBroker: FundsIcon, bank: BankIcon, account: BankIcon, card: BankIcon,
  emi: EMIIcon, personalLoan: PersonalLoanIcon, property: RentalsIcon, subscription: SubscriptionsIcon };
/** One searchable entity finder on every page, backed by the native module registries. */
export function AppEntityFinder() {
  const sources = useSyncExternalStore(subscribeNavigation, getNavigationItems);
  const sections = useMemo(() => sources.map(section => ({ ...section, items: section.items.map(item => {
    const Icon = icons[item.kind]; return { ...item, icon: <Icon size={18}/> };
  }) })), [sources]);
  const navigate = useNavigate(), location = useLocation(), ensureSignedIn = useEnsureSignedIn();
  return <StandardDropdown label="Find an item" placeholder="Find an item…" value="" sections={sections} isTypeable
    onChange={value => {
      const item = findNavigationItem(value);
      if (!item) { toast('This item no longer exists. Search again.'); return; }
      const path = item.url.split('?')[0];
      if (path !== location.pathname) usePageTopBarStore.getState().beginNavigation(path);
      navigate(item.url);
    }} onFavoriteToggle={async value => { if (await ensureSignedIn('Sign in to save favorites.')) toggleNavigationFavorite(value); }} />;
}
