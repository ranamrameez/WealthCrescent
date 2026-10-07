import { DateValue } from '../../../components/DateValue';
import { QuickEntitySwitch } from '../../../components/QuickEntitySwitch';
import { PageHeading } from '../../../components/PageHeading';
import { EntityEditorModal, EntityActions } from '../../../components/EntityEditorModal';
import { BackButton } from '../../../components/BackButton';
import { PageFilters } from '../../../components/PageFilters';
import { BalanceSummaryCards } from '../../../components/BalanceSummaryCards';
import { TransactionFilterMenu } from '../../../components/TransactionFilterMenu';
import { useUrlTransactionFilters, type TransactionPageFilters } from '../../../hooks/useUrlTransactionFilters';
import { ModuleDetailTemplate } from '../../../components/ModuleDetailTemplate';
import type { User } from 'firebase/auth';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Card, CollapsibleCard, EntityCard, MoneyValue } from '../../../components/Card';
import { CategorySelect } from '../../../components/CategorySelect';
import { Notice } from '../../../components/Notice';
import { Tooltip } from '../../../components/Tooltip';
import { HUES, hueStyle } from '../../../lib/statCardHues';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { EditIcon, PlusIcon, StarIcon, TrashIcon } from '../../../components/icons';
import { StandardPageSections } from '../../../components/StandardPageSections';
import { EntityScopeMenu, selectedEntityValues } from '../../../components/EntityScopeMenu';
import { TopBarControls } from '../../../components/TopBarControls';
import { usePageTopBarRightSlot } from '../../../hooks/usePageTopBar';
import { toast } from '../../../components/Toast';
import { Field, Select, TextInput } from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { useEnabledCurrencies } from '../../../hooks/useEnabledCurrencies';
import { useLastCurrency } from '../../../hooks/useLastCurrency';
import {
  alertTriggerMs,
  generateRenewalOccurrences,
  monthlyEquivalent,
  nextBillingDate,
  spendByCategory,
  totalMonthlySpendByCurrency,
  upcomingRenewals,
} from '../../../lib/calc/subscriptionsModule';
import { dlBarV, dlDoughnut } from '../../../lib/chartLabels';
import { applyChartTheme } from '../../../lib/chartSetup';
import { categoryName, UNCATEGORIZED_ID } from '../../../lib/categories';
import { cssVar, tickerColor } from '../../../lib/cssVar';
import { fmtMoney, formatDate } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { firebaseReady } from '../../../lib/firebase/client';
import { useAppearanceStore } from '../../../store/appearanceStore';
import { useBankWorkbookStore } from '../../../store/bankWorkbookStore';
import { useCategoryStore } from '../../../store/categoryStore';
import { useCreditCardWorkbookStore } from '../../../store/creditCardWorkbookStore';
import { createEmptySubscriptionsWorkbook } from '../../../store/defaultSubscriptionsWorkbook';
import { usePlannedBankWorkbookStore } from '../../../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../../store/plannedCreditCardWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../../../store/subscriptionsWorkbookStore';
import type { Subscription, SubscriptionAlert } from '../../../types/subscriptionsWorkbook';
import type { Category } from '../../../types/finance';
import type { PlannedBankTransaction } from '../../../types/plannedBank';
import type { PlannedCashEntry } from '../../../types/plannedCash';
import type { PlannedCreditCardTransaction } from '../../../types/plannedCreditCard';
import { ChartCard } from '../../qse/components/ChartCard';
import { gridAutoStyle } from '../../../lib/gridStyle';

const today = () => new Date().toISOString().slice(0, 10);

const CYCLE_LABEL: Record<Subscription['billingCycle'], string> = {
  monthly: '/mo',
  yearly: '/yr',
  weekly: '/wk',
  custom: '/cycle',
};

function emptySubscription(defaultCurrency: string): Subscription {
  return { id: '', name: '', amount: 0, currencyCode: defaultCurrency, billingCycle: 'monthly', startDate: today(), active: true };
}

/* ============================== Add subscription ============================== */

/** Floating "add a subscription" button (user feedback 2026-08-27: adding
 * an entity isn't a routine task, use FABs — same pattern already
 * established for EMI/Banking/Cash/Bank Planning, README Done items
 * 166/170). */
function AddSubscriptionFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EntityActions actions={[{ label: "Add a subscription", icon: <PlusIcon />, onClick: () => setOpen(true) }]} />
      {open && (
        <EntityEditorModal title="Add a subscription" onClose={() => setOpen(false)}>
          <AddSubscriptionForm onSaved={() => setOpen(false)} />
        </EntityEditorModal>
      )}
    </>
  );
}

function AddSubscriptionForm({ onSaved, subscription }: { onSaved?: () => void; subscription?: Subscription } = {}) {
  const addEntry = useSubscriptionsWorkbookStore((s) => s.addEntry);
  const defaultCurrency = useSubscriptionsWorkbookStore((s) => s.workbook.settings.defaultCurrency);
  const [lastCurrency, setLastCurrency] = useLastCurrency('subscriptions', defaultCurrency);
  const ensureSignedIn = useEnsureSignedIn();
  const [s, setS] = useState<Subscription>(() => subscription ? { ...subscription } : emptySubscription(lastCurrency));
  const currencyOptions = useEnabledCurrencies(s.currencyCode);

  const submit = async () => {
    if (!s.name.trim()) return toast('Enter a subscription name.');
    if (!s.amount || s.amount <= 0) return toast('Enter an amount.');
    if (s.billingCycle === 'custom' && (!s.customDays || s.customDays <= 0)) return toast('Enter the custom cycle length in days.');
    if (!(await ensureSignedIn('Sign in to save subscriptions.'))) return;
    if (subscription) useSubscriptionsWorkbookStore.getState().updateEntry(subscription.id, { ...s, name: s.name.trim() });
    else addEntry({ ...s, id: crypto.randomUUID(), name: s.name.trim() });
    toast(`Subscription "${s.name.trim()}" added.`);
    setS(emptySubscription(s.currencyCode));
    onSaved?.();
  };

  return (
    <div>
      <div className="row gap-sm">
        <Field label="Name" width={160} required>
          <TextInput value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="e.g. Netflix" />
        </Field>
        <Field label="Amount" width={110} required>
          <TextInput type="number" step="0.01" value={s.amount || ''} onChange={(e) => setS({ ...s, amount: Number(e.target.value) })} />
        </Field>
        <Field label="Currency" width={100} required>
          <Select value={s.currencyCode} onChange={(e) => { setS({ ...s, currencyCode: e.target.value }); setLastCurrency(e.target.value); }}>
            {currencyOptions.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </Select>
        </Field>
        <Field label="Billing cycle" width={140}>
          <Select value={s.billingCycle} onChange={(e) => setS({ ...s, billingCycle: e.target.value as Subscription['billingCycle'] })}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="weekly">Weekly</option>
            <option value="custom">Custom (days)</option>
          </Select>
        </Field>
        {s.billingCycle === 'custom' && (
          <Field label="Every N days" width={110} required>
            <TextInput type="number" value={s.customDays ?? ''} onChange={(e) => setS({ ...s, customDays: Number(e.target.value) })} />
          </Field>
        )}
        <Field label="Start date">
          <TextInput type="date" value={s.startDate} onChange={(e) => setS({ ...s, startDate: e.target.value })} />
        </Field>
        <Field label="Category" width={180}>
          <CategorySelect value={s.categoryID ?? UNCATEGORIZED_ID} onChange={(categoryID) => setS({ ...s, categoryID })} />
        </Field>
      </div>
      <button className="btn mt-12" onClick={submit}>
        <PlusIcon />{subscription ? "Save subscription" : "Add subscription"}
      </button>
    </div>
  );
}

/* ============================== Overall summary ============================== */

function OverallSummary({ selectedIds }: { selectedIds?: string[] } = {}) {
  const subs = useSubscriptionsWorkbookStore((s) => s.workbook.entries);
  const scoped = selectedIds ? subs.filter((s) => selectedIds.includes(s.id)) : subs;
  const totals = totalMonthlySpendByCurrency(scoped);
  const codes = Object.keys(totals);
  if (!codes.length) return null;

  return (
    <div className="grid-auto" style={{ ...gridAutoStyle(150, 8), marginBottom: 16 }}>
      {codes.map((code) => (
        <div key={code} className="stat-card card" style={hueStyle('var(--loss)')}>
          <div className="label">Monthly recurring spend ({code})</div>
          <MoneyValue n={totals[code]} currency={code} />
          <div className="sub">{fmtMoney(totals[code] * 12, code)} / year</div>
        </div>
      ))}
    </div>
  );
}

/* ============================== List ============================== */

/** User-requested (2026-09-03): "add filters to other tables as well." */
/** Resolves a subscription's category to a display name — the shared
 * registry (`categoryID`) when set, falling back to the pre-retrofit
 * free-text `category` field for old data, then "Uncategorized". Reused
 * everywhere the category shows up (cell, sort, filter) so all three stay
 * in sync by construction. */
function subCategoryLabel(s: Subscription, categoryRegistry: Category[]): string {
  return s.categoryID ? categoryName(s.categoryID, categoryRegistry) : s.category?.trim() || 'Uncategorized';
}

// Converted from a sortable table to an EntityCard grid (2026-09-09) —
// closes README Pending item 114's rollout (the last module of the
// group: Bank/Banks, Funds/Brokers, Personal Loans, EMI, Rentals already
// converted). Per UI rule 1/3: entity items belong on cards in a wrap-flex
// grid, not a table with its own per-column reorder controls — dropped
// this list's own `useSortableRows` usage (its only remaining caller in
// this file) in favor of favorite-first ordering. The old table's "Open"
// button was dropped as redundant (the whole card is already clickable),
// matching every other converted list's own precedent.
function SubscriptionList({ onSelect, selectedIds }: { onSelect: (sub: Subscription) => void; selectedIds?: string[] }) {
  const subs = useSubscriptionsWorkbookStore((s) => s.workbook.entries);
  const updateEntry = useSubscriptionsWorkbookStore((s) => s.updateEntry);
  const categoryRegistry = useCategoryStore((s) => s.workbook.categories);
  const ensureSignedIn = useEnsureSignedIn();
  const knownCategories = useMemo(
    () => [...new Set(subs.map((s) => subCategoryLabel(s, categoryRegistry)))].sort(),
    [subs, categoryRegistry],
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  // Pending item 115(c): Sr# = the subscription's own stable position in
  // the underlying (unfiltered) array, creation order — same convention as
  // every other module's entity list.
  const srNumOf = useMemo(() => new Map(subs.map((s, i) => [s.id, i + 1])), [subs]);

  const toggleFavorite = async (s: Subscription) => {
    if (!(await ensureSignedIn(s.isFavorite ? 'Sign in to unfavorite this subscription.' : 'Sign in to favorite this subscription.'))) return;
    updateEntry(s.id, { isFavorite: !s.isFavorite });
  };

  const filteredSubs = useMemo(
    () => subs.filter((s) => {
      if (selectedIds && !selectedIds.includes(s.id)) return false;
      if (statusFilter === 'active' && !s.active) return false;
      if (statusFilter === 'cancelled' && s.active) return false;
      if (categoryFilter !== 'all' && subCategoryLabel(s, categoryRegistry) !== categoryFilter) return false;
      return true;
    }),
    [subs, selectedIds, statusFilter, categoryFilter, categoryRegistry],
  );

  const sorted = useMemo(
    () => [...filteredSubs].sort((a, b) => Number(!!b.isFavorite) - Number(!!a.isFavorite)),
    [filteredSubs],
  );

  return (
    <div>
      <PageFilters><div className="row gap-sm mb-sm">
        <Field label="Status" width={130}>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="Category" width={170}>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {knownCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div></PageFilters>
      {!sorted.length ? (
        <p className="text-muted">
          {subs.length ? 'No subscriptions match these filters.' : 'No subscriptions yet — add one above.'}
        </p>
      ) : (
        <div className="entity-card-grid">
          {sorted.map((s) => {
            const monthly = monthlyEquivalent(s);
            const next = s.active ? nextBillingDate(s) : '';
            return (
              <EntityCard
                key={s.id}
                title={<><span className="text-muted entity-card-sr">#{srNumOf.get(s.id)}</span>{s.name}</>}
                subtitle={
                  <>
                    {fmtMoney(s.amount, s.currencyCode)}{CYCLE_LABEL[s.billingCycle]} ·{' '}
                    <span className="pill-info">{subCategoryLabel(s, categoryRegistry)}</span>
                    {next && <> · Next: {next}</>}
                  </>
                }
                badge={<span className={`${s.active ? 'pill-positive' : 'pill-negative'} fs-10`}>{s.active ? 'Active' : 'Cancelled'}</span>}
                statLabel="Monthly equiv."
                stat={<MoneyValue n={monthly} currency={s.currencyCode} />}
                onClick={() => onSelect(s)}
                actions={
                  <IconButton
                    label={s.isFavorite ? 'Unfavorite' : 'Favorite'}
                    icon={<StarIcon size={13} filled={s.isFavorite} />}
                    align="right"
                    onClick={() => toggleFavorite(s)}
                  />
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================== Detail ============================== */

const SUGGESTED_LEAD_DAYS = [3, 2, 1];

/** User-requested (2026-08-26): renewal/expiry alerts, either a suggested
 * lead time (3/2/1 days before the next occurrence, re-anchored each
 * cycle automatically — see `alertTriggerMs`) or a one-off custom date
 * and time, for something that doesn't follow a regular billing cycle at
 * all (e.g. "remind me on this exact date my SIM expires"). Due alerts
 * surface via `SubscriptionAlertsPopup` (App-root, auto-hiding) and the
 * Net Worth page's own upcoming-renewals notice. */
function AlertsSection({ sub }: { sub: Subscription }) {
  const updateEntry = useSubscriptionsWorkbookStore((s) => s.updateEntry);
  const ensureSignedIn = useEnsureSignedIn();
  const [customAt, setCustomAt] = useState('');
  const alerts = sub.alerts ?? [];

  const addAlert = async (patch: Pick<SubscriptionAlert, 'daysBefore' | 'customAt'>) => {
    if (!(await ensureSignedIn('Sign in to save alerts.'))) return;
    updateEntry(sub.id, { alerts: [...alerts, { id: crypto.randomUUID(), ...patch }] });
    toast('Alert added.');
  };

  const removeAlert = async (id: string) => {
    if (!(await ensureSignedIn('Sign in to update alerts.'))) return;
    updateEntry(sub.id, { alerts: alerts.filter((a) => a.id !== id) });
  };

  const describe = (a: SubscriptionAlert) => {
    if (a.daysBefore != null) return `${a.daysBefore} day${a.daysBefore === 1 ? '' : 's'} before renewal`;
    if (a.customAt) return `On ${new Date(a.customAt).toLocaleString()}`;
    return 'Alert';
  };

  return (
    <CollapsibleCard title={<h3 className="m-0">Renewal / expiry alerts</h3>} className="mb-md">
      <p className="text-muted mt-0">
        Get reminded before this renews or expires — pick a suggested lead time, or set an exact date and time.
      </p>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {SUGGESTED_LEAD_DAYS.map((d) => {
          const already = alerts.some((a) => a.daysBefore === d);
          return (
            <button
              key={d}
              className={already ? 'chip active' : 'chip'}
              disabled={already}
              onClick={() => addAlert({ daysBefore: d })}
            >
              {d} day{d === 1 ? '' : 's'} before
            </button>
          );
        })}
        <TextInput type="datetime-local" value={customAt} onChange={(e) => setCustomAt(e.target.value)} style={{ width: 200 }} />
        <button
          className="btn secondary small"
          onClick={async () => {
            if (!customAt) return toast('Pick a date and time first.');
            await addAlert({ customAt });
            setCustomAt('');
          }}
        >
          <PlusIcon size={12} />Add custom alert
        </button>
      </div>
      {alerts.length > 0 ? (
        <div className="table-scroll">
          <table>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>{describe(a)}</td>
                  <td className="text-muted">
                    {sub.active ? new Date(alertTriggerMs(sub, a) ?? 0).toLocaleString() : 'Subscription cancelled'}
                  </td>
                  <td><IconButton label="Remove" icon={<TrashIcon size={13} />} align="right" onClick={() => removeAlert(a.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted" style={{ marginBottom: 0 }}>No alerts configured yet.</p>
      )}
    </CollapsibleCard>
  );
}

function SubscriptionAccountSummary({ sub, subscriptions, filters }: { sub?: Subscription; subscriptions?: Subscription[]; filters: TransactionPageFilters }) {
  const scoped = subscriptions ?? (sub ? [sub] : []);
  const currency = scoped[0]?.currencyCode ?? '';
  const bank = usePlannedBankWorkbookStore(state => state.workbook.entries);
  const cash = usePlannedCashWorkbookStore(state => state.workbook.entries);
  const cards = usePlannedCreditCardWorkbookStore(state => state.workbook.entries);
  const categories = useCategoryStore(state => state.workbook.categories);
  const plans = [...bank, ...cash, ...cards].filter(plan => scoped.some(item => item.id === plan.sourceSubscriptionId));
  const proposals = scoped.flatMap(item => generateRenewalOccurrences(item).filter(occurrence => !plans.some(plan => plan.sourceSubscriptionId === item.id && plan.date === occurrence.date)).map(occurrence => ({ ...occurrence, sourceSubscriptionId: item.id, executed: false })));
  const paid = plans.filter(plan => plan.executed).map(plan => ({ ...plan, date: plan.fulfilledDate ?? plan.date }));
  const amount = (plan: { amount: number }) => Math.abs(plan.amount);
  const inPeriod = (plan: { date: string }) => (!filters.fromDate || plan.date >= filters.fromDate) && (!filters.toDate || plan.date <= filters.toDate);
  const matches = filters.direction !== 'in' && filters.source !== 'statement-import';
  const matchesCategory = (plan: { sourceSubscriptionId?: string }) => filters.category === 'all' || scoped.some(item => item.id === plan.sourceSubscriptionId && subCategoryLabel(item, categories) === filters.category);
  return <BalanceSummaryCards kind="subscriptions" currency={currency} summary={{
    start: -paid.filter(plan => filters.fromDate && plan.date < filters.fromDate).reduce((total, plan) => total + amount(plan), 0),
    current: -paid.filter(plan => !filters.toDate || plan.date <= filters.toDate).reduce((total, plan) => total + amount(plan), 0),
    inflow: 0, outflow: matches ? -paid.filter(inPeriod).filter(matchesCategory).reduce((total, plan) => total + amount(plan), 0) : 0,
    pendingInflow: 0, pendingOutflow: 0, plannedInflow: 0,
    plannedOutflow: matches ? -[...plans, ...proposals].filter(plan => !plan.executed && inPeriod(plan) && matchesCategory(plan)).reduce((total, plan) => total + amount(plan), 0) : 0,
  }} />;
}

function SubscriptionDetail({ sub, onSelect, onBack }: { sub: Subscription; onSelect: (item: Subscription) => void; onBack: () => void }) {
  const switchEntities = useSubscriptionsWorkbookStore(s=>s.workbook.entries);
  const { filters, setFilters, resetFilters, activeCount } = useUrlTransactionFilters();
  const dateFormat = useAppearanceStore((s) => s.appearance.dateFormat);
  const updateEntry = useSubscriptionsWorkbookStore((s) => s.updateEntry);
  const deleteEntry = useSubscriptionsWorkbookStore((s) => s.deleteEntry);
  const categoryRegistry = useCategoryStore((s) => s.workbook.categories);
  const ensureSignedIn = useEnsureSignedIn();
  const [editing, setEditing] = useState(false);

  const accounts = useBankWorkbookStore((s) => s.workbook.settings.accounts);
  // Archived accounts stay findable (so an already-linked archived account
  // still shows its real name, not "a removed account") but are hidden from
  // the "pick where to generate NEW plans" picker below — same rule as
  // `AccountsList`'s own filter; see `BankAccount.isActive`'s doc comment.
  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  const cards = useCreditCardWorkbookStore((s) => s.workbook.cards);
  const activeCards = cards.filter((c) => c.isActive !== false);
  const plannedBankEntries = usePlannedBankWorkbookStore((s) => s.workbook.entries);
  const addPlannedBankEntries = usePlannedBankWorkbookStore((s) => s.addEntries);
  const deletePlannedBankEntry = usePlannedBankWorkbookStore((s) => s.deleteEntry);
  const plannedCashEntries = usePlannedCashWorkbookStore((s) => s.workbook.entries);
  const addPlannedCashEntries = usePlannedCashWorkbookStore((s) => s.addEntries);
  const deletePlannedCashEntry = usePlannedCashWorkbookStore((s) => s.deleteEntry);
  const plannedCreditCardEntries = usePlannedCreditCardWorkbookStore((s) => s.workbook.entries);
  const addPlannedCreditCardEntries = usePlannedCreditCardWorkbookStore((s) => s.addEntries);
  const deletePlannedCreditCardEntry = usePlannedCreditCardWorkbookStore((s) => s.deleteEntry);

  const [linkModule, setLinkModule] = useState<'bank' | 'cash' | 'creditCard'>(sub.paidVia?.module ?? 'bank');
  const [linkRefId, setLinkRefId] = useState(
    sub.paidVia?.module === 'bank' ? sub.paidVia.ref || activeAccounts[0]?.id || ''
      : sub.paidVia?.module === 'creditCard' ? sub.paidVia.ref || activeCards[0]?.id || ''
      : activeAccounts[0]?.id || '',
  );

  const occurrences = generateRenewalOccurrences(sub);
  const linkedLabel = sub.paidVia
    ? sub.paidVia.module === 'cash'
      ? 'Cash'
      : sub.paidVia.module === 'creditCard'
        ? cards.find((c) => c.id === sub.paidVia?.ref)?.name || 'a removed card'
        : accounts.find((a) => a.id === sub.paidVia?.ref)?.name || 'a removed account'
    : null;


  const toggleActive = async () => {
    if (!(await ensureSignedIn('Sign in to update this subscription.'))) return;
    updateEntry(sub.id, sub.active ? { active: false, cancelledDate: today() } : { active: true, cancelledDate: undefined });
    toast(sub.active ? 'Subscription cancelled.' : 'Subscription reactivated.');
  };

  const generatePlans = async () => {
    if (!(await ensureSignedIn('Sign in to generate renewal plans.'))) return;
    const completedDates = new Set([...plannedBankEntries, ...plannedCashEntries, ...plannedCreditCardEntries]
      .filter(plan => plan.sourceSubscriptionId === sub.id && plan.executed).map(plan => plan.date));
    const remainingOccurrences = occurrences.filter(occurrence => !completedDates.has(occurrence.date));
    if (linkModule === 'bank' && !accounts.some(account => account.id === linkRefId)) return toast('Pick a bank account first.');
    if (linkModule === 'creditCard' && !cards.some(card => card.id === linkRefId)) return toast('Pick a credit card first.');
    const relinking = !!sub.paidVia;
    if (relinking) {
      const ok = await confirmDialog(
        'This replaces this subscription\'s not-yet-done planned renewals with fresh ones. Already-completed plans are untouched.',
        'Regenerate renewal plans?',
      );
      if (!ok) return;
    }
    plannedBankEntries.filter((p) => p.sourceSubscriptionId === sub.id && !p.executed).forEach((p) => deletePlannedBankEntry(p.id));
    plannedCashEntries.filter((p) => p.sourceSubscriptionId === sub.id && !p.executed).forEach((p) => deletePlannedCashEntry(p.id));
    plannedCreditCardEntries.filter((p) => p.sourceSubscriptionId === sub.id && !p.executed).forEach((p) => deletePlannedCreditCardEntry(p.id));
    if (linkModule === 'bank') {
      const account = accounts.find((a) => a.id === linkRefId);
      if (!account) return toast('Pick a bank account first.');
      const newPlans: PlannedBankTransaction[] = remainingOccurrences.map((o) => ({
        id: crypto.randomUUID(), accountId: account.id, date: o.date,
        description: `Subscription: ${sub.name}`, amount: -o.amount, executed: false, sourceSubscriptionId: sub.id,
      }));
      addPlannedBankEntries(newPlans);
      updateEntry(sub.id, { paidVia: { module: 'bank', ref: account.id } });
      toast(`${newPlans.length} planned renewal${newPlans.length > 1 ? 's' : ''} added to ${account.name}'s Planning tab.`);
    } else if (linkModule === 'creditCard') {
      const card = cards.find((c) => c.id === linkRefId);
      if (!card) return toast('Pick a credit card first.');
      const newPlans: PlannedCreditCardTransaction[] = remainingOccurrences.map((o) => ({
        id: crypto.randomUUID(), cardId: card.id, date: o.date, kind: 'charge',
        description: `Subscription: ${sub.name}`, amount: o.amount, executed: false, sourceSubscriptionId: sub.id,
      }));
      addPlannedCreditCardEntries(newPlans);
      updateEntry(sub.id, { paidVia: { module: 'creditCard', ref: card.id } });
      toast(`${newPlans.length} planned renewal${newPlans.length > 1 ? 's' : ''} added to ${card.name}'s Planning section.`);
    } else {
      // A generated plan's own `category` is free text (Planning predates the
      // shared registry) — only pass a real category name through, not the
      // generic "Uncategorized" fallback `subCategoryLabel` uses for display.
      const planCategory = sub.categoryID && sub.categoryID !== UNCATEGORIZED_ID
        ? categoryName(sub.categoryID, categoryRegistry)
        : sub.category;
      const newPlans: PlannedCashEntry[] = remainingOccurrences.map((o) => ({
        id: crypto.randomUUID(), date: o.date, type: 'OUT', amount: o.amount, currencyCode: sub.currencyCode,
        category: planCategory, note: `Subscription: ${sub.name}`, executed: false, sourceSubscriptionId: sub.id,
      }));
      addPlannedCashEntries(newPlans);
      updateEntry(sub.id, { paidVia: { module: 'cash' } });
      toast(`${newPlans.length} planned renewal${newPlans.length > 1 ? 's' : ''} added to Cash's Planning tab.`);
    }
  };

  return (
    <ModuleDetailTemplate title={sub.name} backLabel="All subscriptions" onBack={onBack}
      topBarRight={<TopBarControls><QuickEntitySwitch label="Subscription" value={sub.id} options={[{value:"",label:"All items"},...switchEntities.filter(item=>item.active || item.id===sub.id).map(item=>({value:item.id,label:item.name+' ('+item.currencyCode+')'}))]} onChange={id=>{ const next=switchEntities.find(item=>item.id===id);if(next)onSelect(next);else onBack(); }} /><TransactionFilterMenu value={filters} categories={[subCategoryLabel(sub, categoryRegistry)]} activeCount={activeCount} onChange={setFilters} onClear={resetFilters} /></TopBarControls>}
      sections={[{ key: 'summary', label: 'Account summary', defaultOpen: true, content: <SubscriptionAccountSummary sub={sub} filters={filters} /> }, { key: 'details', label: 'Subscription details', defaultOpen: true, actions: [{ label: 'Edit subscription', onClick: () => setEditing(true) }], content: <>
        {(
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{sub.name}</div>
              <div className="text-muted">
                {fmtMoney(sub.amount, sub.currencyCode)}{CYCLE_LABEL[sub.billingCycle]} · {subCategoryLabel(sub, categoryRegistry)} · since {formatDate(sub.startDate, dateFormat)}
                {!sub.active && sub.cancelledDate && ` · cancelled ${formatDate(sub.cancelledDate, dateFormat)}`}
              </div>
            </div>
            <div className="row gap-sm">
              <IconButton label="Edit" icon={<EditIcon size={13} />} align="right" onClick={() => { setEditing(true); }} />
              <button className="btn secondary small" onClick={toggleActive}>{sub.active ? 'Cancel' : 'Reactivate'}</button>
              <IconButton
                label="Delete"
                icon={<TrashIcon size={13} />}
                align="right"
                onClick={async () => {
                  if (await confirmDialog('This cannot be undone.', `Delete subscription "${sub.name}"?`)) { deleteEntry(sub.id); onBack(); }
                }}
              />
            </div>
          </div>
        )}
        <div className="grid-auto" style={{ ...gridAutoStyle(130, 8), marginTop: 12 }}>
          <div className="stat-card card" style={hueStyle(HUES[3])}>
            <Tooltip text="What this costs per month on average — converted from its real billing cycle (weekly, yearly, etc.) so you can compare it to other subscriptions.">
              <div className="label clickable">Monthly equivalent</div>
            </Tooltip>
            <MoneyValue n={monthlyEquivalent(sub)} currency={sub.currencyCode} />
          </div>
          <div className="stat-card card" style={hueStyle(HUES[2])}>
            <Tooltip text="The monthly equivalent multiplied by 12 — what this subscription costs you over a full year.">
              <div className="label clickable">Yearly equivalent</div>
            </Tooltip>
            <MoneyValue n={monthlyEquivalent(sub) * 12} currency={sub.currencyCode} />
          </div>
          <div className="stat-card card" style={hueStyle(HUES[0])}><div className="label">Next renewal</div><div className="value fs-14">{sub.active ? nextBillingDate(sub) : '—'}</div></div>
          <div className="stat-card card" style={hueStyle(sub.active ? 'var(--profit)' : 'var(--loss)')}><div className="label">Status</div><div className="value fs-14">{sub.active ? 'Active' : 'Cancelled'}</div></div>
        </div>
      </> },
{ key: 'paying-account', label: 'Paying account', defaultOpen: true,  content: <>
        <h4 style={{ margin: '0 0 8px' }}>Link to a paying account</h4>
        {linkedLabel ? (
          <p className="text-muted mb-sm">
            Paid via <strong>{linkedLabel}</strong> — upcoming renewals are planned in its own Planning section.
            {' '}<Link to={sub.paidVia?.module === 'bank' ? `/bank/account/${sub.paidVia.ref}?section=plans` : sub.paidVia?.module === 'creditCard' ? `/bank/card/${sub.paidVia.ref}` : '/cash?section=planning'}>Add / edit plans</Link>
          </p>
        ) : (
          <p className="text-muted mb-sm">
            Not linked yet. Linking generates a planned (not-yet-done) entry for every renewal in the next 12
            months in the chosen payer's own Planning section.
          </p>
        )}
        <div className="row gap-sm">
          <Field label="Pays via">
            <Select value={linkModule} onChange={(e) => { const m = e.target.value as 'bank' | 'cash' | 'creditCard'; setLinkModule(m); setLinkRefId(m === 'creditCard' ? activeCards[0]?.id || '' : activeAccounts[0]?.id || ''); }}>
              <option value="bank">Bank account</option>
              <option value="cash">Cash</option>
              <option value="creditCard">Credit card</option>
            </Select>
          </Field>
          {linkModule === 'bank' && (
            activeAccounts.length ? (
              <Field label="Bank account">
                <Select value={linkRefId} onChange={(e) => setLinkRefId(e.target.value)}>
                  {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currencyCode})</option>)}
                </Select>
              </Field>
            ) : (
              <p className="text-muted">No active bank accounts — add one or reopen a closed one on the Banking page first.</p>
            )
          )}
          {linkModule === 'creditCard' && (
            activeCards.length ? (
              <Field label="Credit card">
                <Select value={linkRefId} onChange={(e) => setLinkRefId(e.target.value)}>
                  {activeCards.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.currencyCode})</option>)}
                </Select>
              </Field>
            ) : (
              <p className="text-muted">No active credit cards — add one or reopen a closed one on the Banking page first.</p>
            )
          )}
          <button
            className="btn"
            onClick={generatePlans}
            disabled={(linkModule === 'bank' && !activeAccounts.length) || (linkModule === 'creditCard' && !activeCards.length)}
          >
            {linkedLabel ? 'Re-link / regenerate plans' : 'Generate renewal plans'}
          </button>
        </div>
      </> },
{ key: 'plans', label: 'Plans', defaultOpen: true, content: <SubscriptionPlansOverview subscriptions={[sub]} filters={filters} /> },
{ key: 'payments', label: 'Payments', content: <SubscriptionPaymentsOverview subscriptions={[sub]} filters={filters} /> },
{ key: 'analytics', label: 'Analytics', content: <AnalyticsTab selectedIds={[sub.id]} currencyCode={sub.currencyCode} /> },
{ key: 'alerts', label: 'Alerts', defaultOpen: true,  content: <><AlertsSection sub={sub} /></> }]} >{editing && <EntityEditorModal title="Edit subscription" onClose={() => setEditing(false)}><AddSubscriptionForm subscription={sub} onSaved={() => setEditing(false)} /></EntityEditorModal>}<EntityActions actions={[{label:"Edit subscription",onClick:()=>setEditing(true)}]} /></ModuleDetailTemplate>
  );
}

/* ============================== Analytics ============================== */

function useSubscriptionPaymentPlans() {
  const bank = usePlannedBankWorkbookStore(state => state.workbook.entries);
  const cash = usePlannedCashWorkbookStore(state => state.workbook.entries);
  const cards = usePlannedCreditCardWorkbookStore(state => state.workbook.entries);
  return [...bank, ...cash, ...cards];
}

function SubscriptionPlansOverview({ subscriptions, filters }: { subscriptions: Subscription[]; filters: TransactionPageFilters }) {
  const payments = useSubscriptionPaymentPlans();
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat);
  const categories = useCategoryStore(state => state.workbook.categories);
  const rows = subscriptions.flatMap(subscription => generateRenewalOccurrences(subscription).filter(occurrence => !payments.some(plan => plan.sourceSubscriptionId === subscription.id && plan.executed && plan.date === occurrence.date)).map(occurrence => ({ subscription, ...occurrence })))
    .filter(row => (!filters.fromDate || row.date >= filters.fromDate) && (!filters.toDate || row.date <= filters.toDate) && filters.direction !== 'in' && filters.source !== 'statement-import' && (filters.category === 'all' || subCategoryLabel(row.subscription, categories) === filters.category)).sort((a, b) => a.date.localeCompare(b.date));
  return <div className="table-scroll"><table><thead><tr><th>Date</th><th>Subscription</th><th>Paying account</th><th>Amount</th></tr></thead><tbody>{rows.map(row => <tr key={row.subscription.id + ':' + row.date}><td>{formatDate(row.date, dateFormat)}</td><td>{row.subscription.name}</td><td>{row.subscription.paidVia?.module ?? 'Not linked'}</td><td>{fmtMoney(row.amount, row.subscription.currencyCode)}</td></tr>)}</tbody></table>{!rows.length && <p className="text-muted">No unpaid renewals in this period.</p>}</div>;
}

function SubscriptionPaymentsOverview({ subscriptions, filters }: { subscriptions: Subscription[]; filters: TransactionPageFilters }) {
  const plans = useSubscriptionPaymentPlans();
  const categories = useCategoryStore(state => state.workbook.categories);
  const rows = plans.filter(plan => plan.executed && subscriptions.some(sub => sub.id === plan.sourceSubscriptionId && (filters.category === 'all' || subCategoryLabel(sub, categories) === filters.category)))
    .map(plan => ({ plan, date: plan.fulfilledDate ?? plan.date, sub: subscriptions.find(sub => sub.id === plan.sourceSubscriptionId)! }))
    .filter(row => (!filters.fromDate || row.date >= filters.fromDate) && (!filters.toDate || row.date <= filters.toDate) && filters.direction !== 'in' && filters.source !== 'statement-import').sort((a, b) => b.date.localeCompare(a.date));
  return <div className="table-scroll"><table><thead><tr><th>Paid on</th><th>Subscription</th><th>Scheduled renewal</th><th>Amount</th></tr></thead><tbody>{rows.map(row => <tr key={row.plan.id}><td><DateValue value={row.date} /></td><td>{row.sub.name}</td><td><DateValue value={row.plan.date} /></td><td>{fmtMoney(Math.abs(row.plan.amount), row.sub.currencyCode)}</td></tr>)}</tbody></table>{!rows.length && <p className="text-muted">No fulfilled renewal plans in this period.</p>}</div>;
}

function SubscriptionAlertsOverview({ subscriptions }: { subscriptions: Subscription[] }) {
  if (!subscriptions.length) return <p className="text-muted">No subscriptions are selected.</p>;
  return <div className="stack-lg">{subscriptions.map((subscription) => <Card key={subscription.id}><h3 className="mt-0">{subscription.name} <span className="text-muted">({subscription.currencyCode})</span></h3><AlertsSection sub={subscription} /></Card>)}</div>;
}

function AnalyticsTab({ selectedIds, currencyCode }: { selectedIds?: string[]; currencyCode?: string } = {}) {
  const subs = useSubscriptionsWorkbookStore((s) => s.workbook.entries);
  const scopedSubs = selectedIds ? subs.filter((s) => selectedIds.includes(s.id)) : subs;
  const categoryRegistry = useCategoryStore((s) => s.workbook.categories);
  useAppearanceStore((s) => s.appearance);
  applyChartTheme();

  const currencies = useMemo(() => [...new Set(scopedSubs.map((s) => s.currencyCode))].sort(), [scopedSubs]);
  const [currency, setCurrency] = useState(currencies[0] ?? 'USD');
  const effectiveCurrency = currencyCode ?? (currencies.includes(currency) ? currency : (currencies[0] ?? currency));

  const byCategory = useMemo(() => spendByCategory(scopedSubs, effectiveCurrency, categoryRegistry), [scopedSubs, effectiveCurrency, categoryRegistry]);
  const categories = Object.keys(byCategory);
  const renewals = useMemo(() => upcomingRenewals(scopedSubs.filter((subscription) => subscription.currencyCode === effectiveCurrency), 30), [scopedSubs, effectiveCurrency]);

  const accounts = useBankWorkbookStore((s) => s.workbook.settings.accounts);
  const cards = useCreditCardWorkbookStore((s) => s.workbook.cards);
  const byAccount = useMemo(() => {
    const out: Record<string, number> = {};
    scopedSubs.filter((s) => s.active && s.currencyCode === effectiveCurrency).forEach((s) => {
      const label = !s.paidVia
        ? 'Not linked'
        : s.paidVia.module === 'cash'
          ? 'Cash'
          : s.paidVia.module === 'creditCard'
            ? cards.find((c) => c.id === s.paidVia?.ref)?.name || 'Removed card'
            : accounts.find((a) => a.id === s.paidVia?.ref)?.name || 'Removed account';
      out[label] = (out[label] || 0) + monthlyEquivalent(s);
    });
    return out;
  }, [scopedSubs, effectiveCurrency, accounts, cards]);
  const accountLabels = Object.keys(byAccount);

  if (!subs.length) {
    return <p className="text-muted">Add a subscription first to see charts here.</p>;
  }

  return (
    <div>
      {!currencyCode && currencies.length > 1 && (
        <Field label="Currency" width={120}>
          <Select value={effectiveCurrency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid-auto" style={{ ...gridAutoStyle(320, 16), marginTop: 12 }}>
        <ChartCard title="Spend by category (monthly equivalent)" empty={!categories.length}>
          <Doughnut
            data={{
              labels: categories,
              datasets: [{ data: categories.map((c) => byCategory[c]), backgroundColor: categories.map((c) => tickerColor(c)) }],
            }}
            options={{ cutout: '55%', plugins: { datalabels: dlDoughnut((v) => fmtMoney(v, effectiveCurrency)) } }}
          />
        </ChartCard>
        <ChartCard title="Spend by paying account (monthly equivalent)" empty={!accountLabels.length}>
          <Bar
            data={{
              labels: accountLabels,
              datasets: [{ data: accountLabels.map((a) => byAccount[a]), backgroundColor: cssVar('--profit') || '#3ecf8e' }],
            }}
            options={{ indexAxis: 'y', plugins: { legend: { display: false }, datalabels: dlBarV((v) => fmtMoney(v, effectiveCurrency)) } }}
          />
        </ChartCard>
        <ChartCard title="Upcoming renewals (next 30 days)" empty={!renewals.length}>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Date</th><th>Name</th><th>Amount</th></tr></thead>
              <tbody>
                {renewals.map((r) => (
                  <tr key={r.subscription.id}>
                    <td><DateValue value={r.date} /></td>
                    <td>{r.subscription.name}</td>
                    <td>{fmtMoney(r.subscription.amount, r.subscription.currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

/* ============================== Settings ============================== */

// User-reported (2026-08-27, then again 2026-08-28): duplicated the global
// /account hub's own Sync status section — dropped the status text/heading
// here, same fix already applied app-wide (see BankPage.tsx's own
// AccountSection for the fullest write-up of this fix).
function AccountSection({
  cloudEmpty,
  uploadLocalToCloud,
}: {
  cloudEmpty: boolean;
  uploadLocalToCloud: () => Promise<void>;
}) {
  const subs = useSubscriptionsWorkbookStore((s) => s.workbook.entries);
  const [busy, setBusy] = useState(false);

  if (!firebaseReady || !cloudEmpty) return null;
  return (
    <Card className="mb-md">
      {cloudEmpty && (
        <Notice tone="warning" className="mt-sm">
          <p className="mt-0">No data found in the cloud for this account's Subscriptions workbook. This won't upload automatically.</p>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              const ok = await confirmDialog(
                'This will overwrite anything currently in the cloud (there is nothing there now, but confirming since this can\'t be undone).',
                `Upload ${subs.length} local subscription(s) to the cloud?`,
              );
              if (!ok) return;
              setBusy(true);
              try {
                await uploadLocalToCloud();
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Something went wrong.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Upload local data to cloud ({subs.length} subscriptions)
          </button>
        </Notice>
      )}
    </Card>
  );
}

// User-requested (2026-09-16): "No need of settings in individual modules!"
// — Default currency and JSON export/import were per-module settings
// duplicating two already-unified hubs: currency is now driven app-wide by
// the Account page's Primary/Secondary/Other ranking (`usePrimaryCurrency`),
// and export/import lives at `/app-data` (Done item 177). Only "Clear all
// data" stays here — a real, destructive, module-scoped action `/app-data`
// has no equivalent for.
function DataManagement() {
  const setWorkbook = useSubscriptionsWorkbookStore((s) => s.setWorkbook);

  const clearAll = async () => {
    const ok = await confirmDialog('This cannot be undone (export a backup first if unsure).', 'Clear all subscriptions data?');
    if (!ok) return;
    setWorkbook(createEmptySubscriptionsWorkbook());
    toast('All subscriptions data cleared.');
  };

  return (
    <Card>
      <h3 className="mt-0">Data management</h3>
      <p className="text-muted" style={{ marginTop: 0 }}>
        Currency preferences live on the <Link to="/account">Account page</Link>; whole-app JSON
        export/import lives on the <Link to="/app-data">Data page</Link>.
      </p>
      <div className="row gap-sm">
        <button className="btn secondary" onClick={clearAll}><TrashIcon size={12} />Clear all data</button>
      </div>
    </Card>
  );
}

export function SubscriptionsPage({
  cloudEmpty,
  uploadLocalToCloud,
}: {
  user: User | null;
  syncStatus: string;
  cloudEmpty: boolean;
  uploadLocalToCloud: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Subscription | null>(null);
  const subs = useSubscriptionsWorkbookStore((s) => s.workbook.entries);
  const liveSelected = selected ? subs.find((s) => s.id === selected.id) ?? null : null;
  const [params] = useSearchParams();
  const selectedIds = selectedEntityValues(params, subs.map((s) => s.id));
  const selectedSubscriptions = useMemo(() => subs.filter((subscription) => selectedIds.includes(subscription.id)), [subs, selectedIds]);
  const { filters, setFilters, resetFilters, activeCount } = useUrlTransactionFilters();
  const selectedCurrencies = useMemo(() => [...new Set(selectedSubscriptions.map((subscription) => subscription.currencyCode))].sort(), [selectedSubscriptions]);
  usePageTopBarRightSlot(!liveSelected && subs.length ? <TopBarControls><QuickEntitySwitch label="Subscription" value="" options={[{value:"",label:"All subscriptions"},...subs.map(sub=>({value:sub.id,label:sub.name}))]} onChange={id=>{ const next=subs.find(item=>item.id===id);if(next)setSelected(next); }} /><EntityScopeMenu label="Subscriptions" options={subs.map((s) => ({ value: s.id, label: s.name }))} /><TransactionFilterMenu value={filters} categories={[...new Set(subs.map(sub => subCategoryLabel(sub, useCategoryStore.getState().workbook.categories)))]} activeCount={activeCount} onChange={setFilters} onClear={resetFilters} /></TopBarControls> : null);

  return (
    <div className="standard-page">
      {!liveSelected && <>
      <PageHeading back={<BackButton to="/net-worth">Overview</BackButton>}><h1 className="pagetitle">Subscriptions</h1></PageHeading>
      <AddSubscriptionFab />
      <p className="text-muted mb-12">
        Recurring payments — streaming, gym, software, memberships — tracked independently and optionally
        linked to whichever Bank account or Cash actually pays them.
      </p>
      </>}
      {liveSelected ? (
        <SubscriptionDetail key={liveSelected.id} onSelect={setSelected} sub={liveSelected} onBack={() => setSelected(null)} />
      ) : (
        <StandardPageSections sections={[
            { key: 'summary', label: 'Account summary', defaultOpen: true, content: <div className="stack-lg"><OverallSummary selectedIds={selectedIds} />{selectedCurrencies.map(currency => <div key={currency}><h3>{currency}</h3><SubscriptionAccountSummary subscriptions={selectedSubscriptions.filter(sub => sub.currencyCode === currency)} filters={filters} /></div>)}</div> },
            {
              key: 'subscriptions',
              label: 'Subscriptions',
              content: (
                <div>

                  <SubscriptionList onSelect={setSelected} selectedIds={selectedIds} />

                </div>
              ),
            },
            { key: 'plans', label: 'Plans', content: <SubscriptionPlansOverview subscriptions={selectedSubscriptions} filters={filters} /> },
            { key: 'payments', label: 'Payments', content: <SubscriptionPaymentsOverview subscriptions={selectedSubscriptions} filters={filters} /> },
            { key: 'alerts', label: 'Alerts', content: <SubscriptionAlertsOverview subscriptions={selectedSubscriptions} /> },
            { key: 'analytics', label: 'Analytics', content: <div className="stack-lg">{selectedCurrencies.map((currency) => <Card key={currency}><h3 className="mt-0">{currency}</h3><AnalyticsTab selectedIds={selectedIds} currencyCode={currency} /></Card>)}</div> },
            {
              key: 'settings',
              label: 'Settings',
              content: (
                <div>
                  <p className="text-muted mt-0">
                    Sign-in, profile, appearance, and a whole-app backup live on the{' '}
                    <Link to="/account">Account page →</Link>. What's below is specific to Subscriptions.
                  </p>
                  <AccountSection cloudEmpty={cloudEmpty} uploadLocalToCloud={uploadLocalToCloud} />
                  <DataManagement />
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
