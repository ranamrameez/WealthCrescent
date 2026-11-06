import { ValueChange } from '../../../components/ValueChange';
import { MonthlyStatsWidget } from '../../../components/MonthlyStatsWidget';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { RecordRow } from '../../../components/RecordRow';
import { TableCard } from '../../../components/TableCard';
import { useDateTableSort } from '../../../hooks/useDateTableSort';
import { DateValue } from '../../../components/DateValue';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { selectedEntityValues } from '../../../components/EntityScopeMenu';
import { PageFilterModal } from '../../../components/PageFilterModal';
import { DateRangeWidget } from '../../../components/DateRangeWidget';
import { NetWorthRecentTransactions } from '../components/NetWorthRecentTransactions';
import { TopBarControls } from '../../../components/TopBarControls';
import { AppChart as Chart, AppDoughnut as Doughnut } from '../../../components/AppCharts';
import { Card, MoneyValue } from '../../../components/Card';
import { StandardPageSections } from '../../../components/StandardPageSections';
import { SummarySection, SummarySections, SummaryValue } from '../../../components/SummaryGroupCard';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { Tooltip } from '../../../components/Tooltip';
import { Field, Select, TextInput } from '../../../components/ui/Field';
import { FabButton } from '../../../components/ui/Fab';
import { DashboardIcon, CalendarIcon, ListIcon, StocksIcon, CheckIcon, FilterIcon, CashIcon } from '../../../components/icons';
import { toast } from '../../../components/Toast';
import { ChartCard } from '../../qse/components/ChartCard';
import { type CurrencyNetWorth, type FlowActivityItem, type NetWorthBreakdownEntry } from '../../../lib/calc/netWorth';
import type { MonthlyIncomeExpense, BudgetActivity } from '../../../lib/calc/budgetPlanner';
import type { MonthlyNetWorthPoint } from '../../../lib/calc/netWorthTrend';
import type { NetWorthAsOfInputs } from '../../../lib/calc/netWorthAsOf';
import { UpcomingList } from '../../../components/UpcomingList';
import { useUpcomingItems } from '../../../hooks/useUpcomingItems';
import { usePageTopBarRightSlot } from '../../../hooks/usePageTopBar';
import { getDashboardReport, getCurrencyDashboardSummary, getBreakdownDelta, getMonthlyFlowItems as monthlyFlowItems, getNetWorthBreakdownForMonth as netWorthBreakdownForMonth, getCategoryGroupReport, getMonthlyNetFlow, getMonthlyPlanReport, getMonthlyStatCards, getModuleBreakdownChart, getClearedRangeActivities, getMoneyMovementReport, type FlowDimension, type FlowPopulation, type MovementKind, getReportingMonths, getMonthlyIncomeExpense as monthlyIncomeExpense,
  getNetWorthTrend as projectedNetWorthTrend, getMonthEnd as endOfMonthAsOf } from '../../../services/finance/dashboardService';
import { useDashboardContext, useDashboardActivities, useNativeMovementActivities } from '../../../hooks/useDashboard';
import { useNetWorthInputs, useNetWorthSummary } from '../hooks/useNetWorthSummary';
import { shiftISODate, activityFlowItems, getDashboardHeadline, getDashboardInsights, setNetWorthInclusion, type NetWorthInclusionGroup, type NetWorthInclusionOption } from '../../../services/finance/dashboardService';
import type { FxRates } from '../../../lib/calc/currencyConversion';
import { getDashboardFxRates as loadCachedFxRates, isDashboardFxStale as isFxStale, getDashboardEffectiveRate as effectiveRate, refreshDashboardFxRates, saveDashboardCrossRate } from '../../../services/finance/dashboardService';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { useUrlTransactionFilters } from '../../../hooks/useUrlTransactionFilters';
import { presetDateRange } from '../../../lib/dateRange';
import { fmtMoney } from '../../../lib/format';
import { dlDoughnut, dlLine, withAlpha } from '../../../lib/chartLabels';
import type { ChartDataset } from 'chart.js';
import { applyChartTheme } from '../../../lib/chartSetup';
import { cssVar } from '../../../lib/cssVar';
import { HUES, hueStyle } from '../../../lib/statCardHues';
import { useAppearanceStore } from '../../../store/appearanceStore';
import { useLastCurrency } from '../../../hooks/useLastCurrency';
import { usePrimaryCurrency } from '../../../hooks/usePrimaryCurrency';
import { useCurrencyRankComparator } from '../../../hooks/useCurrencyRank';
import { useEnabledCurrencies } from '../../../hooks/useEnabledCurrencies';
import type { Category, CategoryGroup } from '../../../types/finance';
import { gridAutoStyle } from '../../../lib/gridStyle';

const DASHBOARD_MODULES = ['cash', 'bank', 'creditCards', 'personalLoans', 'emi', 'funds', 'qse', 'psx', 'rentals'];

const today = () => new Date().toISOString().slice(0, 10);
const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

/** User-requested (2026-09-16): "For every calculated number, it should be
 * supported by a clickable pop-up view to display the related
 * transactions." Three kinds, matching what's actually computable for each
 * stat: `breakdown` (Assets/Liabilities/Net — the per-module figures that
 * already make up the total, real for every module including QSE/PSX/Funds/
 * EMI/Personal Loans, which have no day-by-day transaction log to itemize
 * further); `flow` (Today's/This month's net flow — the real, itemized
 * Cash+Bank transactions behind the sum, via `flowActivity()`, which is
 * deliberately built to reconcile exactly with `flowByCurrency()`'s own
 * number); `delta` (this month vs. last month — a two-column breakdown
 * comparison, since "what changed" isn't a flat transaction list once a
 * stock price move or an EMI paydown is part of the answer). */
type Drilldown =
  | { kind: 'breakdown'; title: string; explanation: string; rows: { label: string; currency: string; amount: number }[] }
  | { kind: 'flow'; title: string; explanation: string; currency: string; from: string; to: string; items: FlowActivityItem[] }
  | { kind: 'delta'; title: string; explanation: string; currency: string; current: NetWorthBreakdownEntry[]; previous: NetWorthBreakdownEntry[] };

function NetWorthDrilldownModal({ drilldown, onClose }: { drilldown: Drilldown; onClose: () => void }) {
  const dateSort = useDateTableSort();
  const flowRows = drilldown.kind === 'flow' ? dateSort.rows(drilldown.items, { date: row => row }) : [];
  const { rows: pageFlowRows, controls: flowPaginationControls } = useTablePagination(flowRows);
  return (
    <Modal title={drilldown.title} onClose={onClose}>
      <p className="text-muted mt-0">{drilldown.explanation}</p>
      {drilldown.kind === 'breakdown' && (
        drilldown.rows.length === 0 ? (
          <div className="text-muted">Nothing contributes to this figure yet.</div>
        ) : (
          <table>
            <thead><tr><th>Module</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {drilldown.rows.map((r, i) => (
                <RecordRow record={r} key={i}>
                  <td>{r.label}</td>
                  <td style={{ textAlign: 'right' }}><MoneyValue n={r.amount} currency={r.currency} /></td>
                </RecordRow>
              ))}
            </tbody>
          </table>
        )
      )}
      {drilldown.kind === 'flow' && (
        <>
          <div className="text-muted mb-sm">{drilldown.from === drilldown.to ? drilldown.from : `${drilldown.from} → ${drilldown.to}`}, in {drilldown.currency}</div>
          {drilldown.items.length === 0 ? (
            <div className="text-muted">No activity in this window.</div>
          ) : (
            <table>
              <thead><tr><dateSort.Th rows={drilldown.kind === 'flow' ? drilldown.items : []} column="date">Date</dateSort.Th><th>Source</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {pageFlowRows.map((it, i) => (
                  <RecordRow record={it} key={i}>
                    <td><DateValue value={it.date} /></td>
                    <td>{it.module}{it.accountName ? ` (${it.accountName})` : ''}</td>
                    <td>{it.description}</td>
                    <td style={{ textAlign: 'right', color: it.amount >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                      {it.amount >= 0 ? '+' : ''}{fmtMoney(it.amount, drilldown.currency)}
                    </td>
                  </RecordRow>
                ))}
              </tbody>
            </table>
          )}
          {drilldown.items.length > 0 ? flowPaginationControls : null}
        </>
      )}
      {drilldown.kind === 'delta' && (() => {
        const modules = getBreakdownDelta(drilldown.previous, drilldown.current);
        if (!modules.length) return <div className="text-muted">Neither month has any contribution yet.</div>;
        return (
          <table>
            <thead><tr><th>Module</th><th style={{ textAlign: 'right' }}>Last month</th><th style={{ textAlign: 'right' }}>Now</th><th style={{ textAlign: 'right' }}>Δ</th></tr></thead>
            <tbody>
              {modules.map(({ module: m, previous: prev, current: now, delta }) => {
                return (
                  <RecordRow record={m} key={m}>
                    <td>{m}</td>
                    <td style={{ textAlign: 'right' }}><MoneyValue n={prev} currency={drilldown.currency} /></td>
                    <td style={{ textAlign: 'right' }}><MoneyValue n={now} currency={drilldown.currency} /></td>
                    <td style={{ textAlign: 'right', color: delta >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                      {delta >= 0 ? '+' : ''}{fmtMoney(delta, drilldown.currency)}
                    </td>
                  </RecordRow>
                );
              })}
            </tbody>
          </table>
        );
      })()}
    </Modal>
  );
}

/** App home: overall totals in every enabled/held currency, then native-currency
 * summaries, plans and analytics. Central URL-backed filters control scope and
 * section visibility; saved inclusion settings retain their sign-in gate.
 * Exchange rates are a secondary action in a FAB popup. The legacy route is
 * retained for bookmarks. See docs/PAGE_TEMPLATE_GUIDE.md. */
export function NetWorthPage(_legacySyncProps: {
  syncStatus: string;
  cloudEmpty: boolean;
  uploadLocalToCloud: () => Promise<void>;
}) {
  const { rentals, categories, categoryGroups, inclusionGroups, fundsCashRequiresOptIn } = useDashboardContext();

  // User-reported (2026-09-09): "Stocks Dashboard: Those Rail Cards should
  // actually be in main dashboard. They are more relevant here." The rail's
  // own "Net worth" mini-card (DashboardRail.tsx) would just duplicate this
  // whole page, so only its "Upcoming" panel — genuinely not shown anywhere
  // on this page before — moved here; the rail itself was removed from
  // QSE's/PSX's Dashboard entirely.
  const upcomingItems = useUpcomingItems(14);

  // Charts on this page recompute their CSS-var-derived colors only when
  // this component re-renders — same reasoning as every other chart-bearing
  // page (Dashboard, Analytics, PositionDetail).
  useAppearanceStore((s) => s.appearance);
  applyChartTheme();


  // Item 3 of a 2026-08-26 feedback batch: "Default currency should be
  // logical" — `useLastCurrency` already remembers whatever the user picks
  // for next time, but its FIRST-EVER default was a hardcoded 'USD' even
  // for a user who's never touched USD at all. Default instead to whichever
  // currency the user actually has the largest (absolute) net exposure in —
  // a much more likely "the one they care about" than an arbitrary global
  // default — falling back to 'USD' only when there's no data yet to judge by.
  const [scopeParams, setScopeParams] = useSearchParams();
  const { filters: timeFilters, setFilters: setTimeFilters } = useUrlTransactionFilters('since-month');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);
  const sectionVisible = (key: string) => scopeParams.get(`show-${key}`) !== 'false';
  const toggleSection = (key: string) => {
    const next = new URLSearchParams(scopeParams);
    if (sectionVisible(key)) next.set(`show-${key}`, 'false');
    else next.delete(`show-${key}`);
    setScopeParams(next);
  };
  const moduleOptions = DASHBOARD_MODULES;
  const selectedModules = useMemo(() => selectedEntityValues(scopeParams, DASHBOARD_MODULES), [scopeParams]);
  const { rows, biggestExposureCurrency } = useNetWorthSummary(selectedModules);
  const currencyRank = useCurrencyRankComparator();
  const primaryCurrency = usePrimaryCurrency();
  // Explicit user preference (Primary currency, set on the Account page)
  // beats the inferred biggest-exposure heuristic when both are available.
  const [preferredCurrency] = useLastCurrency('net-worth-preferred', primaryCurrency ?? biggestExposureCurrency);
  // User-reported (2026-09-09): "Dashboard Net Worth Summary still lists
  // global currencies rather than user's." The "Show total in" picker used
  // to map over the whole `CURRENCIES` catalog (~25 currencies) instead of
  // the same enabled/held-currency list every other picker in the app
  // already uses (`AccountFormFields`, etc.) — this is that same list.
  const enabledCurrencies = useEnabledCurrencies(preferredCurrency);
  const preferredCurrencyOptions = [...new Set([...enabledCurrencies.map(c => c.code), ...rows.map(r => r.currency)])].sort(currencyRank).map(code => ({ code }));
  // Page-wide controls share the pinned top bar with section navigation.
  usePageTopBarRightSlot(
    <TopBarControls>
      <DateRangeWidget value={timeFilters} onChange={setTimeFilters} />
      <button type="button" className="btn secondary small topbar-filter-btn" onClick={() => setFiltersOpen(true)}><FilterIcon size={14} /> Dashboard filters</button>
    </TopBarControls>,
  );

  const activities = useDashboardActivities(selectedModules);

  const netWorthAsOfInputs = useNetWorthInputs(selectedModules);

  const [rates, setRates] = useState<FxRates | null>(() => loadCachedFxRates());
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  // User-requested (2026-09-16): "For every calculated number, it should be
  // supported by a clickable pop-up view to display the related
  // transactions... explain me how are you calculating all these numbers."
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  // Item 3: FX entry used to be locked to "1 USD = X" — the internal rate
  // table stays USD-anchored (unchanged, and correct — see setCrossRate's
  // own comment for why), but the user can now set a rate between ANY two
  // currencies they actually hold; From/To default to the two currencies
  // most likely relevant (biggest exposure + preferred).
  const currencyCodes = [...new Set([...preferredCurrencyOptions.map(c => c.code), 'USD'])];
  const [rateFrom, setRateFrom] = useState(currencyCodes[0] || 'USD');
  const [rateTo, setRateTo] = useState(currencyCodes.find((c) => c !== rateFrom) || 'USD');
  const [crossRateValue, setCrossRateValue] = useState('');

  const refresh = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const fresh = await refreshDashboardFxRates();
      setRates(fresh);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Could not reach the rate provider.');
    } finally {
      setFetching(false);
    }
  };

  // Auto-refresh once on mount if the cache is missing/stale — silent
  // failure is fine here, the manual-entry UI covers it either way.
  useEffect(() => {
    if (isFxStale(rates)) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Item 1/3 (earlier pass): picking a currency here used to always start
  // the Rate field blank, forcing the user to type a value from scratch
  // even when a rate (auto-fetched or previously entered by hand) is
  // already known for it — prefill with the current known cross-rate
  // between whatever From/To is currently selected.
  const onRateFromChange = (code: string) => {
    setRateFrom(code);
    const known = effectiveRate(code, rateTo, rates);
    setCrossRateValue(known !== null ? String(known) : '');
  };
  const onRateToChange = (code: string) => {
    setRateTo(code);
    const known = effectiveRate(rateFrom, code, rates);
    setCrossRateValue(known !== null ? String(known) : '');
  };

  const applyCrossRate = () => {
    try {
      setRates(saveDashboardCrossRate(rateFrom, rateTo, crossRateValue, rates));
      toast('Rate saved: 1 ' + rateFrom + ' = ' + crossRateValue + ' ' + rateTo + '.');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save exchange rate.'); }
  };

  const todayISO = today();
  const legacyPeriod = timeFilters.period as string;
  useEffect(() => {
    if (!['7d', '30d', '90d', '6m', '1y'].includes(legacyPeriod)) return;
    if (legacyPeriod === '6m' || legacyPeriod === '1y') {
      const preset = legacyPeriod === '6m' ? '6' : '12';
      const range = presetDateRange(preset);
      setTimeFilters({ period: preset, fromDate: range.startDate, toDate: range.endDate });
    } else {
      const days = legacyPeriod === '7d' ? 6 : legacyPeriod === '30d' ? 29 : 89;
      setTimeFilters({ period: 'custom', fromDate: shiftISODate(todayISO, -days), toDate: todayISO });
    }
  }, [legacyPeriod, setTimeFilters, todayISO]);
  const report = getDashboardReport({ inputs: netWorthAsOfInputs, rows, activities, rentals, todayISO, period: legacyPeriod,
    fromDate: timeFilters.fromDate, toDate: timeFilters.toDate, preferredCurrency, rates });
  const { todayFlow, periodFlow, plannedUpcomingByCurrency, rangeStartDate, rangeEndDate, rangeLabel, rangeBaselineDate,
    unverifiedOpeningCurrencies, hasRangeBaseline, rangeStartByCurrency, rangeEndByCurrency, rangeStartBreakdownByCurrency, rangeEndBreakdownByCurrency,
    splitData, activityCurrencies, trendCurrentRows, currencySummaryRows, periodInsightRows, missingFxCurrencies, rentalsNetForRange, periodDeltaRows } = report;
  const ownCurrencies = [...report.ownCurrencies].sort(currencyRank);

  const ensureSignedIn = useEnsureSignedIn();

  // Shared sign-in gate for every "Include in Net Worth" checkbox below —
  // same pattern as the existing per-entity Archive/Restore toggles
  // (Bank/EMI/Personal Loans/Funds), just one helper instead of repeating
  // the `ensureSignedIn` call at 7 different call sites.
  const toggleInclude = async (setter: () => void) => {
    if (!(await ensureSignedIn('Sign in to change what counts toward Net Worth.'))) return;
    try { setter(); } catch (error) { toast(error instanceof Error ? error.message : 'Could not update inclusion.'); }
  };

  return (
    <div className="standard-page">
      <div className="page-heading"><h1>Dashboard</h1><span className="text-muted">Selected range: {rangeLabel}</span></div>
      {fundsCashRequiresOptIn && <Notice tone="warning" className="mb-md">Funds totals include holdings only. Legacy purchase history does not establish a funded cash balance. Enable Funds cash in Dashboard filters only after reconciling its deposits and withdrawals.</Notice>}
      <StandardPageSections preserveOrder sections={[{ key: 'summary', icon: <DashboardIcon size={16} />, label: 'Overall summary', defaultOpen: true,  content: <SummarySections>
        {preferredCurrencyOptions.map(({ code: preferredCurrency }) => {
          const { net, debts, todayFlowTotal, periodFlowTotal, previous, periodEnd, netWorthDelta, netWorthDeltaPct, plannedTotal } = getDashboardHeadline({
            currency: preferredCurrency, rates, rows, todayFlow, periodFlow, rangeStart: rangeStartByCurrency, rangeEnd: rangeEndByCurrency,
            planned: plannedUpcomingByCurrency, hasRangeBaseline, unverifiedOpeningCurrencies,
          });
          const grandTotal = net.total, unconverted = net.missing;
          const totalDebts = debts.total, debtsUnconverted = debts.missing;
          return <SummarySection key={preferredCurrency} title={`Overall summary — ${preferredCurrency}`} className="summary-overview">
            <SummaryValue primary detail="Current balance" label={`Estimated net worth (${preferredCurrency})`} value={fmtMoney(grandTotal, preferredCurrency)} tone={grandTotal >= 0 ? 'positive' : 'negative'} />
          {unconverted.length > 0 && (
            <div className="summary-note">
              No {preferredCurrency} rate available for {unconverted.join(', ')} — those currencies' totals
              aren't included above; see their own sections below for real figures.
            </div>
          )}

            <SummaryValue
              label="Total debts"
              value={fmtMoney(totalDebts, preferredCurrency)}
              tone={totalDebts > 0 ? 'negative' : 'neutral'}
              title={debtsUnconverted.length ? `Excludes ${debtsUnconverted.join(', ')} — no rate available.` : undefined}
            />
            <SummaryValue
              className="summary-extra" label="Today's net flow"
              value={fmtMoney(todayFlowTotal.total, preferredCurrency)}
              tone={todayFlowTotal.total >= 0 ? 'positive' : 'negative'}
              title={todayFlowTotal.anyUnconverted ? 'Some currencies excluded — no rate available.' : undefined}
              tooltip="Cleared Cash, Bank and Rental movement today, converted to the preferred currency."
              onClick={() => setDrilldown({
                kind: 'breakdown',
                title: "Today's net flow, by currency",
                explanation: `Each currency's own cleared (unconverted) net Cash, Bank and Rental movement on ${todayISO}, converted above to ${preferredCurrency} for the headline figure. Click that currency's own card further down the page for the real itemized transactions.`,
                rows: Object.entries(todayFlow).map(([code, amount]) => ({ label: code, currency: code, amount })),
              })}
            />
            <SummaryValue
              className="summary-extra" label="Period net flow"
              value={fmtMoney(periodFlowTotal.total, preferredCurrency)}
              tone={periodFlowTotal.total >= 0 ? 'positive' : 'negative'}
              title={periodFlowTotal.anyUnconverted ? 'Some currencies excluded — no rate available.' : undefined}
              tooltip={`Cleared Cash, Bank and Rental movement from ${rangeStartDate} through ${rangeEndDate}, converted to the preferred currency.`}
              onClick={() => setDrilldown({
                kind: 'breakdown',
                title: `Period net flow (${rangeLabel}), by currency`,
                explanation: `Each currency's own cleared (unconverted) net Cash, Bank and Rental movement from ${rangeStartDate} through ${rangeEndDate}, converted above to ${preferredCurrency} for the headline figure. Click that currency's own card further down the page for the real itemized transactions.`,
                rows: Object.entries(periodFlow).map(([code, amount]) => ({ label: code, currency: code, amount })),
              })}
            />
            <SummaryValue
              className="summary-extra" label="Upcoming planned activity (30 days)"
              value={fmtMoney(plannedTotal.total, preferredCurrency)}
              tone={(plannedTotal.total) >= 0 ? 'positive' : 'negative'}
              title={plannedTotal.anyUnconverted ? `Excludes ${plannedTotal.missing.join(', ')} — no rate available.` : `Unexecuted planned income and expenses from ${todayISO} through ${shiftISODate(todayISO, 29)}. Linked transfers are excluded.`}
            />
            {netWorthDelta !== null ? (
              <SummaryValue
                className="summary-extra" label="Net worth change in period"
                value={<ValueChange amount={netWorthDelta} currency={preferredCurrency} />}
                detail={netWorthDeltaPct !== null ? `${netWorthDeltaPct >= 0 ? '+' : ''}${netWorthDeltaPct.toFixed(1)}% vs. period start` : undefined}
                tone={netWorthDelta >= 0 ? 'positive' : 'negative'}
                title={previous.anyUnconverted || periodEnd.anyUnconverted ? 'Some currencies excluded from the period comparison — no rate available.' : undefined}
                tooltip={`Net worth at ${rangeEndDate} minus net worth at the end of the day before ${rangeStartDate}.`}
                onClick={() => setDrilldown({
                  kind: 'breakdown',
                  title: `Net worth change (${rangeLabel}), by currency`,
                  explanation: `Each currency's real net worth at ${rangeEndDate} compared with ${rangeBaselineDate}, converted above to ${preferredCurrency}.`,
                  rows: periodDeltaRows,
                })}
              />
            ) : (
              <SummaryValue
                label="Net worth change in period"
                value="—"
                detail={previous.anyUnconverted || periodEnd.anyUnconverted ? 'Exchange rates missing for this comparison' : 'No verified opening baseline for this range'}
                tone="neutral"
                tooltip="A period change is shown only when there is real account history before the selected start date."
              />
            )}
        </SummarySection>;
        })}
      </SummarySections> }, { key: 'movement', icon: <CashIcon size={16} />, label: 'Money in / out', defaultOpen: false,
        content: <MoneyMovementSection selectedModules={selectedModules} from={rangeStartDate} to={rangeEndDate} today={todayISO} setDrilldown={setDrilldown} /> }, ...(sectionVisible('currencies') ? [{ key: 'currencies', icon: <CashIcon size={16} />, label: 'Per currency summary', defaultOpen: false,  content: (<div className="grid-auto" style={{ ...gridAutoStyle(360, 12), marginBottom: 16 }}>
        {[...currencySummaryRows].sort((a, b) => currencyRank(a.currency, b.currency)).map((r) => {
          const { converted, todayFlowC, periodFlowC, deltaC, deltaPctC } = getCurrencyDashboardSummary(r, {
            currency: preferredCurrency, rates, todayFlow, periodFlow, rangeStart: rangeStartByCurrency, rangeEnd: rangeEndByCurrency, hasRangeBaseline, unverifiedOpeningCurrencies,
          });
          return (
            <section key={r.currency} className="currency-overview">
              <h3 className="currency-overview-title">
                {r.currency} — {fmtMoney(r.net, r.currency)}
                {converted !== null && r.currency !== preferredCurrency && (
                  <span className="text-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                    ≈ {fmtMoney(converted, preferredCurrency)}
                  </span>
                )}
              </h3>
              <div className="current-position-metrics">
                <SummaryValue label="Assets" value={fmtMoney(r.assets, r.currency)} tone={r.assets >= 0 ? 'positive' : 'negative'} onClick={() => setDrilldown({
                    kind: 'breakdown',
                    title: `${r.currency} assets, by module`,
                    explanation: `Every module that currently holds a positive balance in ${r.currency} — Cash/Bank's own real balance, QSE/PSX's cash+portfolio value, Funds' current NAV × units held, or money others owe you (Personal Loans).`,
                    rows: r.breakdown.filter((b) => b.amount > 0).map((b) => ({ label: b.module, currency: r.currency, amount: b.amount })),
                  })}
                />
                <SummaryValue label="Liabilities" value={fmtMoney(r.liabilities, r.currency)} tone={'negative'} onClick={() => setDrilldown({
                    kind: 'breakdown',
                    title: `${r.currency} liabilities, by module`,
                    explanation: `Every module that currently reduces your ${r.currency} net worth — EMI/Loans' outstanding balance, a credit card's owed amount, or net money you owe (Personal Loans). Shown as negative, the same signed convention used everywhere else in this breakdown.`,
                    rows: r.breakdown.filter((b) => b.amount < 0).map((b) => ({ label: b.module, currency: r.currency, amount: b.amount })),
                  })}
                />
                <SummaryValue primary label="Net" value={fmtMoney(r.net, r.currency)} tone={r.net >= 0 ? 'positive' : 'negative'} onClick={() => setDrilldown({
                    kind: 'breakdown',
                    title: `${r.currency} net worth, by module`,
                    explanation: `Assets minus liabilities in ${r.currency}, every module that contributed anything — a positive row adds to net worth, a negative row (EMI/credit cards/net owed) subtracts from it.`,
                    rows: r.breakdown.map((b) => ({ label: b.module, currency: r.currency, amount: b.amount })),
                  })}
                />
              </div>
              {/* User-reported (2026-09-09): "Per currency stats are
                 missing like Today's net flow, This month's net flow,
                 This month's change" — compact chips (not another row of
                 full stat-cards, per the same report: "making the whole
                 td red/green is bad idea, instead we can make it compact
                 chip-like info") mirroring the converted totals shown up
                 in the Net worth summary card, but in this currency's own
                 real, unconverted terms. */}
              <div className="row" style={{ gap: 6, marginTop: 10, alignItems: 'center' }}>
                <Tooltip text="Cleared Cash, Bank and Rental movement today, excluding linked transfers and pending entries. Click for the real transactions.">
                  <span
                    className={`pill clickable ${todayFlowC >= 0 ? 'pill-positive' : 'pill-negative'}`}
                    onClick={() => setDrilldown({
                      kind: 'flow',
                      title: `Today's ${r.currency} Cash+Bank activity`,
                      explanation: 'Every cleared Cash, Bank and Rental entry dated today, in this currency. Linked transfers and pending entries are excluded.',
                      currency: r.currency,
                      from: todayISO,
                      to: todayISO,
                      items: activityFlowItems(activities, r.currency, todayISO, todayISO),
                    })}
                  >
                    Today {todayFlowC >= 0 ? '+' : ''}{fmtMoney(todayFlowC, r.currency)}
                  </span>
                </Tooltip>
                <Tooltip text={`Cleared Cash, Bank and Rental movement from ${rangeStartDate} through ${rangeEndDate}, excluding linked transfers and pending entries. Click for the real transactions.`}>
                  <span
                    className={`pill clickable ${periodFlowC >= 0 ? 'pill-positive' : 'pill-negative'}`}
                    onClick={() => setDrilldown({
                      kind: 'flow',
                      title: `${r.currency} Cash+Bank activity (${rangeLabel})`,
                      explanation: `Every cleared Cash, Bank and Rental entry from ${rangeStartDate} through ${rangeEndDate}, in this currency. Linked transfers and pending entries are excluded.`,
                      currency: r.currency,
                      from: rangeStartDate,
                      to: rangeEndDate,
                      items: activityFlowItems(activities, r.currency, rangeStartDate, rangeEndDate),
                    })}
                  >
                    Period {periodFlowC >= 0 ? '+' : ''}{fmtMoney(periodFlowC, r.currency)}
                  </span>
                </Tooltip>
                {deltaC !== null ? (
                  <Tooltip text={`This currency's real net worth at ${rangeEndDate} minus its net worth at ${rangeBaselineDate}. Click for a module-by-module breakdown of what changed.`}>
                    <span
                      className={`pill clickable ${deltaC >= 0 ? 'pill-positive' : 'pill-negative'}`}
                      onClick={() => setDrilldown({
                        kind: 'delta',
                        title: `${r.currency}: selected period change, by module`,
                        explanation: `Every module's own real contribution at ${rangeEndDate} compared with ${rangeBaselineDate}. This includes balance and valuation changes, not just cash flow.`,
                        currency: r.currency,
                        current: rangeEndBreakdownByCurrency[r.currency] ?? [],
                        previous: rangeStartBreakdownByCurrency[r.currency] ?? [],
                      })}
                    >
                      Period change <ValueChange amount={deltaC} percent={deltaPctC} currency={r.currency} />
                    </span>
                  </Tooltip>
                ) : (
                  <span className="pill" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>
                    Δ in period — no verified baseline
                  </span>
                )}
              </div>
              {r.breakdown.length > 0 && (
                <div className="mt-12">
                  <div className="text-muted" style={{ marginBottom: 4 }}>By account</div>
                  <div className="summary-contributors">
                    {r.breakdown.map((b) => (
                      <div key={b.module}>
                        <div className="label">{b.module}</div>
                        <MoneyValue n={b.amount} currency={r.currency} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <ModuleBalanceChart row={r} />
            </section>
          );
        })}
      </div>) }] : []), { key: 'upcoming', icon: <CalendarIcon size={16} />, label: 'Upcoming', defaultOpen: upcomingItems.length > 0,  content: <>        <UpcomingList items={upcomingItems} limit={8} emptyText="Nothing expected in the next 14 days." />
        <Link to="/planning" className="text-muted" style={{ display: 'block', marginTop: 10 }}>See all →</Link>
</> }, ...(sectionVisible('plans') ? [{
        key: 'plans', icon: <CalendarIcon size={16} />,
        label: 'Plans',
        content: <div className="stack-lg">
          <p className="text-muted">Calendar-month comparisons use dated records from Planning and native ledgers. Actual, pending and remaining planned amounts are separate, in their own currencies.</p>
          <NetWorthPlanningReality selectedModules={selectedModules} defaultMonth={rangeStartDate.slice(0, 7)} todayISODate={todayISO} />
          <Link to="/planning">Manage plans and allocations →</Link>
        </div>,
      }] : []), ...(sectionVisible('recent') ? [{  key: 'recent', icon: <ListIcon size={16} />, label: 'Recent transactions', content: <NetWorthRecentTransactions /> }] : []), ...(sectionVisible('analytics') ? [{
        key: 'analytics', icon: <StocksIcon size={16} />,
        label: 'Analytics',
        content: <NetWorthAnalyticsSection ownCurrencies={ownCurrencies} activities={activities} categories={categories} groups={categoryGroups} emiLoans={netWorthAsOfInputs.emiLoans} currentRows={trendCurrentRows} periodEndRows={periodInsightRows} activityCurrencies={activityCurrencies} netWorthAsOfInputs={netWorthAsOfInputs} todayISODate={todayISO} rangeStartDate={rangeStartDate} rangeEndDate={rangeEndDate} rangeLabel={rangeLabel} setDrilldown={setDrilldown} splitData={splitData} preferredCurrency={preferredCurrency} missingFxCurrencies={missingFxCurrencies} rentalsNet={selectedModules.includes('rentals') ? rentalsNetForRange : {}} />,
      }] : [])]} />




      {/* User-reported (2026-09-06), correcting the previous round's own
         layout: "USE GRID FOR ALL NON_TABLE DATA... YOU DUMPED THE WHOLE
         CHECKLIST VERTICALLY on the main page instead of inline chips/
         checkboxes WITH USE A FAB + POPUP TO UPDATE THIS USER PREFERENCE."
         This is a Rare-tier settings control (per this app's own Main/
         Often/Rare model) — it belongs behind a FAB + Modal, same as every
         other rarely-touched per-entity toggle in this app, not a
         permanently-visible card. Each group of entities is now a wrapping
         row of `.chip` toggle buttons (the exact pattern `ChartFilterBar`'s
         ticker filter already established) instead of one checkbox per
         line. */}

      {rows.length === 0 && (
        <Card><div className="text-muted">No current balances recorded across the selected sources. Historical positions and activity may still appear for the selected reporting range.</div></Card>
      )}

      {/* Grid of per-currency account summaries (user-specified order,
          2026-09-04) — a responsive grid lets 2-3 currency sections sit
          side by side on a wide viewport instead of stacking. */}


      {/* User-requested (2026-09-04): the Net Worth 2-in-1 interactive
          chart + Budget Planner's Monthly summary widget, moved here in
          full — see `NetWorthMonthlySection` below. */}
      {/* Item 4: "add charts to view capital split per currency" —
          supplementary content, not part of the requested reordering. */}

      <FabButton label="Exchange rates" onClick={() => setRatesOpen(true)}><CashIcon size={18} /></FabButton>
      {ratesOpen && <Modal title="Exchange rates" onClose={() => setRatesOpen(false)} widthClass="50">          <div className="text-muted">
            {rates
              ? `Rates as of ${new Date(rates.fetchedAt).toLocaleString()} (${rates.source === 'api' ? 'auto-fetched' : 'manually entered'}).`
              : 'No exchange rates loaded yet.'}
            {fetchError && ` Auto-fetch failed: ${fetchError} — enter a rate manually below.`}
          </div>
          <button type="button" className="btn-link" onClick={refresh} disabled={fetching} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, marginTop: 2 }}>
            {fetching ? 'Refreshing…' : 'Refresh rates'}
          </button>

          <div className="mt-12">
            <div className="text-muted" style={{ marginBottom: 4 }}>Set a rate between any two currencies</div>
            <div className="row gap-sm">
              <Field label="1 unit of">
                <Select value={rateFrom} onChange={(e) => onRateFromChange(e.target.value)} width={110}>
                  {currencyCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="equals">
                <TextInput type="number" step="0.0001" placeholder="Rate" value={crossRateValue} onChange={(e) => setCrossRateValue(e.target.value)} className="w-100" />
              </Field>
              <Field label="of">
                <Select value={rateTo} onChange={(e) => onRateToChange(e.target.value)} width={110}>
                  {currencyCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <button type="button" className="btn" onClick={applyCrossRate}>Save rate</button>
            </div>
          </div>

          {ownCurrencies.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <div className="text-muted" style={{ marginBottom: 4 }}>Rates between your own currencies</div>
              {/* Index-based pairing (not `b > a`) — `ownCurrencies` is now
                  ordered by the user's own currency ranking, not
                  alphabetically, so a string comparison would either skip
                  or duplicate a pair depending on rank vs. alphabetical
                  order. Pairing by array position still visits each
                  unordered pair exactly once regardless of sort order. */}
              {ownCurrencies.flatMap((a, i) =>
                ownCurrencies.slice(i + 1).map((b) => {
                  const rAB = effectiveRate(a, b, rates);
                  const rBA = effectiveRate(b, a, rates);
                  return (
                    <div key={`${a}-${b}`} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="text-muted">1 {a} =</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>{rAB !== null ? `${rAB.toFixed(4)} ${b}` : `— ${b} (no rate yet)`}</span>
                      </div>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="text-muted">1 {b} =</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>{rBA !== null ? `${rBA.toFixed(4)} ${a}` : `— ${a} (no rate yet)`}</span>
                      </div>
                    </div>
                  );
                }),
              )}
            </div>
          )}
</Modal>}
      {filtersOpen && <PageFilterModal onClose={() => setFiltersOpen(false)} onReset={() => {
        const next = new URLSearchParams(scopeParams);
        ['entities', 'show-currencies', 'show-monthly', 'show-plans', 'show-recent', 'show-analytics', 'show-upcoming'].forEach(key => next.delete(key));
        setScopeParams(next);
      }}>
        <h3>Sections</h3>
        <div className="filter-preset-row">{[{ key: 'currencies', label: 'Per currency summary' }, { key: 'plans', label: 'Plans' }, { key: 'analytics', label: 'Analytics' }].map(section => <IncludeChip key={section.key} label={section.label} checked={sectionVisible(section.key)} onToggle={() => toggleSection(section.key)} />)}</div>
        <h3>Sources</h3>
        <div className="filter-preset-row">{moduleOptions.map(value => <IncludeChip key={value} label={value === 'creditCards' ? 'Credit cards' : value === 'personalLoans' ? 'Personal loans' : value.toUpperCase()} checked={selectedModules.includes(value)} onToggle={() => {
          const selected = selectedModules.includes(value) ? selectedModules.filter(module => module !== value) : [...selectedModules, value];
          if (!selected.length) return;
          const next = new URLSearchParams(scopeParams);
          if (selected.length === moduleOptions.length) next.delete('entities'); else next.set('entities', selected.join(','));
          setScopeParams(next);
        }} />)}</div>
        <h3>Include in Net Worth</h3>
      <IncludeInNetWorthControls groups={inclusionGroups} onToggle={option => toggleInclude(() => setNetWorthInclusion(option, !option.included))} />

      </PageFilterModal>}
      {drilldown && <NetWorthDrilldownModal drilldown={drilldown} onClose={() => setDrilldown(null)} />}
    </div>
  );
}

function NetWorthInsightsSection({ rows, activities, fromDate, toDate, rangeLabel, missingFxCurrencies }: {
  rows: CurrencyNetWorth[]; activities: BudgetActivity[]; fromDate: string; toDate: string; rangeLabel: string; missingFxCurrencies: string[];
}) {
  const insights = getDashboardInsights(rows, activities, fromDate, toDate);
  return <div className="mb-md">
    <h3>Insights — {rangeLabel}</h3>
    <div className="grid-auto" style={gridAutoStyle(260, 12)}>
      {insights.map(row => {
        const { largestAsset, largestLiability, netActivity, clearedCount } = row;
        return <Card key={row.currency}>
          <h4 className="mt-0">{row.currency}</h4>
          <p><strong>Largest asset:</strong> {largestAsset ? largestAsset.module + ' — ' + fmtMoney(largestAsset.amount, row.currency) : 'No positive balance recorded'}</p>
          <p><strong>Largest liability:</strong> {largestLiability ? largestLiability.module + ' — ' + fmtMoney(largestLiability.amount, row.currency) : 'No liability recorded'}</p>
          <p><strong>Recorded net activity:</strong> <span style={{ color: netActivity >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{fmtMoney(netActivity, row.currency)}</span></p>
          <p className="text-muted mb-0">{clearedCount} cleared Cash, Bank or Rental entries in this range. Linked transfers are excluded.</p>
        </Card>;
      })}
    </div>
    {missingFxCurrencies.length > 0 && <Notice tone="warning" className="mt-12">Conversion is incomplete for {missingFxCurrencies.join(', ')}. Those currencies remain visible in their own sections but are excluded from converted totals and the capital-split chart.</Notice>}
  </div>;
}

function NetWorthAnalyticsSection({ ownCurrencies, activities, categories, groups, emiLoans, currentRows, periodEndRows, activityCurrencies, netWorthAsOfInputs, todayISODate, rangeStartDate, rangeEndDate, rangeLabel, setDrilldown, splitData, preferredCurrency, missingFxCurrencies, rentalsNet }: {
  ownCurrencies: string[]; activities: BudgetActivity[]; categories: Category[];
  groups: CategoryGroup[]; emiLoans: Parameters<typeof projectedNetWorthTrend>[0]['emiLoans'];
  currentRows: CurrencyNetWorth[]; periodEndRows: CurrencyNetWorth[]; activityCurrencies: string[]; netWorthAsOfInputs: NetWorthAsOfInputs; todayISODate: string;
  rangeStartDate: string; rangeEndDate: string; rangeLabel: string; setDrilldown: (d: Drilldown) => void;
  splitData: Array<{ currency: string; converted: number }>; preferredCurrency: string; missingFxCurrencies: string[]; rentalsNet: Record<string, number>;
}) {
  return <div>
    <NetWorthInsightsSection rows={periodEndRows} activities={activities} fromDate={rangeStartDate} toDate={rangeEndDate} rangeLabel={rangeLabel} missingFxCurrencies={missingFxCurrencies} />
    <NetWorthMonthlySection ownCurrencies={ownCurrencies} activityCurrencies={activityCurrencies} activities={activities} emiLoans={emiLoans} currentRows={currentRows} netWorthAsOfInputs={netWorthAsOfInputs} todayISODate={todayISODate} rangeStartDate={rangeStartDate} rangeEndDate={rangeEndDate} setDrilldown={setDrilldown} />
    <CategoryGroupsSection ownCurrencies={activityCurrencies} activities={activities} categories={categories} groups={groups} fromDate={rangeStartDate} toDate={rangeEndDate} rangeLabel={rangeLabel} setDrilldown={setDrilldown} />
    {splitData.length > 1 && <ChartCard flat title={`Capital split by currency at period end (converted to ${preferredCurrency})`} empty={false}><div style={{ height: 220 }}><Doughnut data={{ labels: splitData.map((item) => item.currency), datasets: [{ data: splitData.map((item) => item.converted), backgroundColor: HUES }] }} options={{ plugins: { datalabels: dlDoughnut((value) => fmtMoney(value, preferredCurrency)) } }} /></div></ChartCard>}
    {Object.keys(rentalsNet).length > 0 && <div className="mt-12"><div className="label mb-sm">Rental net income in selected period (informational — not included above)</div><div className="text-muted mb-sm">Property values aren't tracked, and deposited rental income already lands in Cash/Bank; counting it again would double-count it.</div><div className="row" style={{ gap: 12 }}>{Object.entries(rentalsNet).map(([code, amount]) => <div key={code} className="stat-card card" style={hueStyle('var(--accent)')}><div className="label">{code}</div><MoneyValue n={amount} currency={code} /></div>)}</div></div>}
  </div>;
}

function NetWorthPlanningReality({ selectedModules, defaultMonth, todayISODate }: { selectedModules: string[]; defaultMonth: string; todayISODate: string }) {
  const [params, setParams] = useSearchParams();
  const month = params.get('plan-month') || defaultMonth;
  const span = Number(params.get('plan-months') || 1);
  const bounds = getMonthlyPlanReport([], month, span, todayISODate);
  const activities = useDashboardActivities(selectedModules, { fromDate: bounds.fromDate, toDate: bounds.toDate });
  const report = getMonthlyPlanReport(activities, month, span, todayISODate);
  const { rows: planRows, controls: planPagination } = useTablePagination(report.planned);
  const change = (patch: Record<string, string>) => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([key, value]) => next.set(key, value)); setParams(next); };
  return <div>
    <div className="row mb-md">
      <Field label="Plan month"><TextInput type="month" value={report.fromDate.slice(0, 7)} onChange={event => change({ 'plan-month': event.target.value })} /></Field>
      <Field label="Compare months"><Select value={String(report.months.length)} onChange={event => change({ 'plan-months': event.target.value })}>{[1,3,6,12].map(value => <option key={value} value={value}>{value} {value === 1 ? 'month' : 'months'}</option>)}</Select></Field>
    </div>
    <p className="text-muted">{report.fromDate} – {report.toDate}. Cash, Bank and Rental activity. Actual values are cleared through {todayISODate}; plans are intentions, not settled balances.</p>
    {report.rows.map(row => <div key={row.currency} className="mb-md">
      <h3>{row.currency} monthly activity</h3>
      <ChartCard flat title={row.currency + ' — actual, pending and planned'}><div style={{ height: 240 }}><Chart type="bar" data={{ labels: report.months, datasets: [
        { label: 'Actual inflow (' + row.currency + ')', data: row.months.map(item => item.actualIn), backgroundColor: HUES[0] },
        { label: 'Actual outflow (' + row.currency + ')', data: row.months.map(item => item.actualOut), backgroundColor: HUES[1] },
        { label: 'Pending net (' + row.currency + ')', data: row.months.map(item => item.pendingNet), backgroundColor: HUES[2] },
        { label: 'Remaining planned flow (' + row.currency + ')', data: row.months.map(item => item.plannedNet), backgroundColor: HUES[3] },
      ] }} options={{ plugins: { legend: { display: true } } }} /></div></ChartCard>
      <div className="table-scroll"><table><caption>{row.currency} — same monthly dataset as chart</caption><thead><tr><th>Month</th><th>Actual in</th><th>Actual out</th><th>Pending in</th><th>Pending out</th><th>Planned in</th><th>Planned out</th></tr></thead><tbody>{row.months.map(item => <tr key={item.month}><td>{item.month}</td>{[item.actualIn,item.actualOut,item.pendingIn,item.pendingOut,item.plannedIn,item.plannedOut].map((value,index) => <td key={index}>{fmtMoney(value,row.currency)}</td>)}</tr>)}</tbody></table></div>
    </div>)}
    {!report.rows.length && <p className="text-muted">No actual, pending or planned activity in this month range and source scope.</p>}
    <div className="table-scroll"><table><caption>Remaining plans — {report.fromDate} to {report.toDate}</caption><thead><tr><th>Date</th><th>Source</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead><tbody>{planRows.map(item => <RecordRow record={item} key={item.module + ':' + item.id}><td><DateValue value={item.date} /></td><td>{item.sourceLabel}</td><td>{item.description}</td><td>{item.category || 'Uncategorized'}</td><td>{fmtMoney(item.amount,item.currencyCode)}</td></RecordRow>)}</tbody></table></div>
    {planPagination}
  </div>;
}

/** A single toggleable `.chip` — the exact pattern `ChartFilterBar`'s
 * ticker filter already established, reused here instead of a vertical
 * `<label><input type="checkbox">` stack (see `IncludeInNetWorthControls`'s own
 * doc comment for why). */
function IncludeChip({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`chip${checked ? ' active' : ''}`} aria-pressed={checked} onClick={onToggle}>
      {checked && <CheckIcon size={11} />}{label}
    </button>
  );
}

/** Persistent inclusion controls, hosted in the central page filters popup. */
function IncludeInNetWorthControls({ groups, onToggle }: { groups: NetWorthInclusionGroup[]; onToggle: (option: NetWorthInclusionOption) => void }) {
  return <>
    <p className="text-muted mt-0">Unchecked items are left out of every net-worth total. Archiving an item does not exclude its balance.</p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map(group => <div key={group.title}>
        <div className="text-muted" style={{ marginBottom: 6, fontWeight: 600 }}>{group.title}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{group.items.map(option => <IncludeChip key={option.module + ':' + (option.id ?? '')} label={option.label} checked={option.included} onToggle={() => onToggle(option)} />)}</div>
      </div>)}
    </div>
  </>;
}

/** User-requested (2026-09-04): "Create a chart of this table as well on
 * Net Worth Page. 2-in-one stacked bar chart of Assets vs Liabilities +
 * net worth, with a line chart showing the monthly trend... charts should
 * be interactive like Budget Planner: Monthly summary instead of 60 years
 * of a man's life messed in a single chart." Moved (not duplicated) from
 * `BudgetPlannerPage.tsx` — see that file's own doc comment. One shared
 * ◀ Earlier/Today/Later ▶ window (default 3 past + current + 2 future
 * months) governs BOTH the chart grid and the table grid below it, exactly
 * like Budget Planner's own single scroll control used to.
 *
 * "Just like the grid of accounts summary per currency, each chart and
 * table should show for all currencies in a grid instead of toggling" —
 * both the chart grid and the table grid render ONE item per currency the
 * user actually holds (`ownCurrencies`), no currency picker at all. */
function NetWorthMonthlySection({
  ownCurrencies,
  activityCurrencies,
  activities,
  emiLoans,
  currentRows,
  netWorthAsOfInputs,
  todayISODate,
  rangeStartDate,
  rangeEndDate,
  setDrilldown,
}: {
  ownCurrencies: string[];
  activityCurrencies: string[];
  activities: BudgetActivity[];
  emiLoans: Parameters<typeof projectedNetWorthTrend>[0]['emiLoans'];
  currentRows: Parameters<typeof projectedNetWorthTrend>[0]['currentRows'];
  netWorthAsOfInputs: NetWorthAsOfInputs;
  todayISODate: string;
  rangeStartDate: string;
  rangeEndDate: string;
  setDrilldown: (d: Drilldown) => void;
}) {
  const nowMonth = todayISODate.slice(0, 7);
  // The same page-level range controls the monthly chart and table; no
  // independent six-month slider can silently show a different period.
  const months = useMemo(() => getReportingMonths(rangeStartDate.slice(0, 7), rangeEndDate.slice(0, 7)), [rangeStartDate, rangeEndDate]);
  const rangeActivities = useMemo(() => getClearedRangeActivities(activities, rangeStartDate, rangeEndDate, todayISODate), [activities, rangeStartDate, rangeEndDate, todayISODate]);
  const monthly = useMemo(() => monthlyIncomeExpense(rangeActivities, months), [rangeActivities, months]);
  const trend = useMemo(
    () => projectedNetWorthTrend({ months, currentMonth: nowMonth, todayISODate, currentRows, activities, emiLoans, netWorthAsOfInputs }),
    [months, nowMonth, todayISODate, currentRows, activities, emiLoans, netWorthAsOfInputs],
  );

  if (!ownCurrencies.length && !activityCurrencies.length) return null;
  const monthlyCurrencies = [...new Set([...ownCurrencies, ...activityCurrencies])];

  return (
    <div className="mb-md">
      <p className="text-muted">Cash-flow totals and category insights use the exact selected dates. Net-worth trend points show each completed month-end balance (and today's balance for the current month).</p>
      <div className="grid-auto" style={{ ...gridAutoStyle(380, 16), marginBottom: 16 }}>
        {ownCurrencies.map((currency) => (
          <NetWorthComboChart key={currency} currency={currency} months={months} trend={trend} />
        ))}
      </div>

      {/* User-reported (2026-09-09): "Tables should have 100% width...
         unable to read the tables in SS" — this table was one of the
         concrete examples: side-by-side in a 420px grid column left almost
         no room to show more than 2-3 of its 6 months before `.table-scroll`
         kicked in, which is exactly what made the screenshot look broken.
         Stacked full-width instead — each currency's table gets the whole
         page width, only falling back to horizontal scroll if it still
         doesn't fit. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {monthlyCurrencies.map((currency) => (
          <MonthlySummaryTable
            key={currency}
            currency={currency}
            months={months}
            nowMonth={nowMonth}
            monthly={monthly}
            trend={trend}
            activities={rangeActivities}
            rangeStartDate={rangeStartDate}
            rangeEndDate={rangeEndDate}
            currentRows={currentRows}
            netWorthAsOfInputs={netWorthAsOfInputs}
            setDrilldown={setDrilldown}
          />
        ))}
      </div>
    </div>
  );
}

/** The "2-in-1" chart: stacked Assets (positive)/Liabilities (negative)
 * bars with a Net Worth line overlaid on the same canvas — via `<Bar>`'s
 * per-dataset `type: 'line'` override (needs `BarController`/
 * `LineController` both registered, see `chartSetup.ts`). Liabilities
 * plotted as a NEGATIVE number so the stack diverges from a zero baseline
 * (assets up, liabilities down) — the stacked total then naturally equals
 * Net Worth, which the line dataset also plots explicitly.
 *
 * User-reported (2026-09-06): "Make chart colours transparent, not solid.
 * they are Hiding lines." The bar fills were fully opaque `--profit`/
 * `--loss`, so wherever the Net Worth line's own y-value fell inside a
 * bar's own drawn area, the solid bar painted over it. Fixed with a
 * hex+alpha suffix (`B3` ≈ 70% opacity — same "#RRGGBB + 2-digit alpha
 * hex" technique `chartLabels.ts`'s `dimColor()` already uses) on both
 * bar fills, so the line stays visible through them regardless of Chart.js's
 * own draw order between a mixed bar/line dataset pair; the line itself
 * also got a slightly heavier `borderWidth` so it reads clearly as the
 * foreground series. */
/** User-requested (2026-09-16): "we can show analysis based on categs. We
 * can let user group categories to configure the bird's-eye view" — the
 * Dashboard-side half of the category-groups feature (the other half,
 * building/editing groups themselves, lives on `/account` — see
 * `CategoriesSection` there). Shows THIS MONTH's own net total per group,
 * per currency, since that's the shape the user's own Excel workflow
 * described ("find my monthly expense/income/accommodation"). Only
 * renders once at least one group exists — an empty state here would just
 * be one more thing to explain on a page that's already dense; the "how
 * do I make one" answer lives on `/account` instead, linked from the
 * section's own intro line. */
function CategoryGroupsSection({
  ownCurrencies, activities, categories, groups, fromDate, toDate, rangeLabel, setDrilldown,
}: {
  ownCurrencies: string[]; activities: BudgetActivity[]; categories: Category[];
  groups: CategoryGroup[]; fromDate: string; toDate: string; rangeLabel: string;
  setDrilldown: (d: Drilldown) => void;
}) {
  if (!groups.length) return null;

  return (
    <div className="mb-md">
      <h3>By category group</h3>
      <p className="text-muted" style={{ marginTop: 0, marginBottom: 12 }}>
        Net total from {fromDate} through {toDate} ({rangeLabel}) for each group you've configured — a positive number
        means that group's own activity added money during the selected range, negative means it took money out.
        Manage which categories belong to a group on the{' '}
        <Link to="/account">Account page</Link>.
      </p>
      <div className="grid-auto" style={{ ...gridAutoStyle(260, 12) }}>
        {groups.map((g) => {
          const { byCurrency, details } = getCategoryGroupReport(activities, g, categories, fromDate, toDate);
          const currenciesHere = ownCurrencies.filter((c) => byCurrency[c] !== undefined);
          return (
            <Card key={g.id}>
              <div className="label mb-sm">{g.name}</div>
              {currenciesHere.length === 0 ? (
                <div className="text-muted">No activity in this range.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {currenciesHere.map((c) => (
                    <span
                      key={c}
                      className={`pill clickable ${byCurrency[c] >= 0 ? 'pill-positive' : 'pill-negative'}`}
                      onClick={() => setDrilldown({
                        kind: 'flow',
                        title: `${g.name} — ${rangeLabel}, ${c}`,
                        explanation: `Every real and planned entry from ${fromDate} through ${toDate} whose category is in the "${g.name}" group.`,
                        currency: c,
                        from: fromDate,
                        to: toDate,
                        items: details[c] ?? [],
                      })}
                    >
                      {byCurrency[c] >= 0 ? '+' : ''}{fmtMoney(byCurrency[c], c)}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function NetWorthComboChart({ currency, months, trend }: { currency: string; months: string[]; trend: MonthlyNetWorthPoint[] }) {
  const byMonth = new Map(trend.map((t) => [t.month, t]));
  return (
    <ChartCard flat title={`Net worth — ${currency}`}>
      <Chart
        type="bar"
        data={{
          labels: months.map(monthLabel),
          // Mixed bar+line datasets on one canvas: Chart.js supports a
          // per-dataset `type` override (needs BarController+LineController
          // both registered, see chartSetup.ts) — react-chartjs-2's generic
          // <Chart type="bar"> component (unlike the narrower <Bar>) accepts
          // a mixed 'bar' | 'line' dataset array once explicitly annotated.
          datasets: [
            {
              type: 'bar', label: 'Assets', stack: 'nw',
              data: months.map((m) => byMonth.get(m)?.assetsByCurrency[currency] ?? null),
              backgroundColor: withAlpha(cssVar('--profit'), '#3ecf8e'),
            },
            {
              type: 'bar', label: 'Liabilities', stack: 'nw',
              data: months.map((m) => {
                const v = byMonth.get(m)?.liabilitiesByCurrency[currency];
                return v === undefined ? null : -v;
              }),
              backgroundColor: withAlpha(cssVar('--loss'), '#e5484d'),
            },
            {
              type: 'line', label: 'Net worth',
              data: months.map((m) => byMonth.get(m)?.byCurrency[currency] ?? null),
              borderColor: cssVar('--accent') || '#5aa9c9',
              backgroundColor: 'transparent',
              borderWidth: 3,
              tension: 0.2,
              datalabels: dlLine((v) => fmtMoney(v, currency)),
            },
          ] as ChartDataset<'bar' | 'line', (number | null)[]>[],
        }}
        options={{ scales: { x: { stacked: true }, y: { stacked: true } } }}
      />
    </ChartCard>
  );
}

/** The scrollable multi-month summary table, moved from Budget Planner
 * (README item 107's original design, user-requested 2026-08-27) — now
 * rendered once per currency instead of behind a currency picker. */

/** The Inflow/Outflow cells' itemized drill-down — every `BudgetActivity`
 * (real + planned, Cash+Bank+Rentals, already excluding linked-transfer
 * legs, per `collectBudgetActivities`'s own doc comment) in this exact
 * month+currency, mapped onto the shared `Drilldown['flow']` item shape so
 * the same `NetWorthDrilldownModal` rendering (already used by the Today's/
 * This month's flow pills above) covers this too, no new UI needed. This
 * deliberately does NOT reuse `flowActivity()` — that helper is Cash+Bank
 * ONLY (see its own doc comment), which would silently under-list a month
 * with real Rentals activity even though the cell's own total (from
 * `monthlyIncomeExpense`, built on the same `activities` array) already
 * includes it — the itemized popup must always reconcile with the number
 * it was opened from. */

function MonthlySummaryTable({
  currency, months: initialMonths, nowMonth, monthly, trend, activities, rangeStartDate, rangeEndDate, currentRows, netWorthAsOfInputs, setDrilldown,
}: {
  currency: string; months: string[]; nowMonth: string; monthly: MonthlyIncomeExpense[]; trend: MonthlyNetWorthPoint[];
  activities: BudgetActivity[]; rangeStartDate: string; rangeEndDate: string; currentRows: CurrencyNetWorth[]; netWorthAsOfInputs: NetWorthAsOfInputs;
  setDrilldown: (d: Drilldown) => void;
}) {
  const monthSort = useDateTableSort();
  const monthSortInput = initialMonths;
  const months = monthSort.rows(monthSortInput, { date: month => month });
  const monthlyByMonth = new Map(monthly.map((m) => [m.month, m]));
  const trendByMonth = new Map(trend.map((m) => [m.month, m]));

  const statusFor = (m: string): 'Actual' | 'Current' | 'Projected' =>
    m < nowMonth ? 'Actual' : m === nowMonth ? 'Current' : 'Projected';
  const monthFrom = (month: string) => {
    const start = month + '-01';
    return start < rangeStartDate ? rangeStartDate : start;
  };
  const monthTo = (month: string) => {
    const end = endOfMonthAsOf(month);
    return end > rangeEndDate ? rangeEndDate : end;
  };

  return (<>
    <MonthlyStatsWidget currency={currency} rows={getMonthlyStatCards(initialMonths, currency, monthly, trend)} />
    <TableCard collapsible={false} dateSort={monthSort} rows={months.map(month => ({ month, ...monthlyByMonth.get(month), ...trendByMonth.get(month) }))} title={<h3 className="m-0">Monthly summary — {currency}</h3>}>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <monthSort.Th rows={monthSortInput}>Month</monthSort.Th>
              {months.map((m) => (
                <th key={m} style={{ minWidth: 130 }}>
                  {new Date(`${m}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}<br />
                  <span className="text-muted" style={{ fontWeight: statusFor(m) === 'Current' ? 700 : 400 }}>
                    {statusFor(m)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <Tooltip text="Everything that added money in this month — real transactions and planned entries combined, EXCLUDING any linked inter-account transfer (moving your own money between your own accounts isn't real income). Click a month to see the real entries.">
                  Inflow
                </Tooltip>
              </td>
              {months.map((m) => {
                const value = monthlyByMonth.get(m)?.income[currency] ?? 0;
                return (
                  <td
                    key={m}
                    className="clickable"
                    onClick={() => setDrilldown({
                      kind: 'flow',
                      title: `Inflow — ${monthLabel(m)}, ${currency}`,
                      explanation: 'Every real and planned entry that added money this month, in this currency — Cash/Bank/Rentals combined, excluding any linked inter-account transfer.',
                      currency,
                      from: monthFrom(m),
                      to: monthTo(m),
                      items: monthlyFlowItems(activities, m, currency).filter((it) => it.amount >= 0),
                    })}
                  >
                    {fmtMoney(value, currency)}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td>
                <Tooltip text="Everything that took money out this month — real transactions and planned entries combined, EXCLUDING any linked inter-account transfer (moving your own money between your own accounts isn't a real expense). Click a month to see the real entries.">
                  Outflow
                </Tooltip>
              </td>
              {months.map((m) => {
                const value = monthlyByMonth.get(m)?.expense[currency] ?? 0;
                return (
                  <td
                    key={m}
                    className="clickable"
                    onClick={() => setDrilldown({
                      kind: 'flow',
                      title: `Outflow — ${monthLabel(m)}, ${currency}`,
                      explanation: 'Every real and planned entry that took money out this month, in this currency — Cash/Bank/Rentals combined, excluding any linked inter-account transfer.',
                      currency,
                      from: monthFrom(m),
                      to: monthTo(m),
                      items: monthlyFlowItems(activities, m, currency).filter((it) => it.amount < 0),
                    })}
                  >
                    {fmtMoney(value, currency)}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td>
                <Tooltip text="Inflow minus outflow for this month — real transactions and planned entries combined, EXCLUDING any linked inter-account transfer (which is neither an inflow nor an outflow). Click a month to see every entry that made up this figure.">
                  Net flow
                </Tooltip>
              </td>
              {months.map((m) => {
                const row = monthlyByMonth.get(m);
                const net = getMonthlyNetFlow(row, currency);
                return (
                  <td
                    key={m}
                    className="clickable"
                    onClick={() => setDrilldown({
                      kind: 'flow',
                      title: `Net flow — ${monthLabel(m)}, ${currency}`,
                      explanation: 'Every real and planned entry this month, in this currency, that makes up Inflow minus Outflow — Cash/Bank/Rentals combined, excluding any linked inter-account transfer.',
                      currency,
                      from: monthFrom(m),
                      to: monthTo(m),
                      items: monthlyFlowItems(activities, m, currency),
                    })}
                  >
                    <span className={`pill ${net >= 0 ? 'pill-positive' : 'pill-negative'}`}>{fmtMoney(net, currency)}</span>
                  </td>
                );
              })}
            </tr>
            <tr>
              <td>
                <Tooltip text="The real sum of every account as of that month's last day (Assets minus Liabilities) — a completed past month is computed directly from your actual transaction history, not a projection. The current month uses today's real figure. Future months are projected from today plus planned income/expense and each EMI loan's amortization schedule. Click a month for a module-by-module breakdown.">
                  Net worth
                </Tooltip>
              </td>
              {months.map((m) => {
                const value = trendByMonth.get(m)?.byCurrency[currency];
                if (value === undefined) {
                  return <td key={m}><span className="text-muted">—</span></td>;
                }
                return (
                  <td
                    key={m}
                    className="clickable"
                    onClick={() => {
                      const { rows: breakdownRows, isProjected } = netWorthBreakdownForMonth(
                        m, currency, nowMonth, netWorthAsOfInputs, currentRows, trendByMonth.get(m),
                      );
                      setDrilldown({
                        kind: 'breakdown',
                        title: `Net worth — ${monthLabel(m)}, ${currency}, by module`,
                        explanation: isProjected
                          ? 'This month hasn\'t happened yet — Assets and Liabilities here are PROJECTED from today\'s real figures plus planned income/expense and each EMI loan\'s amortization schedule, not itemized per module the way a completed month is.'
                          : `Every module's own real contribution as of ${monthLabel(m)}'s last day — a positive row adds to net worth, a negative row (EMI/credit cards/net owed) subtracts from it.`,
                        rows: breakdownRows.map((b) => ({ label: b.module, currency, amount: b.amount })),
                      });
                    }}
                  >
                    <span className={`pill ${value >= 0 ? 'pill-positive' : 'pill-negative'}`}>{fmtMoney(value, currency)}</span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-muted" style={{ marginTop: 8, marginBottom: 0 }}>
        Net worth shows "—" only where this currency had no activity yet as of that month.
      </p>
    </TableCard>
  </>);
}

function ModuleBalanceChart({ row }: { row: CurrencyNetWorth }) {
  const chart = getModuleBreakdownChart(row);
  if (!chart.labels.length) return null;
  return <ChartCard flat title={row.currency + ' current balance by module'}><div style={{ height: 200 }}><Chart type="bar" data={{ labels: chart.labels, datasets: [{ label: 'Current balance (' + row.currency + ')', data: chart.amounts, backgroundColor: HUES[0] }] }} options={{ indexAxis: 'y', plugins: { legend: { display: false } } }} /></div></ChartCard>;
}

function MoneyMovementSection({ selectedModules, from, to, today, setDrilldown }: { selectedModules: readonly string[]; from: string; to: string; today: string; setDrilldown: (value: Drilldown) => void }) {
  const [dimension,setDimension] = useState<FlowDimension>('category');
  const [population,setPopulation] = useState<FlowPopulation>('actual');
  const [kind,setKind] = useState<MovementKind | 'all'>('all');
  const activities = useNativeMovementActivities(selectedModules,{ fromDate: from, toDate: to });
  const report = getMoneyMovementReport(activities,from,to,today,dimension,population,kind);
  return <div className="money-movement-report">
    <p className="text-muted">{from} – {to}. Cash, Bank, Rentals, cards, recorded loan repayments, Funds and all exchange brokers. Investments and financing are separate from income/spending. Unclassified account records stay visible. Internal transfers are excluded from the combined view.</p>
    <div className="row mb-md"><Field label="Activity"><Select value={population} onChange={event => setPopulation(event.target.value as FlowPopulation)}><option value="actual">Cleared actual</option><option value="pending">Pending</option><option value="planned">Remaining plans</option></Select></Field>
      <Field label="Break down by"><Select value={dimension} onChange={event => setDimension(event.target.value as FlowDimension)}><option value="category">Category</option><option value="module">Module</option><option value="source">Account / source</option><option value="plan">Plan group</option><option value="kind">Movement kind</option></Select></Field>
      <Field label="Movement kind"><Select value={kind} onChange={event => setKind(event.target.value as MovementKind | 'all')}><option value="all">All except internal transfers</option><option value="operating">Income / spending</option><option value="financing">Financing</option><option value="investment">Investments</option><option value="unclassified">Unclassified movement</option><option value="transfer">Internal transfer legs</option></Select></Field></div>
    {report.rows.map(row => <div key={row.currency} className="mb-md"><SummarySections><SummarySection title={row.currency + ' · ' + population}>
      <SummaryValue primary label="Net movement" value={fmtMoney(row.net,row.currency)} />
      <SummaryValue label="Money in" value={fmtMoney(row.inflow,row.currency)} tone="positive" />
      <SummaryValue label="Money out" value={fmtMoney(row.outflow,row.currency)} tone="negative" />
    </SummarySection></SummarySections>
    <ChartCard flat title={row.currency + ' — money in and out by ' + dimension}><div style={{ height: Math.max(200,Math.min(600,row.groups.length * 34)) }}><Chart type="bar" data={{ labels: row.groups.map(group => group.label), datasets: [
      { label: 'Money in (' + row.currency + ')', data: row.groups.map(group => group.inflow), backgroundColor: HUES[2] },
      { label: 'Money out (' + row.currency + ')', data: row.groups.map(group => group.outflow), backgroundColor: HUES[1] },
    ] }} options={{ indexAxis: 'y', plugins: { legend: { display: true } } }} /></div></ChartCard>
    <div className="table-scroll"><table><caption>{row.currency} — same records as chart; select a row for contributing activity</caption><thead><tr><th>{dimension}</th><th>Money in</th><th>Money out</th><th>Net</th></tr></thead><tbody>{row.groups.map(group => <RecordRow key={group.key} record={group} onOpen={() => setDrilldown({ kind: 'flow', title: group.label + ' · ' + row.currency, explanation: population + ' activity from ' + from + ' through ' + to + '. Unallocated means no explicit plan link.', currency: row.currency, from, to, items: group.items })}><td>{group.label}</td><td>{fmtMoney(group.inflow,row.currency)}</td><td>{fmtMoney(group.outflow,row.currency)}</td><td>{fmtMoney(group.net,row.currency)}</td></RecordRow>)}</tbody></table></div>
    </div>)}
    {!report.rows.length && <p className="text-muted">No matching {population} activity in this period and source scope.</p>}
    <p className="text-muted">Loan contracts, amortization schedules and subscription renewals are not actual payments. Generated subscription plans appear under their paying source. Internal transfer details show recorded legs; gross amounts are not income or spending.</p>
    {dimension === 'plan' && <p className="text-muted">Actual records remain unallocated unless a plan link exists; no allocation is inferred from matching labels or amounts.</p>}
  </div>;
}
