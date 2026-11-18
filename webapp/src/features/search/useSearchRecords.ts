import { useMemo } from 'react';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useFundsWorkbookStore } from '../../store/fundsWorkbookStore';
import { usePersonalLoansWorkbookStore } from '../../store/personalLoansWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../../store/plannedRentalsWorkbookStore';
import { usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import { useRentalsWorkbookStore } from '../../store/rentalsWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../../store/subscriptionsWorkbookStore';
import { useWorkbookStore } from '../../store/workbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { useNetWorthSnapshotsWorkbookStore } from '../../store/netWorthSnapshotsWorkbookStore';
import { linkTargetPath } from '../transfers/pages/TransferLinksPage';
import type { BrokerPortfolioData } from '../../types/workbook';
import { collectSearchRecords as collect, type SearchRecord } from './recordSearch';

export type SearchWorkbook = 'cash' | 'bank' | 'cards' | 'rentals' | 'funds' | 'emi' | 'loans' | 'subscriptions' |
  'qse' | 'psx' | 'cashPlans' | 'bankPlans' | 'cardPlans' | 'rentalPlans' | 'transfers' | 'snapshots';

const encode = encodeURIComponent;
type NamedRecord = { id: string; name?: string; person?: string };
function scope(records: NamedRecord[], fallback: string, url: (id: string) => string) {
  const labels = new Map(records.map(row => [row.id, row.name ?? row.person ?? row.id]));
  return (id: string) => ({ id, label: labels.get(id) ?? fallback, url: url(encode(id)) });
}

type ExchangeWorkbook = BrokerPortfolioData & {
  activeBrokerId?: string;
  brokerProfiles?: { id: string; name: string; accountLabel?: string; data?: BrokerPortfolioData }[];
};

function exchangeRecords(workbook: ExchangeWorkbook | undefined, module: string, base: string) {
  if (!workbook) return [];
  const profiles: NonNullable<ExchangeWorkbook['brokerProfiles']> = workbook.brokerProfiles?.length ? workbook.brokerProfiles : [{ id: '', name: module, data: workbook }];
  return profiles.flatMap(profile => {
    const data = profile.id === workbook.activeBrokerId ? workbook : profile.data;
    const context = () => ({
      id: profile.id, label: [profile.name, profile.accountLabel].filter(Boolean).join(' · '),
      url: !profile.id || profile.id === workbook.activeBrokerId ? base + '/transactions' : base + '/brokers',
    });
    return [
      ...collect({ module, kind: 'Broker', records: [profile], context }),
      ...collect({ module, kind: 'Trade', records: data?.transactions ?? [], context }),
      ...collect({ module, kind: 'Cash transfer', records: data?.transfers ?? [], context }),
      ...collect({ module, kind: 'Cash adjustment', records: data?.adjustments ?? [], context }),
      ...collect({ module, kind: 'Dividend', records: data?.dividends ?? [], context }),
      ...collect({ module, kind: 'Trade strategy', records: (data?.tradePlans ?? []).map(plan => ({
        ...plan, ticker: plan.defaultTicker, reference: plan.legs.map(leg => leg.ticker).filter(Boolean).join(' '),
      })), context: () => ({ ...context(), url: profile.id === workbook.activeBrokerId ? base + '/trade-strategy' : context().url }) }),
    ];
  });
}

export function useSearchRecords(available: ReadonlySet<SearchWorkbook>) {
  const cash = useCashWorkbookStore(s => available.has('cash') ? s.workbook : undefined);
  const bank = useBankWorkbookStore(s => available.has('bank') ? s.workbook : undefined);
  const cards = useCreditCardWorkbookStore(s => available.has('cards') ? s.workbook : undefined);
  const rentals = useRentalsWorkbookStore(s => available.has('rentals') ? s.workbook : undefined);
  const funds = useFundsWorkbookStore(s => available.has('funds') ? s.workbook : undefined);
  const emi = useEMIWorkbookStore(s => available.has('emi') ? s.workbook : undefined);
  const loans = usePersonalLoansWorkbookStore(s => available.has('loans') ? s.workbook : undefined);
  const subscriptions = useSubscriptionsWorkbookStore(s => available.has('subscriptions') ? s.workbook : undefined);
  const qse = useWorkbookStore(s => available.has('qse') ? s.workbook : undefined);
  const psx = usePSXWorkbookStore(s => available.has('psx') ? s.workbook : undefined);
  const cashPlans = usePlannedCashWorkbookStore(s => available.has('cashPlans') ? s.workbook : undefined);
  const bankPlans = usePlannedBankWorkbookStore(s => available.has('bankPlans') ? s.workbook : undefined);
  const cardPlans = usePlannedCreditCardWorkbookStore(s => available.has('cardPlans') ? s.workbook : undefined);
  const rentalPlans = usePlannedRentalsWorkbookStore(s => available.has('rentalPlans') ? s.workbook : undefined);

  const transfers = useInterEntityTransfersStore(s => available.has('transfers') ? s.workbook : undefined);
  const snapshots = useNetWorthSnapshotsWorkbookStore(s => available.has('snapshots') ? s.workbook : undefined);

  return useMemo(() => {
    const cashScope = (code: string) => ({ id: code, label: code, url: '/cash/' + encode(code) });
    const bankScope = scope(bank?.settings.accounts ?? [], 'Bank account', id => bank ? '/bank/account/' + id : '/bank');
    const cardScope = scope(cards?.cards ?? [], 'Credit card', id => cards ? '/bank/card/' + id : '/bank');
    const propertyScope = scope(rentals?.settings.properties ?? [], 'Property', id => rentals ? '/rentals/' + id : '/rentals');
    const fundScope = scope(funds?.funds ?? [], 'Fund', id => '/funds?fund=' + id);
    const emiScope = scope(emi?.entries ?? [], 'Installment loan', id => '/emi-loans?loan=' + id);
    const loanScope = scope(loans?.loans ?? [], 'Personal loan', id => '/personal-loans?loan=' + id);
    const result: SearchRecord[] = [
      ...collect({ module: 'Cash', kind: 'Transaction', records: cash?.entries ?? [], context: row => cashScope(row.currencyCode) }),
      ...collect({ module: 'Cash', kind: 'Plan', records: cashPlans?.entries ?? [], context: row => cashScope(row.currencyCode) }),
      ...collect({ module: 'Banking', kind: 'Bank', records: bank?.settings.banks ?? [], context: row => ({ id: 'banks', label: 'Banks', url: '/bank/bank/' + encode(row.id) }) }),
      ...collect({ module: 'Banking', kind: 'Account', records: bank?.settings.accounts ?? [], context: row => bankScope(row.id) }),
      ...collect({ module: 'Banking', kind: 'Transaction', records: bank?.transactions ?? [], context: row => bankScope(row.accountId) }),
      ...collect({ module: 'Banking', kind: 'Plan', records: bankPlans?.entries ?? [], context: row => bankScope(row.accountId) }),
      ...collect({ module: 'Credit cards', kind: 'Card', records: cards?.cards ?? [], context: row => cardScope(row.id) }),
      ...collect({ module: 'Credit cards', kind: 'Transaction', records: cards?.transactions ?? [], context: row => cardScope(row.cardId) }),
      ...collect({ module: 'Credit cards', kind: 'Plan', records: cardPlans?.entries ?? [], context: row => cardScope(row.cardId) }),
      ...collect({ module: 'Rentals', kind: 'Property', records: rentals?.settings.properties ?? [], context: row => propertyScope(row.id) }),
      ...collect({ module: 'Rentals', kind: 'Transaction', records: rentals?.entries ?? [], context: row => propertyScope(row.propertyId) }),
      ...collect({ module: 'Rentals', kind: 'Plan', records: rentalPlans?.entries ?? [], context: row => propertyScope(row.propertyId) }),
      ...collect({ module: 'Planning', kind: 'Budget', records: cashPlans?.budgets ?? [],
        context: () => ({ id: 'budgets', label: 'Currency budgets', url: '/planning' }) }),
      ...collect({ module: 'Planning', kind: 'Plan group', records: cashPlans?.planGroups ?? [],
        context: () => ({ id: 'groups', label: 'Plan groups', url: '/planning' }) }),
      ...collect({ module: 'Funds', kind: 'Fund', records: funds?.funds ?? [], context: row => fundScope(row.id) }),
      ...collect({ module: 'Funds', kind: 'Trade', records: funds?.transactions ?? [], context: row => fundScope(row.ticker) }),
      ...collect({ module: 'Funds', kind: 'Broker', records: funds?.brokers ?? [], context: row => ({ id: 'brokers', label: 'Brokers', url: '/funds?broker=' + encode(row.id) }) }),
      ...collect({ module: 'Installment loans', kind: 'Loan', records: emi?.entries ?? [], context: row => emiScope(row.id) }),
      ...collect({ module: 'Installment loans', kind: 'Repayment', records: emi?.repayments ?? [], context: row => emiScope(row.loanId) }),
      ...(emi?.entries ?? []).flatMap(loan => collect({ module: 'Installment loans', kind: 'Obligation',
        records: (loan.contractSchedule ?? []).map(row => ({ ...row, date: row.dueDate })), context: () => emiScope(loan.id) })),
      ...collect({ module: 'Personal loans', kind: 'Loan', records: loans?.loans ?? [], context: row => loanScope(row.id) }),
      ...collect({ module: 'Personal loans', kind: 'Repayment', records: loans?.repayments ?? [], context: row => loanScope(row.loanId) }),
      ...collect({ module: 'Subscriptions', kind: 'Subscription', records: subscriptions?.entries ?? [], context: row => ({ id: row.id, label: row.name, url: '/subscriptions?subscription=' + encode(row.id) }) }),
      ...collect({ module: 'Transfers', kind: 'Linked transfer', records: (transfers?.entries ?? []).map(row => ({
        ...row, description: row.rateSource,
      })), context: row => ({
        id: row.from.module + ':' + row.to.module, label: row.from.module + ' → ' + row.to.module, url: linkTargetPath(row.from),
      }) }),
      ...collect({ module: 'Dashboard', kind: 'Net worth snapshot', records: (snapshots?.entries ?? []).map(row => ({
        ...row, name: 'Net worth · ' + row.date, reference: Object.keys(row.byCurrency).join(' '),
      })), context: () => ({ id: 'snapshots', label: 'Snapshots', url: '/dashboard' }) }),
      ...exchangeRecords(qse, 'QSE', ''),
      ...exchangeRecords(psx, 'PSX', '/psx'),
    ];
    return result;
  }, [cash, bank, cards, rentals, funds, emi, loans, subscriptions, qse, psx, cashPlans, bankPlans, cardPlans, rentalPlans, transfers, snapshots]);
}
