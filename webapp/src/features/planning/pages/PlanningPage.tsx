import { UnifiedBudgetsPanel } from '../../../components/UnifiedBudgetsPanel';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { RecordRow } from '../../../components/RecordRow';
import { TableCard } from '../../../components/TableCard';
import { DateValue } from '../../../components/DateValue';
import { PlanningTab as CashPlanningTab } from '../../cash/pages/CashPage';
import { PlanningTab as BankPlanningTab } from '../../bank/pages/BankPage';
import { useSortableRows } from '../../../hooks/useSortableRows';
import { FinancePlansHierarchy } from '../../../components/FinancePlansHierarchy';
import { useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../../components/PageHeading';
import { BackButton } from '../../../components/BackButton';
import { useState } from 'react';
import { CollapsibleCard } from '../../../components/Card';
import { OrphanPlanCleanup } from '../../../components/OrphanPlanCleanup';
import { Field, Select } from '../../../components/ui/Field';
import { UpcomingList } from '../../../components/UpcomingList';
import { useUpcomingItems } from '../../../hooks/useUpcomingItems';
import { useUrlTransactionFilters } from '../../../hooks/useUrlTransactionFilters';
import { TransactionFilterMenu } from '../../../components/TransactionFilterMenu';
import { TopBarControls } from '../../../components/TopBarControls';
import { fmtMoney } from '../../../lib/format';
import { usePlanningOverview } from '../../../hooks/usePlanning';
import type { BudgetActivity, BudgetModule } from '../../../services/finance/planningService';

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

  const { filters, setFilters, resetFilters, activeCount } = useUrlTransactionFilters();
  const { activities, categoryOptions, filteredActivities, budget } = usePlanningOverview(filters);

  const [params] = useSearchParams();
  const controls = <TopBarControls><TransactionFilterMenu value={filters} categories={categoryOptions} activeCount={activeCount} onChange={setFilters} onClear={resetFilters} /></TopBarControls>;
  return <div className="standard-page">
    {!params.get('plan') && <PageHeading back={<BackButton to="/net-worth">Overview</BackButton>}><h1 className="pagetitle">Planning</h1></PageHeading>}
    <FinancePlansHierarchy filters={filters} controls={controls} overview={<>
      <OrphanPlanCleanup />
      <CollapsibleCard title="Upcoming (next 30 days)" className="mt-md" defaultOpen={false}><UpcomingList items={upcoming} emptyText="Nothing expected in the next 30 days." /></CollapsibleCard>
      <UnifiedBudgetsPanel fromDate={filters.fromDate} toDate={filters.toDate}/>
      <BudgetOverview budget={budget} />
      <ActivityList activities={activities} filtered={filteredActivities} />
      <CollapsibleCard title="Module planning tools" defaultOpen={false}>
        <CashPlanningTab showFab={false} plannedSyncStatus={cashPlannedSyncStatus} plannedCloudEmpty={cashPlannedCloudEmpty} uploadPlannedLocalToCloud={uploadCashPlannedLocalToCloud} />
        <BankPlanningTab showFab={false} plannedSyncStatus={bankPlannedSyncStatus} plannedCloudEmpty={bankPlannedCloudEmpty} uploadPlannedLocalToCloud={uploadBankPlannedLocalToCloud} />
      </CollapsibleCard>
    </>} />
  </div>;
}

function BudgetOverview({ budget }: { budget: ReturnType<typeof usePlanningOverview>['budget'] }) {
  const [mode, setMode] = useState<'budget' | 'modules'>('budget');
  const { currencyTotals, categoryTotals, moduleTotals } = budget;
  const { rows: pageCategoryTotals, controls: categoryPaginationControls } = useTablePagination(categoryTotals);
  return <TableCard rows={categoryTotals} title={<h3 className="m-0">Monthly Budget Plan</h3>} className="mb-md">
    <p className="text-muted mt-0">Cross-module, category-aware view of planned activity. Transfers remain visible by source and category so they can be reviewed without being mistaken for income.</p>
    <div className="row gap-sm mb-md">
      <Field label="View"><Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="budget">Budget by category</option><option value="modules">Module plan details</option></Select></Field>
    </div>
    <div className="grid-auto mb-md" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
      {currencyTotals.map(([currency, totals]) => <div className="card" key={currency}><div className="label">{currency} budget</div><div className="sub pill-positive">Income {fmtMoney(totals.income, currency)}</div><div className="sub pill-negative">Expenses {fmtMoney(totals.expenses, currency)}</div><div className={`value ${totals.net >= 0 ? 'pill-positive' : 'pill-negative'}`}>Net {fmtMoney(totals.net, currency)}</div></div>)}
      <div className="stat-card card"><div className="label">Planned items</div><div className="value">{budget.count}</div></div>
    </div>
    {mode === 'budget' ? <><div className="table-scroll"><table><thead><tr><th>Category</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead><tbody>{pageCategoryTotals.map(row => <RecordRow record={row} key={JSON.stringify([row.category, row.currencyCode])}><td>{row.category} ({row.currencyCode})</td><td className="pill-positive">{fmtMoney(row.income, row.currencyCode)}</td><td className="pill-negative">{fmtMoney(row.expense, row.currencyCode)}</td><td>{fmtMoney(row.net, row.currencyCode)}</td></RecordRow>)}{!categoryTotals.length && <tr><td colSpan={4} className="text-muted">No planned items for this month.</td></tr>}</tbody></table></div>{categoryTotals.length ? categoryPaginationControls : null}</> : <div className="account-summary-grid">{moduleTotals.map(({module, currencyCode, total}) => <div className="card" key={module + ':' + currencyCode}><strong>{module === 'bank' ? 'Banking' : module[0].toUpperCase() + module.slice(1)}</strong><div className={total >= 0 ? 'pill-positive' : 'pill-negative'}>{fmtMoney(total, currencyCode)} net planned</div></div>)}</div>}
  </TableCard>;
}


function ActivityList({ activities, filtered }: { activities: BudgetActivity[]; filtered: BudgetActivity[] }) {
  const moduleLabel: Record<BudgetModule, string> = { cash: 'Cash', bank: 'Banking', rentals: 'Rentals' };
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
  const { rows: pageRows, controls: paginationControls } = useTablePagination(sorted);

  return (
    <TableCard rows={sorted} title={<h3 className="m-0">All planned financial activity</h3>} className="mb-md">
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
            {pageRows.map((a) => (
              <RecordRow record={a} key={`${a.module}:${a.id}`}>
                <td><DateValue value={a.date} /></td>
                <td>{moduleLabel[a.module]}</td>
                <td>{a.sourceLabel}</td>
                <td>{a.description}</td>
                <td>{a.category || '—'}</td>
                <td className={a.amount >= 0 ? 'pill-positive' : 'pill-negative'}>{fmtMoney(a.amount, a.currencyCode)}</td>
                <td className="text-muted">{a.executed ? 'Actual' : 'Planned'}</td>
              </RecordRow>
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
      {paginationControls}
    </TableCard>
  );
}
