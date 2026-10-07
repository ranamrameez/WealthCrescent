import { DateValue } from '../../../components/DateValue';
import { PlanningTab as CashPlanningTab } from '../../cash/pages/CashPage';
import { PlanningTab as BankPlanningTab } from '../../bank/pages/BankPage';
import { useSortableRows } from '../../../hooks/useSortableRows';
import { FinancePlansHierarchy } from '../../../components/FinancePlansHierarchy';
import { useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../../components/PageHeading';
import { BackButton } from '../../../components/BackButton';
import { useMemo, useState } from 'react';
import { CollapsibleCard } from '../../../components/Card';
import { OrphanPlanCleanup } from '../../../components/OrphanPlanCleanup';
import { Field, Select } from '../../../components/ui/Field';
import { UpcomingList } from '../../../components/UpcomingList';
import { useUpcomingItems } from '../../../hooks/useUpcomingItems';
import { useUrlTransactionFilters } from '../../../hooks/useUrlTransactionFilters';
import { TransactionFilterMenu } from '../../../components/TransactionFilterMenu';
import { TopBarControls } from '../../../components/TopBarControls';
import { fmtMoney } from '../../../lib/format';
import {
  collectBudgetActivities,
  type BudgetActivity,
  type BudgetModule,
} from '../../../lib/calc/budgetPlanner';
import { useCategoryStore } from '../../../store/categoryStore';
import { useCashWorkbookStore } from '../../../store/cashWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../../store/plannedCashWorkbookStore';
import { useBankWorkbookStore } from '../../../store/bankWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../../store/plannedBankWorkbookStore';
import { useRentalsWorkbookStore } from '../../../store/rentalsWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../../../store/plannedRentalsWorkbookStore';
import { useInterEntityTransfersStore } from '../../../store/interEntityTransfersStore';


/** Shared plan hierarchy, combined activity and the existing module planning tools. */
export function PlanningPage({cashPlannedSyncStatus,cashPlannedCloudEmpty,uploadCashPlannedLocalToCloud,bankPlannedSyncStatus,bankPlannedCloudEmpty,uploadBankPlannedLocalToCloud}: {
  cashPlannedSyncStatus: string;
  cashPlannedCloudEmpty: boolean;
  uploadCashPlannedLocalToCloud: () => Promise<void>;
  bankPlannedSyncStatus: string;
  bankPlannedCloudEmpty: boolean;
  uploadBankPlannedLocalToCloud: () => Promise<void>;
}) {
  const upcoming = useUpcomingItems(30);

  const cashEntries = useCashWorkbookStore((s) => s.workbook.entries);
  const plannedCash = usePlannedCashWorkbookStore((s) => s.workbook.entries);

  const bankAccounts = useBankWorkbookStore((s) => s.workbook.settings.accounts);
  const bankTransactions = useBankWorkbookStore((s) => s.workbook.transactions);
  const plannedBank = usePlannedBankWorkbookStore((s) => s.workbook.entries);

  const rentalProperties = useRentalsWorkbookStore((s) => s.workbook.settings.properties);
  const rentalEntries = useRentalsWorkbookStore((s) => s.workbook.entries);
  const plannedRentals = usePlannedRentalsWorkbookStore((s) => s.workbook.entries);

  const links = useInterEntityTransfersStore((s) => s.workbook.entries);
  const categories = useCategoryStore((s) => s.workbook.categories);
  const { filters, setFilters, resetFilters, activeCount } = useUrlTransactionFilters();
  const activities = useMemo(
    () => collectBudgetActivities({ cashEntries, plannedCash, bankAccounts, bankTransactions, plannedBank, rentalProperties, rentalEntries, plannedRentals, categories, links }),
    [cashEntries, plannedCash, bankAccounts, bankTransactions, plannedBank, rentalProperties, rentalEntries, plannedRentals, categories, links],
  );
  const categoryOptions = useMemo(() => [...new Set(activities.map((a) => a.category || 'Uncategorized'))].sort(), [activities]);

  const [params] = useSearchParams();
  const controls = <TopBarControls><TransactionFilterMenu value={filters} categories={categoryOptions} activeCount={activeCount} onChange={setFilters} onClear={resetFilters} /></TopBarControls>;
  return <div className="standard-page">
    {!params.get('plan') && <PageHeading back={<BackButton to="/net-worth">Overview</BackButton>}><h1 className="pagetitle">Planning</h1></PageHeading>}
    <FinancePlansHierarchy filters={filters} controls={controls} overview={<>
      <OrphanPlanCleanup />
      <CollapsibleCard title="Upcoming (next 30 days)" className="mt-md" defaultOpen={false}><UpcomingList items={upcoming} emptyText="Nothing expected in the next 30 days." /></CollapsibleCard>
      <BudgetOverview activities={activities} filters={filters} />
      <ActivityList activities={activities} filters={filters} />
      <CollapsibleCard title="Module planning tools" defaultOpen={false}>
        <CashPlanningTab showFab={false} plannedSyncStatus={cashPlannedSyncStatus} plannedCloudEmpty={cashPlannedCloudEmpty} uploadPlannedLocalToCloud={uploadCashPlannedLocalToCloud} />
        <BankPlanningTab showFab={false} plannedSyncStatus={bankPlannedSyncStatus} plannedCloudEmpty={bankPlannedCloudEmpty} uploadPlannedLocalToCloud={uploadBankPlannedLocalToCloud} />
      </CollapsibleCard>
    </>} />
  </div>;
}

function BudgetOverview({ activities, filters }: { activities: BudgetActivity[]; filters: ReturnType<typeof useUrlTransactionFilters>['filters'] }) {
  const month = filters.fromDate.slice(0, 7);
  const [mode, setMode] = useState<'budget' | 'modules'>('budget');
  const monthRows = useMemo(() => activities.filter((a) => !a.executed && a.date.startsWith(month)), [activities, month]);
  const currencyTotals = useMemo(() => {
    const out = new Map<string, { income: number; expenses: number }>();
    monthRows.forEach((row) => {
      const current = out.get(row.currencyCode) ?? { income: 0, expenses: 0 };
      row.amount >= 0 ? current.income += row.amount : current.expenses += Math.abs(row.amount);
      out.set(row.currencyCode, current);
    });
    return [...out.entries()];
  }, [monthRows]);
  const categoryTotals = useMemo(() => {
    const out = new Map<string, { income: number; expense: number }>();
    monthRows.forEach((row) => {
      const category = row.category || 'Uncategorized';
      const current = out.get(category) ?? { income: 0, expense: 0 };
      row.amount >= 0 ? current.income += row.amount : current.expense += Math.abs(row.amount);
      out.set(category, current);
    });
    return [...out.entries()].sort((a, b) => (b[1].expense + b[1].income) - (a[1].expense + a[1].income));
  }, [monthRows]);
  const moduleTotals = useMemo(() => {
    const out = new Map<BudgetModule, number>();
    monthRows.forEach((row) => out.set(row.module, (out.get(row.module) ?? 0) + row.amount));
    return [...out.entries()];
  }, [monthRows]);
  return <CollapsibleCard title={<h3 className="m-0">Monthly Budget Plan</h3>} className="mb-md">
    <p className="text-muted mt-0">Cross-module, category-aware view of planned activity. Transfers remain visible by source and category so they can be reviewed without being mistaken for income.</p>
    <div className="row gap-sm mb-md">
      <Field label="View"><Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="budget">Budget by category</option><option value="modules">Module plan details</option></Select></Field>
    </div>
    <div className="grid-auto mb-md" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
      {currencyTotals.map(([currency, totals]) => <div className="card" key={currency}><div className="label">{currency} budget</div><div className="sub pill-positive">Income {fmtMoney(totals.income, currency)}</div><div className="sub pill-negative">Expenses {fmtMoney(totals.expenses, currency)}</div><div className={`value ${totals.income - totals.expenses >= 0 ? 'pill-positive' : 'pill-negative'}`}>Net {fmtMoney(totals.income - totals.expenses, currency)}</div></div>)}
      <div className="stat-card card"><div className="label">Planned items</div><div className="value">{monthRows.length}</div></div>
    </div>
    {mode === 'budget' ? <div className="table-scroll"><table><thead><tr><th>Category</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead><tbody>{categoryTotals.map(([category, totals]) => <tr key={category}><td>{category}</td><td className="pill-positive">{fmtMoney(totals.income, monthRows.find((row) => row.category === category)?.currencyCode ?? 'USD')}</td><td className="pill-negative">{fmtMoney(totals.expense, monthRows.find((row) => row.category === category)?.currencyCode ?? 'USD')}</td><td>{fmtMoney(totals.income - totals.expense, monthRows.find((row) => row.category === category)?.currencyCode ?? 'USD')}</td></tr>)}{!categoryTotals.length && <tr><td colSpan={4} className="text-muted">No planned items for this month.</td></tr>}</tbody></table></div> : <div className="account-summary-grid">{moduleTotals.map(([module, total]) => <div className="card" key={module}><strong>{module === 'bank' ? 'Banking' : module[0].toUpperCase() + module.slice(1)}</strong><div className={total >= 0 ? 'pill-positive' : 'pill-negative'}>{fmtMoney(total, monthRows.find((row) => row.module === module)?.currencyCode ?? 'USD')} net planned</div></div>)}</div>}
  </CollapsibleCard>;
}


function ActivityList({ activities, filters }: { activities: BudgetActivity[]; filters: ReturnType<typeof useUrlTransactionFilters>['filters'] }) {
  const moduleLabel: Record<BudgetModule, string> = { cash: 'Cash', bank: 'Banking', rentals: 'Rentals' };
  const filtered = useMemo(
    () => activities.filter((a) => {
      if (filters.fromDate && a.date < filters.fromDate) return false;
      if (filters.toDate && a.date > filters.toDate) return false;
      if (filters.direction === 'in' && a.amount < 0) return false;
      if (filters.direction === 'out' && a.amount >= 0) return false;
      if (filters.category !== 'all' && (a.category || 'Uncategorized') !== filters.category) return false;
      return true;
    }),
    [activities, filters],
  );

  type Col = 'date' | 'module' | 'source' | 'category' | 'amount' | 'status';
  const sortValue = (a: BudgetActivity, col: Col): number | string => {
    switch (col) {
      case 'module': return a.module;
      case 'source': return a.sourceLabel;
      case 'category': return a.category ?? '';
      case 'amount': return a.amount;
      case 'status': return a.executed ? 1 : 0;
      default: return a.date;
    }
  };
  const { sorted, Th } = useSortableRows(filtered, sortValue, 'date', 'desc');

  return (
    <CollapsibleCard title={<h3 className="m-0">All planned financial activity</h3>} className="mb-md">
      <p className="text-muted">Centralized top-bar filters control this activity view.</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <Th col="date">Date</Th><Th col="module">Account</Th><Th col="source">Account/Property</Th>
              <th>Description</th><Th col="category">Category</Th><Th col="amount">Amount</Th><Th col="status">Status</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={`${a.module}:${a.id}`}>
                <td><DateValue value={a.date} /></td>
                <td>{moduleLabel[a.module]}</td>
                <td>{a.sourceLabel}</td>
                <td>{a.description}</td>
                <td>{a.category || '—'}</td>
                <td className={a.amount >= 0 ? 'pill-positive' : 'pill-negative'}>{fmtMoney(a.amount, a.currencyCode)}</td>
                <td className="text-muted">{a.executed ? 'Actual' : 'Planned'}</td>
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td colSpan={7} className="text-muted">
                  {activities.length ? 'No activity matches these filters.' : 'No planned activity yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}
