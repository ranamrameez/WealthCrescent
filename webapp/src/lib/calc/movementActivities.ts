import { collectBudgetActivities, type BudgetActivity, type BudgetOccurrenceWindow } from './budgetPlanner';
import type { RecentActivityInputs } from './recentActivity';
import type { PlannedCreditCardTransaction } from '../../types/plannedCreditCard';
import type { InterEntityTransfer, LinkModule } from '../../types/interEntityTransfer';
import type { Category } from '../../types/finance';
import type { FeeCalculator, QSESettings, Transaction } from '../../types/workbook';
import type { PSXSettings } from '../../types/psxWorkbook';
import { categoryName } from '../categories';
import { planOccurrences } from './planOccurrences';
import { makeQSEFeeCalculator } from './fees';
import { makePSXFeeCalculator } from './psxFees';

export type MovementKind = 'operating' | 'financing' | 'investment' | 'transfer' | 'unclassified';
export type MovementModule = BudgetActivity['module'] | 'creditCards' | 'personalLoans' | 'emi' | 'funds' | 'qse' | 'psx';
export interface MovementActivity extends Omit<BudgetActivity, 'module'> { module: MovementModule; movementKind?: MovementKind; recordType?: string; }
export const MOVEMENT_MODULE_LABELS: Record<MovementModule, string> = { cash: 'Cash', bank: 'Bank', rentals: 'Rentals', creditCards: 'Credit cards', personalLoans: 'Personal loans', emi: 'EMI / loans', funds: 'Funds', qse: 'QSE', psx: 'PSX' };
export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = { operating: 'Income / spending', financing: 'Financing', investment: 'Investments', transfer: 'Internal transfers', unclassified: 'Unclassified movement' };
type ExchangeMovementInput<T> = Omit<RecentActivityInputs['qse'], 'settings' | 'brokerProfiles'> & {
  settings: T; brokerProfiles?: Array<Omit<NonNullable<RecentActivityInputs['qse']['brokerProfiles']>[number], 'settings'> & { settings: T }>;
};
export interface MovementInputs {
  native: Omit<RecentActivityInputs, 'qse' | 'psx'> & { qse: ExchangeMovementInput<QSESettings>; psx: ExchangeMovementInput<PSXSettings> };
  base: Parameters<typeof collectBudgetActivities>[0];
  plannedCards: PlannedCreditCardTransaction[];
  categories: Category[];
  links: InterEntityTransfer[];
  qseSettings: QSESettings;
  psxSettings: PSXSettings;
}
const linkModule = (module: MovementModule): LinkModule => module === 'creditCards' ? 'creditCard' : module;

/** Read-only movement adapters. Contract/schedule balances never become cash receipts.
 * Explicit domain links choose one economic record; account-only transfers stay separate.
 * No label/amount matching, currency conversion, inferred principal/interest split or writes. */
export function collectMovementActivities(input: MovementInputs, modules: readonly string[], window: BudgetOccurrenceWindow = {}, sourcePolicy: 'dashboard' | 'all-ledgers' = 'dashboard'): MovementActivity[] {
  const { native, categories } = input;
  const rows: MovementActivity[] = collectBudgetActivities({ ...input.base, links: [] }, window)
    .map(item => ({ ...item, recordType: item.executed?'entry':'plan', movementKind: item.sourceEmiLoanId?'financing':item.module==='rentals' || item.sourceSubscriptionId?'operating':'unclassified' }));
  const add = (row: MovementActivity) => { if (Number.isFinite(row.amount) && row.date && row.currencyCode) rows.push(row); };
  const cards = new Map(native.cards.cards.map(card => [card.id,card]));
  for (const tx of native.cards.transactions) {
    const card = cards.get(tx.cardId); if (!card) continue;
    add({ id: tx.id, recordType: 'card-transaction', module: 'creditCards', sourceId: card.id, sourceLabel: card.name, date: tx.date,
      amount: tx.kind === 'payment' || tx.kind === 'cashAdvance' ? tx.amount : -tx.amount,
      currencyCode: card.currencyCode, categoryId: tx.categoryID, category: categoryName(tx.categoryID,categories), description: tx.description || tx.kind, executed: true, planGroupId: tx.planLink?.groupId,
      movementKind: tx.kind === 'payment' ? 'transfer' : tx.kind === 'cashAdvance' || tx.planLink?.source?.module==='emi' ? 'financing' : 'operating' });
  }
  for (const plan of planOccurrences(input.plannedCards,window.fromDate,window.toDate,window.asOf,window.horizonDays)) {
    const card = cards.get(plan.cardId); if (!card || plan.executed) continue;
    add({ id: plan.id, recordType: 'plan', module: 'creditCards', sourceId: card.id, sourceLabel: card.name, date: plan.date,
      amount: plan.kind === 'payment' || plan.kind === 'cashAdvance' ? plan.amount : -plan.amount,
      currencyCode: card.currencyCode, category: plan.category, description: plan.description, executed: false, planGroupId: plan.groupId,
      movementKind: plan.kind === 'payment' ? 'transfer' : plan.kind === 'cashAdvance' || plan.sourceEmiLoanId ? 'financing' : 'operating' });
  }
  const loans = new Map(native.personalLoans.loans.map(loan => [loan.id,loan]));
  for (const tx of native.personalLoans.repayments) {
    const loan = loans.get(tx.loanId); if (!loan) continue;
    add({ id: tx.id, recordType: 'loan-repayment', module: 'personalLoans', sourceId: loan.id, sourceLabel: loan.person, date: tx.date,
      amount: loan.direction === 'owed_to_me' ? tx.amount : -tx.amount, currencyCode: loan.currencyCode,
      categoryId: tx.categoryID, category: categoryName(tx.categoryID,categories), description: tx.description || 'Loan repayment', executed: true, isPending: tx.isPending, movementKind: 'financing' });
  }
  for (const plan of native.personalLoans.plans ?? []) {
    const loan = loans.get(plan.loanId); if (!loan || plan.executed) continue;
    add({ id: plan.id, recordType: 'plan', module: 'personalLoans', sourceId: loan.id, sourceLabel: loan.person, date: plan.date,
      amount: loan.direction === 'owed_to_me' ? plan.amount : -plan.amount, currencyCode: loan.currencyCode,
      categoryId: plan.categoryID, category: categoryName(plan.categoryID,categories), description: plan.description || 'Planned loan repayment', executed: false, movementKind: 'financing' });
  }
  const emi = new Map(native.emi.entries.map(loan => [loan.id,loan]));
  for (const tx of native.emi.repayments) {
    const loan = emi.get(tx.loanId); if (!loan) continue;
    const common = { module: 'emi' as const, sourceId: loan.id, sourceLabel: loan.name, date: tx.date, currencyCode: loan.currencyCode, executed: true };
    add({ ...common, id: tx.id, recordType: 'emi-repayment', amount: -tx.amount, description: tx.description || 'Loan installment', movementKind: 'financing' });
    if (tx.fine) add({ ...common, id: tx.id + ':fine', recordType: 'emi-fine', amount: -tx.fine, description: 'Installment fine', category: 'Loan fines', movementKind: 'operating' });
  }
  const funds = new Map(native.funds.funds.map(fund => [fund.id,fund]));
  for (const tx of native.funds.transactions) {
    const fund = funds.get(tx.ticker); if (!fund) continue;
    add({ id: tx.id ?? 'trade:' + native.funds.transactions.indexOf(tx), module: 'funds', recordType: 'trade', sourceId: fund.id, sourceLabel: fund.name, date: tx.date,
      amount: (tx.action === 'BUY' ? -1 : 1) * tx.shares * tx.price, currencyCode: fund.currencyCode, description: tx.action + ' ' + fund.name,
      categoryId: fund.categoryID, category: categoryName(fund.categoryID,categories), executed: true, isPending: tx.isPending, movementKind: 'investment' });
  }
  for (const tx of native.funds.dividends) {
    const fund = funds.get(tx.ticker); if (!fund) continue;
    add({ id: tx.id ?? 'dividend:' + native.funds.dividends.indexOf(tx), recordType: 'dividend', module: 'funds', sourceId: fund.id, sourceLabel: fund.name, date: tx.date,
      amount: tx.amount, currencyCode: fund.currencyCode, description: 'Dividend ' + fund.name, category: 'Dividends', executed: true, movementKind: 'operating' });
  }
  const transfers = (module: 'funds' | 'qse' | 'psx', sourceId: string, sourceLabel: string, currency: string, list: RecentActivityInputs['funds']['transfers']) => {
    for (const tx of list) {
      const common = { module, sourceId, sourceLabel, date: tx.date, currencyCode: tx.currencyCode ?? currency, executed: true };
      add({ ...common, id: tx.id, recordType: 'transfer', amount: tx.type === 'DEPOSIT' ? tx.gross : -tx.gross, description: tx.description || tx.type, movementKind: 'transfer' });
      if (tx.fee) add({ ...common, id: tx.id + ':fee', recordType: 'transfer-fee', amount: -tx.fee, description: 'Transfer fee', category: 'Transfer fees', movementKind: 'operating' });
    }
  };
  transfers('funds','cash','Funds cash',native.funds.settings.legacyTransferCurrency ?? native.funds.settings.defaultCurrency,native.funds.transfers);
  for (const module of ['qse','psx'] as const) {
    const wb = native[module];
    const profiles = wb.brokerProfiles?.length ? wb.brokerProfiles.map(profile => ({ id: profile.id, name: profile.name,
      settings: profile.id === wb.activeBrokerId ? input[module + 'Settings' as 'qseSettings' | 'psxSettings'] : profile.settings,
      data: profile.id === wb.activeBrokerId ? wb : profile.data })) : [{ id: 'legacy', name: module.toUpperCase(), settings: input[module + 'Settings' as 'qseSettings' | 'psxSettings'], data: wb }];
    for (const profile of profiles) {
      if (!profile.data) continue;
      const data = profile.data, settings = profile.settings as QSESettings | PSXSettings;
      const calcFee: FeeCalculator = module === 'qse' ? makeQSEFeeCalculator(settings) : makePSXFeeCalculator(settings as PSXSettings,data.transactions);
      const common = { module, sourceId: profile.id, sourceLabel: profile.name, currencyCode: settings.currency, executed: true };
      for (const tx of data.transactions) {
        const gross = tx.shares * tx.price, fee = calcFee(gross,tx.action === 'BUY',{ shares: tx.shares, tx: tx as Transaction });
        const id = tx.id ?? 'trade:' + data.transactions.indexOf(tx);
        add({ ...common, id, recordType: 'trade', date: tx.date, amount: (tx.action === 'BUY' ? -1 : 1) * gross, description: tx.action + ' ' + tx.ticker, isPending: tx.isPending, movementKind: 'investment' });
        if (fee) add({ ...common, id: id + ':fee', recordType: 'trade-fee', date: tx.date, amount: -fee, description: 'Trade fee · ' + tx.ticker, category: 'Trading fees', isPending: tx.isPending, movementKind: 'operating' });
      }
      transfers(module,profile.id,profile.name,settings.currency,data.transfers);
      for (const tx of data.dividends) add({ ...common, id: tx.id ?? 'dividend:' + data.dividends.indexOf(tx), recordType: 'dividend', date: tx.date, amount: tx.amount, description: 'Dividend ' + tx.ticker, category: 'Dividends', movementKind: 'operating' });
      for (const tx of data.adjustments) add({ ...common, id: tx.id ?? 'adjustment:' + data.adjustments.indexOf(tx), recordType: 'adjustment', date: tx.date, amount: tx.amount, description: tx.note || 'Cash adjustment', movementKind: 'unclassified' });
    }
  }
  // Domain side is canonical for rental/loan events. Do not discard rental income
  // merely because it was deposited in a bank. Cash/bank counterpart is excluded.
  const domain = new Set<LinkModule>(['rentals','personalLoans','emi']);
  const suppressed = new Set<string>();
  const internal = new Set<string>();
  const entityModules=new Set<LinkModule>(['bank','rentals','personalLoans','emi','creditCard','qse','psx']);
  const linkable=(row:MovementActivity)=>row.executed && (['qse','psx','funds'].includes(row.module)?row.recordType==='transfer':row.module==='emi'?row.recordType==='emi-repayment':row.recordType!=='plan');
  const rowKey=(row:MovementActivity)=>linkModule(row.module)+':'+(entityModules.has(linkModule(row.module))?(row.sourceId ?? '')+':':'')+row.id;
  for (const link of input.links) {
    const key=(side:typeof link.from,id:string)=>{
      let ref=side.ref;
      if(!ref && entityModules.has(side.module)) {
        const candidates=new Set(rows.filter(row=>linkable(row) && linkModule(row.module)===side.module && row.id===id).map(row=>row.sourceId));
        if(candidates.size===1)ref=[...candidates][0];
      }
      return side.module+':'+(entityModules.has(side.module)?(ref ?? '__unresolved__')+':':'')+id;
    };
    const left=key(link.from,link.fromRecordId),right=key(link.to,link.toRecordId);
    if(domain.has(link.from.module) && ['cash','bank'].includes(link.to.module))suppressed.add(right);
    else if(domain.has(link.to.module) && ['cash','bank'].includes(link.from.module))suppressed.add(left);
    else {internal.add(left);internal.add(right);}
  }
  const included = (row: MovementActivity) => {
    if(sourcePolicy === 'all-ledgers')return true;
    if (row.module === 'creditCards') return cards.get(row.sourceId!)?.includeInNetWorth !== false;
    if (row.module === 'personalLoans') return loans.get(row.sourceId!)?.includeInNetWorth !== false;
    if (row.module === 'emi') return emi.get(row.sourceId!)?.includeInNetWorth !== false;
    if (row.module === 'funds' && ['trade','dividend'].includes(row.recordType ?? '')) return funds.get(row.sourceId!)?.includeInNetWorth !== false;
    if (row.module === 'qse' || row.module === 'psx') {
      const wb = native[row.module];
      return (row.sourceId === wb.activeBrokerId || !wb.brokerProfiles?.length ? wb.settings : wb.brokerProfiles.find(profile => profile.id === row.sourceId)?.settings)?.includeInNetWorth !== false;
    }
    return true;
  };
  return rows.map(row => {
      if (row.categoryId || !row.category) return row;
      const matches = categories.filter(category => category.name.trim().toLowerCase() === row.category!.trim().toLowerCase());
      return matches.length === 1 ? { ...row, categoryId: matches[0].id } : row;
    }).filter(row => !linkable(row) || !suppressed.has(rowKey(row)))
    .map(row => linkable(row) && internal.has(rowKey(row)) ? { ...row, movementKind: 'transfer' as const } : row)
    .filter(row => modules.includes(row.module) && included(row))
    .sort((a,b) => a.date.localeCompare(b.date) || a.module.localeCompare(b.module) || a.id.localeCompare(b.id));
}

export type MovementPopulation = 'actual' | 'pending' | 'planned';
export function selectMovementActivities(activities: MovementActivity[], from: string, to: string, today: string, population: MovementPopulation, kind: MovementKind | 'all' = 'all') {
  return activities.filter(item => (kind === 'all' ? item.movementKind !== 'transfer' : (item.movementKind ?? 'unclassified') === kind)
    && item.date >= from && item.date <= to && (population === 'actual' ? item.executed && !item.isPending && item.date <= today : population === 'pending' ? !!item.isPending : !item.executed && !item.isPending));
}
/** Calendar rows include empty months; first/last rows respect exact partial-month bounds. */
export function monthlyMovementReport(activities: MovementActivity[], from: string, to: string, today: string, population: MovementPopulation, kind: MovementKind | 'all' = 'all') {
  const items = selectMovementActivities(activities,from,to,today,population,kind);
  const months: string[] = [];
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
  if (validDate(from) && validDate(to) && from <= to) {
    const [year,month] = from.split('-').map(Number), [endYear,endMonth] = to.split('-').map(Number);
    const count = (endYear-year)*12 + endMonth-month+1;
    for (let index=0;index<count;index++) {
      const offset = month-1+index;
      months.push(String(year+Math.floor(offset/12)).padStart(4,'0') + '-' + String(offset%12+1).padStart(2,'0'));
    }
  }
  const rows = [...new Set(items.map(item=>item.currencyCode))].sort().map(currency => {
    const native = items.filter(item=>item.currencyCode === currency);
    const monthly = months.map(month => {
      const records = native.filter(item=>item.date.slice(0,7) === month);
      const income = records.reduce((total,item)=>total+Math.max(0,item.amount),0);
      const expense = records.reduce((total,item)=>total+Math.max(0,-item.amount),0);
      return { month, income, expense, netFlow: income-expense, netWorth: null, count: records.length };
    });
    return { currency, months: monthly };
  });
  return { from, to, population, kind, months, rows };
}
