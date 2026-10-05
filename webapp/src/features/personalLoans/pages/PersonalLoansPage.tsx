import { BackButton } from '../../../components/BackButton';
import { BalanceSummaryCards } from '../../../components/BalanceSummaryCards';
import type { User } from 'firebase/auth';
import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Card, EntityCard, MoneyValue } from '../../../components/Card';
import { StandardPageSections, type StandardPageSection } from '../../../components/StandardPageSections';
import { ModuleDetailTemplate } from '../../../components/ModuleDetailTemplate';
import { SummaryChip, type StandardCardAction } from '../../../components/StandardCard';
import { AttributeList } from '../../../components/ui/AttributeList';
import { CategorySelect } from '../../../components/CategorySelect';
import { AnalyticsChartEnhancer } from '../../../components/AnalyticsChartCard';
import { TopBarControls, TopBarSelect } from '../../../components/TopBarControls';
import { EntityScopeMenu, selectedEntityValues } from '../../../components/EntityScopeMenu';
import { TransactionFilterMenu } from '../../../components/TransactionFilterMenu';
import { usePageTopBarRightSlot } from '../../../hooks/usePageTopBar';
import { useUrlTransactionFilters, type TransactionPageFilters } from '../../../hooks/useUrlTransactionFilters';
import { Modal } from '../../../components/Modal';
import { LoanPaymentsBatchEditor, LoanPlansBatchEditor } from '../../../components/LazyFinanceBatchEditors';
import { Notice } from '../../../components/Notice';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { hueStyle } from '../../../lib/statCardHues';
import { ArchiveIcon, CheckIcon, EditIcon, FilterIcon, PersonalLoanIcon, PlusIcon, RestoreIcon, SaveIcon, StarIcon, TransferIcon, TrashIcon, XIcon } from '../../../components/icons';
import { toast } from '../../../components/Toast';
import { Tooltip } from '../../../components/Tooltip';
import { Field, Select, TextInput } from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { FabPanel } from '../../../components/ui/Fab';
import { TransactionEntryModal } from '../../../components/TransactionEntryModal';
import { RecordDetailModal } from '../../../components/RecordDetailModal';
import { useEnabledCurrencies } from '../../../hooks/useEnabledCurrencies';
import { useLastCurrency } from '../../../hooks/useLastCurrency';
import { usePrimaryCurrency } from '../../../hooks/usePrimaryCurrency';
import { ReorderButtons } from '../../../components/ui/ReorderButtons';
import { dateOnlyMs } from '../../../lib/datetime';
import { parseCSV, toCSV } from '../../../lib/csv';
import { formatDate, fmtMoney } from '../../../lib/format';
import { categoryName } from '../../../lib/categories';
import { confirmAndDeleteLinkable } from '../../../lib/linkCascade';
import {
  loanCategoryForDirection,
  loanOutstanding,
  netPendingByCurrency,
  netPositionByCurrency,
  projectPayoff,
  repaymentRunningOutstanding,
} from '../../../lib/calc/personalLoansModule';
import { dlBarV, dlDoughnut } from '../../../lib/chartLabels';
import { applyChartTheme } from '../../../lib/chartSetup';
import { cssVar, tickerColor } from '../../../lib/cssVar';
import { chartAlpha, chartDepthPlugin } from '../../../lib/chartVisuals';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { firebaseReady } from '../../../lib/firebase/client';
import { useAppearanceStore } from '../../../store/appearanceStore';
import { usePersonalLoansWorkbookStore } from '../../../store/personalLoansWorkbookStore';
import { useCategoryStore } from '../../../store/categoryStore';
import { useInterEntityTransfersStore } from '../../../store/interEntityTransfersStore';
import { linkTargetPath, useLinkSideLabel } from '../../transfers/pages/TransferLinksPage';
import type { PersonalLoan, PersonalLoanPlan, PersonalLoanRepayment } from '../../../types/personalLoansWorkbook';
import { gridAutoStyle } from '../../../lib/gridStyle';

const today = () => new Date().toISOString().slice(0, 10);

function emptyLoan(defaultCurrency: string): PersonalLoan {
  return { id: '', person: '', direction: 'owed_to_me', currencyCode: defaultCurrency, principal: 0, date: today(), note: '' };
}

type PersonalLoanPaymentFilters = {
  fromDate: string;
  toDate: string;
  source: 'all' | 'manual' | 'statement-import';
  categoryID: string;
};

function PersonalLoanPaymentFilterMenu({
  value,
  categories,
  onChange,
  onClear,
}: {
  value: PersonalLoanPaymentFilters;
  categories: ReturnType<typeof useCategoryStore.getState>['workbook']['categories'];
  onChange: (patch: Partial<PersonalLoanPaymentFilters>) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount =
    (value.fromDate ? 1 : 0)
    + (value.toDate ? 1 : 0)
    + (value.source !== 'all' ? 1 : 0)
    + (value.categoryID !== 'all' ? 1 : 0);

  return (
    <>
      <button type="button" className="btn secondary small topbar-filter-btn" onClick={() => setOpen(true)}>
        <FilterIcon size={14} /> Filters{activeCount ? ` (${activeCount})` : ''}
      </button>
      {open && (
        <Modal title="Payment filters" onClose={() => setOpen(false)} widthClass="50">
          <div className="filter-fields-grid">
            <Field label="From">
              <TextInput type="date" value={value.fromDate} max={value.toDate || undefined} onChange={(e) => onChange({ fromDate: e.target.value })} />
            </Field>
            <Field label="To">
              <TextInput type="date" value={value.toDate} min={value.fromDate || undefined} onChange={(e) => onChange({ toDate: e.target.value })} />
            </Field>
            <Field label="Category">
              <Select value={value.categoryID} onChange={(e) => onChange({ categoryID: e.target.value })}>
                <option value="all">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </Select>
            </Field>
            <Field label="Source">
              <Select value={value.source} onChange={(e) => onChange({ source: e.target.value as PersonalLoanPaymentFilters['source'] })}>
                <option value="all">All</option>
                <option value="manual">Manual</option>
                <option value="statement-import">Imported</option>
              </Select>
            </Field>
          </div>
          <div className="modal-footer-actions">
            <button type="button" className="btn secondary small" onClick={onClear}>Reset</button>
            <button type="button" className="btn small" onClick={() => setOpen(false)}>Done</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function NetPositionSummary({ selectedIds }: { selectedIds?: string[] } = {}) {
  const loans = usePersonalLoansWorkbookStore((s) => s.workbook.loans);
  const repayments = usePersonalLoansWorkbookStore((s) => s.workbook.repayments);
  const scopedLoans = selectedIds ? loans.filter((loan) => selectedIds.includes(loan.id)) : loans;
  const scopedRepayments = selectedIds ? repayments.filter((repayment) => selectedIds.includes(repayment.loanId)) : repayments;
  const net = netPositionByCurrency(scopedLoans, scopedRepayments);
  const pending = netPendingByCurrency(scopedLoans, scopedRepayments);
  const codes = Object.keys(net);
  if (!codes.length) return null;

  return (
    <div className="grid-auto" style={{ ...gridAutoStyle(150, 8), marginBottom: 16 }}>
      {codes.map((code) => {
        const realPending = pending[code] ?? 0;
        return (
          <div key={code} className="stat-card card" style={hueStyle(net[code] >= 0 ? 'var(--profit)' : 'var(--loss)')}>
            <div className="label">Net position ({code})</div>
            <MoneyValue n={net[code]} currency={code} />
            <div className="sub">{net[code] >= 0 ? 'Net owed to you' : 'Net you owe'}</div>
            {/* User-requested (2026-09-08): don't just exclude pending
               repayments from the headline figure — show it too. */}
            {realPending !== 0 && (
              <div className="sub">
                {realPending > 0 ? '+' : ''}{fmtMoney(realPending, code)} pending → {fmtMoney(net[code] + realPending, code)} incl. pending
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** README item 23 / MODULES_PLAN.md §11: per-module Analytics, second
 * module (after Cash). The two charts sketched there — outstanding-by-
 * person, and a repayment timeline; the "payoff planner" from that same
 * sketch lives inside `LoanDetail` below instead, since it needs one
 * specific loan's outstanding balance to project from. */
function AnalyticsTab({ filter, selectedIds, filters }: { filter: 'all' | 'owed_to_me' | 'i_owe'; selectedIds?: string[]; filters?: TransactionPageFilters }) {
  const loans = usePersonalLoansWorkbookStore((s) => s.workbook.loans);
  const repayments = usePersonalLoansWorkbookStore((s) => s.workbook.repayments);
  const plans = usePersonalLoansWorkbookStore((s) => s.workbook.plans ?? []);
  const categories = useCategoryStore((s) => s.workbook.categories);
  const candidates = useMemo(
    () => loans.filter((loan) => (!selectedIds || selectedIds.includes(loan.id)) && loan.isActive !== false && (filter === 'all' || loan.direction === filter)),
    [loans, selectedIds, filter],
  );
  if (!candidates.length) return <p className="text-muted">Add a matching loan first to see analytics.</p>;

  return (
    <div className="stack-lg">
      {candidates.map((selected) => {
        const scopedPayments = repayments.filter((payment) => payment.loanId === selected.id
          && (!filters?.fromDate || payment.date >= filters.fromDate)
          && (!filters?.toDate || payment.date <= filters.toDate)
          && (!filters || filters.source === 'all' || (payment.source ?? 'manual') === filters.source)
          && (!filters || filters.category === 'all' || categoryName(payment.categoryID, categories) === filters.category));
        const scopedPlans = plans.filter((plan) => plan.loanId === selected.id
          && (!filters?.fromDate || plan.date >= filters.fromDate)
          && (!filters?.toDate || plan.date <= filters.toDate)
          && (!filters || filters.category === 'all' || categoryName(plan.categoryID, categories) === filters.category));
        return <Card key={selected.id}><h3 className="mt-0">{selected.person} <span className="text-muted">({selected.currencyCode})</span></h3>
        <PersonalLoanAnalyticsSection
          loan={selected}
          payments={scopedPayments}
          plans={scopedPlans}
        />
        </Card>;
      })}
    </div>
  );
}

/** Floating "add a loan" button (user feedback 2026-08-27: adding an entity
 * isn't a routine task, use FABs — same pattern already established for
 * EMI/Banking/Cash/Bank Planning, README Done items 166/170).
 *
 * User-reported (2026-08-28, real audit after "you're ignoring what's
 * asked for"): Bank's and EMI's landing FABs shipped with Transfers
 * alongside "Add [entity]," but Personal Loans/Rentals/Funds only ever got
 * Transfers on a specific record's own detail view — contradicting the
 * original ask for one Transfers button reachable everywhere. Matches
 * Bank's/EMI's landing-FAB shape exactly now: Transfers with no `ref`
 * pre-filled, still choosable from `SideFields`' own dropdown inside the
 * modal. */
function AddLoanFab() {
  const [open, setOpen] = useState<'loan' | 'transfer' | null>(null);
  return (
    <>
      <FabPanel
        actions={[
          { label: 'Add a loan', icon: <PersonalLoanIcon />, onClick: () => setOpen('loan') },
          { label: 'Transfers', icon: <TransferIcon />, onClick: () => setOpen('transfer') },
        ]}
      />
      {open === 'loan' && (
        <Modal title="Add a loan" onClose={() => setOpen(null)}>
          <AddLoanForm onSaved={() => setOpen(null)} />
        </Modal>
      )}
      {open === 'transfer' && <TransactionEntryModal defaultFinance={{ module: 'personalLoans' }} onClose={() => setOpen(null)} />}
    </>
  );
}

/** One shared Add/Edit form for the Personal Loan entity, mirroring
 * Banking's shared Account/Bank forms so fields cannot drift between create
 * and edit. The model keeps the historical `principal` property for data
 * compatibility, but the UI calls it Amount — these are informal personal
 * loans, not an interest-bearing principal/interest contract. */
function LoanForm({
  loan,
  onSaved,
  initialCurrency,
}: {
  loan?: PersonalLoan;
  onSaved?: (id: string) => void;
  initialCurrency?: string;
}) {
  const addLoan = usePersonalLoansWorkbookStore((s) => s.addLoan);
  const updateLoan = usePersonalLoansWorkbookStore((s) => s.updateLoan);
  const primaryCurrency = usePrimaryCurrency();
  const workbookDefaultCurrency = usePersonalLoansWorkbookStore((s) => s.workbook.settings.defaultCurrency);
  const defaultCurrency = primaryCurrency ?? workbookDefaultCurrency;
  const [lastCurrency, setLastCurrency] = useLastCurrency('personalLoans', defaultCurrency);
  const ensureSignedIn = useEnsureSignedIn();
  const [draft, setDraft] = useState<PersonalLoan>(() => loan ? { ...loan } : emptyLoan(initialCurrency ?? lastCurrency));
  const currencyOptions = useEnabledCurrencies(draft.currencyCode);

  const submit = async () => {
    if (!draft.person.trim()) return toast('Enter a person name.');
    if (!draft.principal || draft.principal <= 0) return toast('Enter an amount.');
    if (!(await ensureSignedIn(loan ? 'Sign in to update this loan.' : 'Sign in to save this loan.'))) return;
    const normalized = { ...draft, person: draft.person.trim(), note: draft.note?.trim() || undefined };
    if (loan) {
      updateLoan(loan.id, normalized);
      toast('Loan updated.');
      onSaved?.(loan.id);
      return;
    }
    const id = crypto.randomUUID();
    addLoan({ ...normalized, id });
    toast(`Loan with ${normalized.person} saved.`);
    setDraft(emptyLoan(draft.currencyCode));
    onSaved?.(id);
  };

  return (
    <div>
      <div className="row gap-sm">
        <Field label="Person" width={180} required>
          <TextInput value={draft.person} onChange={(e) => setDraft({ ...draft, person: e.target.value })} placeholder="e.g. Bilal" />
        </Field>
        <Field label="Loan type" width={180}>
          <Select value={draft.direction} onChange={(e) => setDraft({ ...draft, direction: e.target.value as PersonalLoan['direction'] })}>
            <option value="owed_to_me">I lent money</option>
            <option value="i_owe">I borrowed money</option>
          </Select>
        </Field>
        <Field label="Currency" width={110} required>
          <Select
            value={draft.currencyCode}
            onChange={(e) => {
              setDraft({ ...draft, currencyCode: e.target.value });
              setLastCurrency(e.target.value);
            }}
          >
            {currencyOptions.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
          </Select>
        </Field>
        <Field label="Amount" width={130} required title="The original amount exchanged between you and this person.">
          <TextInput type="number" step="0.01" min={0} value={draft.principal || ''} onChange={(e) => setDraft({ ...draft, principal: Number(e.target.value) })} />
        </Field>
        <Field label="Card color (optional)" width={150}>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="color" value={draft.color || '#5aa9c9'} onChange={(e) => setDraft({ ...draft, color: e.target.value })} style={{ width: 44, height: 32, padding: 2, minWidth: 0 }} />
            {draft.color && <button type="button" className="btn secondary small" onClick={() => setDraft({ ...draft, color: undefined })}>Reset</button>}
          </div>
        </Field>
      </div>
      <div className="row gap-sm mt-sm">
        <Field label="Date">
          <TextInput type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </Field>
        <Field label="Note (optional)" width={280}>
          <TextInput value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </Field>
      </div>
      <div className="d-flex justify-center mt-md">
        <button className="btn" onClick={submit}><SaveIcon />{loan ? 'Save loan' : 'Add loan'}</button>
      </div>
    </div>
  );
}

/** Kept as the exported quick-add entry point used by the centralized
 * transfer picker. It delegates to the same form used for editing. */
export function AddLoanForm({ onSaved, initialCurrency }: { onSaved?: (id: string) => void; initialCurrency?: string } = {}) {
  return <LoanForm onSaved={onSaved} initialCurrency={initialCurrency} />;
}

function RepaymentsSection({
  loan,
  filters,
  onEditPayment,
  showActions,
}: {
  loan: PersonalLoan;
  filters: PersonalLoanPaymentFilters;
  onEditPayment: (payment: PersonalLoanRepayment) => void;
  showActions: boolean;
}) {
  // Select the raw array (a stable reference from the store) and filter it
  // in a memo — filtering *inside* the zustand selector would return a new
  // array identity on every render, which zustand's useSyncExternalStore
  // reads as "state changed", risking an infinite re-render loop.
  const allRepayments = usePersonalLoansWorkbookStore((s) => s.workbook.repayments);
  const categories = useCategoryStore((s) => s.workbook.categories);
  const repayments = useMemo(() => allRepayments.filter((r) => r.loanId === loan.id), [allRepayments, loan.id]);
  // Independent of the table's own sort order, same reasoning as
  // transferRunningBalance — "Remaining" must reflect the true
  // chronological running total regardless of how rows are displayed.
  const remaining = useMemo(() => repaymentRunningOutstanding(loan, allRepayments), [loan, allRepayments]);
  const updateRepayment = usePersonalLoansWorkbookStore((s) => s.updateRepayment);
  const deleteRepayment = usePersonalLoansWorkbookStore((s) => s.deleteRepayment);
  const links = useInterEntityTransfersStore((s) => s.workbook.entries);
  const ensureSignedIn = useEnsureSignedIn();
  const sideLabel = useLinkSideLabel();
  const [detailRow, setDetailRow] = useState<PersonalLoanRepayment | null>(null);

  const linkByRecordId = useMemo(() => {
    const map = new Map<string, (typeof links)[number]>();
    for (const l of links) {
      if (l.from.module === 'personalLoans') map.set(l.fromRecordId, l);
      if (l.to.module === 'personalLoans') map.set(l.toRecordId, l);
    }
    return map;
  }, [links]);

  const filteredRepayments = useMemo(
    () => repayments.filter((payment) => {
      if (filters.fromDate && payment.date < filters.fromDate) return false;
      if (filters.toDate && payment.date > filters.toDate) return false;
      if (filters.source !== 'all' && (payment.source ?? 'manual') !== filters.source) return false;
      if (filters.categoryID !== 'all' && payment.categoryID !== filters.categoryID) return false;
      return true;
    }),
    [repayments, filters],
  );

  // User-reported (2026-09-06): "we may stop sorting options for
  // chronologically important tables (only sequence-aware tables) to
  // avoid the disordered mess" — same reasoning as Bank's/Cash's own
  // statement tables (Done item 235): a repayment's "Remaining" column
  // only makes sense in real chronological+sequence order, so free column
  // sorting is gone here, replaced by `ReorderButtons` for the one thing
  // that genuinely needs fixing (two same-instant repayments in the wrong
  // relative order).
  const instantOf = (r: PersonalLoanRepayment) => dateOnlyMs(r.date);
  const sorted = useMemo(
    () => [...filteredRepayments].sort((a, b) => instantOf(b) - instantOf(a) || (b.seq ?? 0) - (a.seq ?? 0)),
    [filteredRepayments],
  );
  const reorder = async (pair: [{ id: string; order: number }, { id: string; order: number }]) => {
    if (!(await ensureSignedIn('Sign in to reorder payments.'))) return;
    for (const p of pair) updateRepayment(p.id, { seq: p.order });
  };

  return (
    <div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th><th>Remaining</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {sorted.map((r, i) => {
                const link = linkByRecordId.get(r.id);
                const otherSide = link ? (link.from.module === 'personalLoans' && link.fromRecordId === r.id ? link.to : link.from) : undefined;
                return (
                  <tr key={r.id} onClick={() => setDetailRow(r)} className="clickable">
                    <td>
                      {r.date}{' '}
                      {showActions && <span onClick={(e) => e.stopPropagation()}>
                        <ReorderButtons
                          rows={sorted}
                          index={i}
                          instantOf={instantOf}
                          idOf={(row) => row.id}
                          orderOf={(row) => row.seq}
                          onMove={reorder}
                        />
                      </span>}
                    </td>
                    <td>{r.description || '—'}</td>
                    <td>
                      {fmtMoney(r.amount, loan.currencyCode)}
                      {r.isPending && (
                        <Tooltip text="Not yet cleared — excluded from Outstanding above until marked cleared.">
                          <span className="pill-warn ml-6">Pending</span>
                        </Tooltip>
                      )}
                      {link && (
                        <Link to={linkTargetPath(otherSide!)} className="pill-info ml-6" title="Linked — go to the other side" onClick={(e) => e.stopPropagation()}>
                          🔗 {sideLabel(link.from)} → {sideLabel(link.to)}
                        </Link>
                      )}
                    </td>
                    <td>{categoryName(r.categoryID, categories)}</td>
                    <td>
                      <Tooltip text="Loan balance still remaining after this payment, in date order.">
                        <span>{fmtMoney(remaining.get(r.id) ?? 0, loan.currencyCode)}</span>
                      </Tooltip>
                    </td>
                    <td className="text-muted cell-clip" title={r.source === 'statement-import' ? `Import${r.statementRef ? ` (${r.statementRef})` : ''}` : 'Manual'}>
                      {r.source === 'statement-import' ? `Import${r.statementRef ? ` (${r.statementRef})` : ''}` : 'Manual'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {showActions && r.isPending && (
                        <IconButton
                          label="Mark cleared"
                          icon={<CheckIcon size={13} />}
                          align="right"
                          onClick={async () => {
                            if (!(await ensureSignedIn('Sign in to update this payment.'))) return;
                            updateRepayment(r.id, { isPending: false });
                            toast('Marked cleared.');
                          }}
                        />
                      )}{showActions && <> {' '}
                      <IconButton label="Edit" icon={<EditIcon size={13} />} align="right" onClick={() => onEditPayment(r)} />{' '}
                      <IconButton
                        label="Delete"
                        icon={<TrashIcon size={13} />}
                        align="right"
                        onClick={() => confirmAndDeleteLinkable('personalLoans', r.id, () => deleteRepayment(r.id))}
                      /></>}
                    </td>
                  </tr>
                );
              })}
              {!sorted.length && (
                <tr>
                  <td colSpan={7} className="text-muted">
                    {repayments.length ? 'No payments match this filter.' : 'No payments logged yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      {detailRow && (
        <RecordDetailModal
          title="Payment"
          onClose={() => setDetailRow(null)}
          fields={[
            { label: 'Date', value: detailRow.date },
            { label: 'Time', value: detailRow.time ?? '— (defaults to noon)' },
            { label: 'Timezone', value: detailRow.timezone ?? '—' },
            { label: 'Description', value: detailRow.description ?? '—' },
            { label: 'Amount', value: fmtMoney(detailRow.amount, loan.currencyCode) },
            { label: 'Category', value: categoryName(detailRow.categoryID, categories) },
            { label: 'Remaining after this payment', value: fmtMoney(remaining.get(detailRow.id) ?? 0, loan.currencyCode) },
            { label: 'Source', value: detailRow.source === 'statement-import' ? `Import${detailRow.statementRef ? ` (${detailRow.statementRef})` : ''}` : 'Manual' },
            { label: 'Status', value: detailRow.isPending ? 'Pending (not yet cleared)' : 'Cleared' },
            ...(linkByRecordId.get(detailRow.id)
              ? (() => {
                  const l = linkByRecordId.get(detailRow.id)!;
                  return [{ label: 'Linked', value: `${sideLabel(l.from)} → ${sideLabel(l.to)}` }];
                })()
              : []),
          ]}
        />
      )}
    </div>
  );
}

/** README item 25 / MODULES_PLAN.md §13: same browser-only "map these
 * columns" CSV import pattern as Banking/Cash/Rentals. Unlike those
 * modules, a repayment's amount has no direction to derive from a sign —
 * it's always a positive amount against the loan — so there's no
 * "Flip sign" checkbox here, just Date + Amount (absolute value). */
function ImportRepaymentsSection({ loan, onClose }: { loan: PersonalLoan; onClose: () => void }) {
  const addRepayments = usePersonalLoansWorkbookStore((s) => s.addRepayments);
  const ensureSignedIn = useEnsureSignedIn();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [dateCol, setDateCol] = useState('');
  const [amountCol, setAmountCol] = useState('');

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCSV(String(reader.result));
      if (parsed.length < 2) {
        toast('Could not find any data rows in that file.');
        return;
      }
      const [head, ...body] = parsed;
      setFileName(file.name);
      setHeaders(head);
      setRows(body);
      setDateCol(head[0] ?? '');
      setAmountCol(head[1] ?? '');
    };
    reader.readAsText(file);
  };

  const colIndex = (col: string) => headers.indexOf(col);
  const mapRow = (r: string[]) => ({
    date: (r[colIndex(dateCol)] ?? '').trim(),
    amount: Math.abs(Number(r[colIndex(amountCol)] ?? 0)),
  });
  const mappedPreview = rows.slice(0, 5).map(mapRow);

  const doImport = async () => {
    if (!dateCol || !amountCol) return toast('Map both the date and amount columns.');
    if (!(await ensureSignedIn('Sign in to import payments.'))) return;
    const imported: PersonalLoanRepayment[] = rows
      .map(mapRow)
      .filter((r) => r.date && !Number.isNaN(r.amount) && r.amount !== 0)
      .map((r) => ({
        id: crypto.randomUUID(),
        loanId: loan.id,
        date: r.date,
        amount: r.amount,
        categoryID: loanCategoryForDirection(loan.direction),
        source: 'statement-import' as const,
        statementRef: fileName,
      }));
    if (!imported.length) return toast('No valid rows to import after mapping — check your column choices.');
    addRepayments(imported);
    toast(`Imported ${imported.length} payment${imported.length === 1 ? '' : 's'} from ${fileName}.`);
    setHeaders([]);
    setRows([]);
    setFileName('');
    onClose();
  };

  return (
    <Modal title="Import payments (CSV)" onClose={onClose} widthClass="50">
      <p className="text-muted mb-12">
        Import a CSV export of payments against this loan. This is a simple "map these columns" tool —
        pick which column is which below; every payment is recorded as a positive amount regardless of
        the loan's direction. Date values must be in YYYY-MM-DD format (e.g. 2026-01-15) — other date
        formats will sort incorrectly once imported.
      </p>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <button className="btn secondary small" onClick={() => fileInput.current?.click()}>Choose CSV file</button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
        {fileName && <span className="text-muted">{fileName} ({rows.length} rows)</span>}
      </div>

      {headers.length > 0 && (
        <div className="mt-12">
          <div className="row gap-sm">
            <Field label="Date column" width={160}>
              <Select value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </Field>
            <Field label="Amount column" width={160}>
              <Select value={amountCol} onChange={(e) => setAmountCol(e.target.value)}>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </Field>
          </div>
          <div className="table-scroll mt-sm">
            <table>
              <thead><tr><th>Date</th><th>Amount</th></tr></thead>
              <tbody>
                {mappedPreview.map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{fmtMoney(r.amount, loan.currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn secondary mt-12" onClick={doImport}>
            <PlusIcon />Import {rows.length} payment{rows.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </Modal>
  );
}

/** The "payoff planner" from MODULES_PLAN.md §11's Personal Loans sketch —
 * unlike EMI/Loans there's no interest/schedule concept for an informal
 * debt, so this is just "how many months at this repayment rate clears
 * what's left," recomputed live as the user types (nothing is saved). */
/** README item 99 (2026-08-26 feedback): no chart at all on a loan's own
 * detail page — the landing-page Analytics tab's charts (Done item 45)
 * are all scoped across every loan, not this one. A single balance-over-
 * time line is enough to show progress at a glance without duplicating
 * the full repayments table right below it. */
function PayoffPlanner({ loan, outstanding }: { loan: PersonalLoan; outstanding: number }) {
  const [monthly, setMonthly] = useState(0);
  const projection = monthly > 0 ? projectPayoff(outstanding, monthly, today()) : null;

  if (outstanding <= 0) return null;

  return (
    <Card className="mb-md">
      <h4 className="mt-0">Payoff planner</h4>
      <p className="text-muted mt-0">
        A quick "what if" — see how many months it'd take to clear the remaining {fmtMoney(outstanding, loan.currencyCode)}
        {' '}at a payment rate you pick. Not saved anywhere, just a live estimate.
      </p>
      <Field label={`Planned monthly payment (${loan.currencyCode})`} width={200}>
        <TextInput type="number" step="0.01" value={monthly || ''} onChange={(e) => setMonthly(Number(e.target.value))} />
      </Field>
      {monthly > 0 && (
        projection ? (
          <p style={{ marginBottom: 0 }}>
            At {fmtMoney(monthly, loan.currencyCode)}/month, this loan would be paid off in{' '}
            <strong>{projection.months} month{projection.months === 1 ? '' : 's'}</strong>, around <strong>{projection.payoffDate}</strong>.
          </p>
        ) : (
          <p className="text-muted" style={{ marginBottom: 0 }}>Enter a positive monthly amount to project a payoff date.</p>
        )
      )}
    </Card>
  );
}


function PersonalLoanPlanForm({ loan, onSaved }: { loan: PersonalLoan; onSaved?: () => void }) {
  const addPlan = usePersonalLoansWorkbookStore((s) => s.addPlan);
  const ensureSignedIn = useEnsureSignedIn();
  const [draft, setDraft] = useState<Omit<PersonalLoanPlan, 'id' | 'loanId'>>({
    date: today(),
    amount: 0,
    description: 'Planned payment',
    categoryID: loanCategoryForDirection(loan.direction),
    executed: false,
  });

  const submit = async () => {
    if (!(draft.amount > 0)) return toast('Enter a planned payment amount.');
    if (!(await ensureSignedIn('Sign in to save this plan.'))) return;
    addPlan({ id: crypto.randomUUID(), loanId: loan.id, ...draft });
    toast('Plan added.');
    onSaved?.();
  };

  return (
    <div>
      <div className="row gap-sm">
        <Field label="Amount" required><TextInput type="number" step="0.01" min={0} value={draft.amount || ''} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} /></Field>
        <Field label="Description"><TextInput value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
        <Field label="Category"><CategorySelect value={draft.categoryID ?? loanCategoryForDirection(loan.direction)} onChange={(categoryID) => setDraft({ ...draft, categoryID })} /></Field>
      </div>
      <div className="row gap-sm mt-sm">
        <Field label="Date"><TextInput type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
      </div>
      <div className="d-flex justify-center mt-md">
        <button className="btn" onClick={submit}><SaveIcon />Add plan</button>
      </div>
    </div>
  );
}

function PersonalLoanPlansSection({ loan, showActions }: { loan: PersonalLoan; showActions: boolean }) {
  const plans = usePersonalLoansWorkbookStore((s) => s.workbook.plans ?? []);
  const addRepayment = usePersonalLoansWorkbookStore((s) => s.addRepayment);
  const updatePlan = usePersonalLoansWorkbookStore((s) => s.updatePlan);
  const deletePlan = usePersonalLoansWorkbookStore((s) => s.deletePlan);
  const ensureSignedIn = useEnsureSignedIn();
  const categories = useCategoryStore((s) => s.workbook.categories);
  const rows = useMemo(
    () => plans.filter((plan) => plan.loanId === loan.id).sort((a, b) => a.date.localeCompare(b.date)),
    [plans, loan.id],
  );

  const execute = async (plan: PersonalLoanPlan) => {
    if (plan.executed) return;
    if (!(await ensureSignedIn('Sign in to execute this plan.'))) return;
    addRepayment({
      id: crypto.randomUUID(),
      loanId: loan.id,
      date: plan.date,
      amount: plan.amount,
      description: plan.description ?? 'Planned payment',
      categoryID: plan.categoryID ?? loanCategoryForDirection(loan.direction),
      source: 'manual',
    });
    updatePlan(plan.id, { executed: true });
    toast('Plan executed and payment logged.');
  };

  return (
    <div>
      <div className="table-responsive">
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((plan) => (
              <tr key={plan.id}>
                <td>{plan.date}</td>
                <td>{plan.description || '—'}</td>
                <td>{categoryName(plan.categoryID, categories)}</td>
                <td>{fmtMoney(plan.amount, loan.currencyCode)}</td>
                <td>{plan.executed ? 'Executed' : 'Planned'}</td>
                <td>
                  {showActions && <>
                    {!plan.executed && <IconButton label="Execute" icon={<CheckIcon size={13} />} align="right" onClick={() => { void execute(plan); }} />}{' '}
                    <IconButton label="Delete" icon={<TrashIcon size={13} />} align="right" onClick={() => deletePlan(plan.id)} />
                  </>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="text-muted">No plans for this loan yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PersonalLoanAnalyticsSection({
  loan,
  payments,
  plans,
  fromDate,
  toDate,
}: {
  loan: PersonalLoan;
  payments: PersonalLoanRepayment[];
  plans: PersonalLoanPlan[];
  fromDate?: string;
  toDate?: string;
}) {
  const categories = useCategoryStore((s) => s.workbook.categories);
  const dateFormat = useAppearanceStore((s) => s.appearance.dateFormat ?? 'DD-MMM-YYYY');
  useAppearanceStore((s) => s.appearance);
  applyChartTheme();

  const inPeriod = (date: string) => (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  const priorCleared = payments
    .filter((payment) => !payment.isPending && !!fromDate && payment.date < fromDate)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const startingBalance = Math.max(0, loan.principal - priorCleared);
  const cleared = [...payments].filter((payment) => !payment.isPending && inPeriod(payment.date)).sort((a, b) => a.date.localeCompare(b.date) || (a.seq ?? 0) - (b.seq ?? 0));
  const pending = payments.filter((payment) => payment.isPending && inPeriod(payment.date));
  const activePlans = plans.filter((plan) => !plan.executed && inPeriod(plan.date));

  let balance = startingBalance;
  const ledger = cleared.map((payment) => {
    balance = Math.max(0, balance - payment.amount);
    return { payment, balance };
  });
  const categoryTotals = Object.entries(cleared.reduce<Record<string, number>>((out, payment) => {
    const name = categoryName(payment.categoryID, categories);
    out[name] = (out[name] ?? 0) + payment.amount;
    return out;
  }, {})).sort((a, b) => b[1] - a[1]);

  const dates = [...new Set([...cleared.map((p) => p.date), ...pending.map((p) => p.date), ...activePlans.map((p) => p.date)])].sort();
  const labels = ['Opening', ...dates.map((date) => formatDate(date, dateFormat)), 'Closing'];
  const actualByDate = dates.map((date) => ledger.filter((row) => row.payment.date <= date).at(-1)?.balance ?? startingBalance);
  const pendingByDate = dates.map((date) => pending.filter((p) => p.date === date).reduce((sum, p) => sum + p.amount, 0));
  const plannedByDate = dates.map((date) => activePlans.filter((p) => p.date === date).reduce((sum, p) => sum + p.amount, 0));
  let expected = startingBalance;
  const expectedByDate = dates.map((date) => {
    const actualPaid = cleared.filter((p) => p.date === date).reduce((sum, p) => sum + p.amount, 0);
    const pendingPaid = pending.filter((p) => p.date === date).reduce((sum, p) => sum + p.amount, 0);
    const plannedPaid = activePlans.filter((p) => p.date === date).reduce((sum, p) => sum + p.amount, 0);
    expected = Math.max(0, expected - actualPaid - pendingPaid - plannedPaid);
    return expected;
  });
  const actualChartData = [startingBalance, ...actualByDate, actualByDate.at(-1) ?? startingBalance];
  const pendingChartData = [0, ...pendingByDate.map((amount) => -amount), 0];
  const plannedChartData = [0, ...plannedByDate.map((amount) => -amount), 0];
  const expectedChartData = [startingBalance, ...expectedByDate, expectedByDate.at(-1) ?? startingBalance];

  const months = [...new Set([...cleared.map((p) => p.date.slice(0, 7)), ...pending.map((p) => p.date.slice(0, 7)), ...activePlans.map((p) => p.date.slice(0, 7))])].sort();
  const deposits = months.map((month) => loan.direction === 'owed_to_me' ? cleared.filter((p) => p.date.startsWith(month)).reduce((sum, p) => sum + p.amount, 0) : 0);
  const withdrawals = months.map((month) => loan.direction === 'i_owe' ? cleared.filter((p) => p.date.startsWith(month)).reduce((sum, p) => sum + p.amount, 0) : 0);
  const monthlyActualBalance = months.map((month) => ledger.filter((row) => row.payment.date.slice(0, 7) <= month).at(-1)?.balance ?? startingBalance);
  const monthlyExpectedAdjustment = months.map((month) => -(
    pending.filter((p) => p.date.startsWith(month)).reduce((sum, p) => sum + p.amount, 0)
    + activePlans.filter((p) => p.date.startsWith(month)).reduce((sum, p) => sum + p.amount, 0)
  ));

  const periodEndActual = ledger.at(-1)?.balance ?? loan.principal;
  const periodEndPending = pending.reduce((sum, payment) => sum + payment.amount, 0);
  const periodEndPlanned = activePlans.reduce((sum, plan) => sum + plan.amount, 0);
  const periodEndExpected = Math.max(0, periodEndActual - periodEndPending - periodEndPlanned);

  if (!cleared.length && !pending.length && !activePlans.length) return <p className="text-muted m-0">No payments or plans match the page filters.</p>;

  const profit = cssVar('--profit') || '#3ecf8e';
  const loss = cssVar('--loss') || '#e5484d';
  const gridColor = chartAlpha(cssVar('--border') || '#94a3b8', .28);
  const axisOptions = { grid: { color: gridColor }, ticks: { color: cssVar('--muted') || '#94a3b8', autoSkip: true, maxTicksLimit: 6, maxRotation: 0 } };
  const balanceAxis = { ...axisOptions, beginAtZero: true };

  return <div className="analytics-grid">
    <AnalyticsChartEnhancer />
    <div className="analytics-chart chart-height-lg"><Tooltip text="Outstanding loan amount after each cleared payment, using the same chart layout as Bank Account."><h4 className="clickable">Balance over time</h4></Tooltip><div className="chart-canvas-wrap"><Line plugins={[chartDepthPlugin]} data={({labels:['Opening', ...ledger.map((row)=>formatDate(row.payment.date,dateFormat)), 'Closing'],datasets:[{type:'bar' as never,label:'Balance columns',data:[startingBalance,...ledger.map((row)=>row.balance),periodEndActual],backgroundColor:chartAlpha('#38bdf8',.18),borderColor:chartAlpha('#38bdf8',.5),borderWidth:1,borderRadius:4},{label:'Balance by transaction',data:[loan.principal,...ledger.map((row)=>row.balance),periodEndActual],borderColor:chartAlpha('#38bdf8',.9),backgroundColor:chartAlpha('#38bdf8',.2),fill:true,tension:.24,pointRadius:0,pointHoverRadius:4},{label:'Start → end balance',data:[startingBalance,...ledger.map(()=>null),periodEndActual],borderColor:chartAlpha('#a78bfa',.95),backgroundColor:'transparent',borderDash:[6,4],borderWidth:2,pointRadius:3,pointHoverRadius:5,spanGaps:true}]} as any)} options={{responsive:true,maintainAspectRatio:false,scales:{x:axisOptions,y:balanceAxis},interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{filter:(item)=>item.datasetIndex!==0}},tooltip:{enabled:true,filter:(item)=>item.datasetIndex!==0},datalabels:{display:false}}}} /></div></div>
    <div className="analytics-chart chart-height-lg"><Tooltip text="Payments by month, with actual outstanding and pending/planned expected change."><h4 className="clickable">Net Flows Over Time</h4></Tooltip><div className="chart-canvas-wrap"><Bar plugins={[chartDepthPlugin]} data={({labels:months,datasets:[{label:'Deposits',data:deposits,backgroundColor:chartAlpha(profit,.72),borderColor:chartAlpha(profit,.95),borderWidth:2,borderRadius:6},{label:'Withdrawals',data:withdrawals,backgroundColor:chartAlpha(loss,.72),borderColor:chartAlpha(loss,.95),borderWidth:2,borderRadius:6},{label:'Actual balance',data:monthlyActualBalance,backgroundColor:chartAlpha('#38bdf8',.42),borderColor:chartAlpha('#38bdf8',.85),borderWidth:1,borderRadius:4,stack:'balance'},{label:'Expected balance',data:monthlyExpectedAdjustment,backgroundColor:chartAlpha('#a78bfa',.5),borderColor:chartAlpha('#a78bfa',.9),borderWidth:1,borderRadius:4,stack:'balance'},{type:'line' as never,label:'Actual balance',data:monthlyActualBalance,borderColor:chartAlpha('#38bdf8',.95),backgroundColor:'transparent',borderWidth:2,pointRadius:3,tension:.2}]} as any)} options={{interaction:{mode:'index',intersect:false},scales:{x:{...axisOptions,stacked:true},y:axisOptions},plugins:{legend:{labels:{filter:(item)=>item.datasetIndex!==2}},tooltip:{filter:(item)=>item.datasetIndex!==2},datalabels:dlBarV((v)=>fmtMoney(v,loan.currencyCode))}}} /></div></div>
    <div className="analytics-chart"><Tooltip text="Total payment amount grouped by category."><h4 className="clickable">Transactions by category</h4></Tooltip><div className="chart-canvas-wrap"><Doughnut plugins={[chartDepthPlugin]} data={({labels:categoryTotals.map(([name])=>name),datasets:[{label:'Payments',data:categoryTotals.map(([,amount])=>amount),backgroundColor:categoryTotals.map(([name])=>chartAlpha(tickerColor(name),.72)),borderColor:categoryTotals.map(([name])=>chartAlpha(tickerColor(name),.95)),borderWidth:2,hoverOffset:8}]} as any)} options={{responsive:true,maintainAspectRatio:false,cutout:'48%',rotation:-25,plugins:{legend:{display:true,position:'right',labels:{boxWidth:10,padding:8}},datalabels:dlDoughnut((v)=>fmtMoney(v,loan.currencyCode))},layout:{padding:8}}} /></div></div>
    <div className="analytics-chart"><Tooltip text="Opening outstanding, actual payments, pending payments, plans, and expected outstanding."><h4 className="clickable">Actual vs Expected Balance (Pending &amp; Planned)</h4></Tooltip><div className="chart-canvas-wrap"><Bar plugins={[chartDepthPlugin]} data={({labels,datasets:[{type:'bar' as never,label:'Actual balance',data:actualChartData,backgroundColor:chartAlpha('#38bdf8',.42),borderColor:chartAlpha('#38bdf8',.85),borderWidth:2,borderRadius:6,stack:'balance'},{type:'line' as never,label:'Actual balance',data:actualChartData,borderColor:chartAlpha('#38bdf8',.95),backgroundColor:'transparent',borderWidth:2,pointRadius:0,tension:.2},{type:'line' as never,label:'Pending balance',data:pendingChartData,borderColor:chartAlpha('#f59e0b',.95),backgroundColor:'transparent',borderWidth:2,borderDash:[5,4],pointRadius:0},{type:'line' as never,label:'Planned balance',data:plannedChartData,borderColor:chartAlpha('#22c55e',.95),backgroundColor:'transparent',borderWidth:2,borderDash:[8,3],pointRadius:0},{type:'line' as never,label:'Expected balance',data:expectedChartData,borderColor:chartAlpha('#a78bfa',.95),backgroundColor:'transparent',borderWidth:2,borderDash:[2,3],pointRadius:0}]} as any)} options={{interaction:{mode:'index',intersect:false},scales:{x:{...axisOptions,stacked:true},y:balanceAxis},plugins:{legend:{display:true,labels:{filter:(item)=>item.datasetIndex!==0}},tooltip:{filter:(item)=>item.datasetIndex!==0},datalabels:{display:false}}}} /></div></div>
    <div className="analytics-chart"><Tooltip text="Actual, pending, planned, and combined expected outstanding at period end."><h4 className="clickable">Period-end balance summary</h4></Tooltip><div className="chart-canvas-wrap"><Doughnut plugins={[chartDepthPlugin]} data={({labels:['Actual','Pending','Planned','Expected'],datasets:[{label:'Period end',data:[Math.abs(periodEndActual),Math.abs(periodEndPending),Math.abs(periodEndPlanned),Math.abs(periodEndExpected)],backgroundColor:['#38bdf8','#f59e0b','#22c55e','#a78bfa'].map((color)=>chartAlpha(color,.72)),borderColor:['#38bdf8','#f59e0b','#22c55e','#a78bfa'],borderWidth:2,hoverOffset:8}]} as any)} options={{responsive:true,maintainAspectRatio:false,cutout:'48%',plugins:{legend:{display:true,position:'right'},tooltip:{callbacks:{label:(item)=>`${item.label}: ${fmtMoney([periodEndActual,periodEndPending,periodEndPlanned,periodEndExpected][item.dataIndex],loan.currencyCode)}`}},datalabels:dlDoughnut((v)=>fmtMoney(v,loan.currencyCode))}}} /></div></div>
  </div>;
}

function LoanDetail({ loan, onBack }: { loan: PersonalLoan; onBack: () => void; startInEditMode?: boolean }) {
  const repayments = usePersonalLoansWorkbookStore((s) => s.workbook.repayments);
  const plans = usePersonalLoansWorkbookStore((s) => s.workbook.plans ?? []);
  const deleteLoan = usePersonalLoansWorkbookStore((s) => s.deleteLoan);
  const updateLoan = usePersonalLoansWorkbookStore((s) => s.updateLoan);
  const ensureSignedIn = useEnsureSignedIn();
  const outstanding = loanOutstanding(loan, repayments);
  const [editLoanOpen, setEditLoanOpen] = useState(false);
  const [batchEditor, setBatchEditor] = useState<'payments' | 'plans' | null>(null);
  const [editPayment, setEditPayment] = useState<PersonalLoanRepayment | null>(null);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [showPlanActions, setShowPlanActions] = useState(false);
  const [showPaymentActions, setShowPaymentActions] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [paymentFilters, setPaymentFilters] = useState<PersonalLoanPaymentFilters>({
    fromDate: '',
    toDate: '',
    source: 'all',
    categoryID: 'all',
  });
  const categories = useCategoryStore((s) => s.workbook.categories);
  const filteredPayments = useMemo(
    () => repayments.filter((payment) => {
      if (payment.loanId !== loan.id) return false;
      if (paymentFilters.fromDate && payment.date < paymentFilters.fromDate) return false;
      if (paymentFilters.toDate && payment.date > paymentFilters.toDate) return false;
      if (paymentFilters.source !== 'all' && (payment.source ?? 'manual') !== paymentFilters.source) return false;
      if (paymentFilters.categoryID !== 'all' && payment.categoryID !== paymentFilters.categoryID) return false;
      return true;
    }),
    [repayments, paymentFilters],
  );
  const filteredPlans = useMemo(
    () => plans.filter((plan) =>
      plan.loanId === loan.id
      && !plan.executed
      && (!paymentFilters.fromDate || plan.date >= paymentFilters.fromDate)
      && (!paymentFilters.toDate || plan.date <= paymentFilters.toDate),
    ),
    [plans, loan.id, paymentFilters.fromDate, paymentFilters.toDate],
  );
  const actualPaid = filteredPayments.filter((payment) => !payment.isPending).reduce((sum, payment) => sum + payment.amount, 0);
  const pendingPaid = filteredPayments.filter((payment) => payment.isPending).reduce((sum, payment) => sum + payment.amount, 0);
  const plannedPaid = filteredPlans.reduce((sum, plan) => sum + plan.amount, 0);


  const toggleArchived = async () => {
    if (!(await ensureSignedIn(loan.isActive === false ? 'Sign in to reopen this loan.' : 'Sign in to close this loan.'))) return;
    updateLoan(loan.id, { isActive: loan.isActive === false ? true : false });
    toast(loan.isActive === false ? 'Loan reopened.' : 'Loan closed.');
  };

  const remove = async () => {
    if (!(await confirmDialog('This deletes the loan and all its logged payments.', `Delete loan with ${loan.person}?`))) return;
    if (!(await ensureSignedIn('Sign in to delete this loan.'))) return;
    deleteLoan(loan.id);
    onBack();
  };

  const paymentFilterBar = useMemo(() => (
    <>
      <PersonalLoanPaymentFilterMenu
        value={paymentFilters}
        categories={categories}
        onChange={(patch) => setPaymentFilters((current) => ({ ...current, ...patch }))}
        onClear={() => setPaymentFilters({ fromDate: '', toDate: '', source: 'all', categoryID: 'all' })}
      />
    </>
  ), [paymentFilters, categories]);

  const exportPayments = () => {
    const remaining = repaymentRunningOutstanding(loan, repayments);
    const header = ['Date', 'Description', 'Amount', 'Category', 'Remaining', 'Source'];
    const body = [...filteredPayments]
      .sort((a, b) => a.date.localeCompare(b.date) || (a.seq ?? 0) - (b.seq ?? 0))
      .map((payment) => [
        payment.date,
        payment.description ?? '',
        payment.amount,
        categoryName(payment.categoryID, categories),
        remaining.get(payment.id) ?? 0,
        payment.source === 'statement-import' ? `Import${payment.statementRef ? ` (${payment.statementRef})` : ''}` : 'Manual',
      ]);
    const blob = new Blob([toCSV([header, ...body])], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${loan.person.replace(/\s+/g, '_')}_payments.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast('Payments exported.');
  };

  const summaryActions: StandardCardAction[] = [
    { label: 'Edit loan', icon: <EditIcon size={14} />, onClick: () => setEditLoanOpen(true) },
    {
      label: loan.isActive === false ? 'Reopen loan' : 'Close loan',
      icon: loan.isActive === false ? <RestoreIcon size={14} /> : <ArchiveIcon size={14} />,
      onClick: () => { void toggleArchived(); },
    },
    {
      label: loan.isFavorite ? 'Unfavorite' : 'Favorite',
      icon: <StarIcon size={14} filled={loan.isFavorite} />,
      onClick: () => { void updateLoan(loan.id, { isFavorite: !loan.isFavorite }); },
    },
    { label: 'Delete loan', icon: <TrashIcon size={14} />, tone: 'danger', onClick: () => { void remove(); } },
  ];

  const sections: StandardPageSection[] = [
    {
      key: 'summary',
      label: 'Account summary',
      hue: loan.color,
      defaultOpen: true,
      actions: summaryActions,
      summary: <SummaryChip label="Outstanding" value={fmtMoney(outstanding, loan.currencyCode)} />,
      content: <BalanceSummaryCards currency={loan.currencyCode} summary={{
        start: Math.max(0, loan.principal - repayments.filter(payment => payment.loanId === loan.id && !payment.isPending && paymentFilters.fromDate && payment.date < paymentFilters.fromDate).reduce((total, payment) => total + payment.amount, 0)),
        current: Math.max(0, loan.principal - repayments.filter(payment => payment.loanId === loan.id && !payment.isPending && (!paymentFilters.toDate || payment.date <= paymentFilters.toDate)).reduce((total, payment) => total + payment.amount, 0)),
        inflow: 0, outflow: -actualPaid, pendingInflow: 0, pendingOutflow: -pendingPaid, plannedInflow: 0, plannedOutflow: -plannedPaid,
      }} />,
    },
    {
      key: 'details',
      label: 'Loan details',
      hue: loan.color,
      content: (
        <AttributeList items={[
          { label: 'Person', value: loan.person },
          { label: 'Loan type', value: loan.direction === 'owed_to_me' ? 'I lent money' : 'I borrowed money' },
          { label: 'Currency', value: loan.currencyCode },
          { label: 'Amount', value: fmtMoney(loan.principal, loan.currencyCode) },
          { label: 'Date', value: loan.date },
          { label: 'Note', value: loan.note },
          { label: 'Status', value: loan.isActive === false ? 'Closed' : 'Active' },
          { label: 'Favorite', value: loan.isFavorite ? 'Yes' : 'No' },
        ]} />
      ),
    },
    {
      key: 'plans',
      label: 'Plans',
      hue: loan.color,
      actions: [
        { label: 'Add a plan', onClick: () => setAddPlanOpen(true) },
        { label: 'Batch edit', onClick: () => setBatchEditor('plans') },
        { label: showPlanActions ? 'Done modifying' : 'Modify', icon: <EditIcon size={14} />, onClick: () => setShowPlanActions((value) => !value) },
      ],
      headerEnd: showPlanActions ? <IconButton label="Hide modification options" icon={<XIcon size={13} />} align="right" onClick={() => setShowPlanActions(false)} /> : undefined,
      content: <PersonalLoanPlansSection loan={loan} showActions={showPlanActions} />,
    },
    {
      key: 'payments',
      label: 'Payments',
      hue: loan.color,
      defaultOpen: true,
      summary: <SummaryChip label="Filtered" value={filteredPayments.length} />,
      actions: [
        { label: 'Import payments', onClick: () => setImportOpen(true) },
        { label: 'Export filtered payments', disabled: !filteredPayments.length, onClick: exportPayments },
        { label: 'Batch edit', disabled: !filteredPayments.length, onClick: () => setBatchEditor('payments') },
        { label: showPaymentActions ? 'Done modifying' : 'Modify', icon: <EditIcon size={14} />, onClick: () => setShowPaymentActions((value) => !value) },
      ],
      headerEnd: showPaymentActions ? <IconButton label="Hide modification options" icon={<XIcon size={13} />} align="right" onClick={() => setShowPaymentActions(false)} /> : undefined,
      content: <RepaymentsSection loan={loan} filters={paymentFilters} onEditPayment={setEditPayment} showActions={showPaymentActions} />,
    },
    {
      key: 'analytics',
      label: 'Analytics',
      hue: loan.color,
      content: (
        <div>
          <PersonalLoanAnalyticsSection
            loan={loan}
            payments={repayments.filter((payment) => payment.loanId === loan.id)}
            plans={plans.filter((plan) => plan.loanId === loan.id)}
            fromDate={paymentFilters.fromDate}
            toDate={paymentFilters.toDate}
          />
          <PayoffPlanner loan={loan} outstanding={outstanding} />
        </div>
      ),
    },
  ];

  return (
    <ModuleDetailTemplate
      backLabel="All personal loans"
      onBack={onBack}
      title={loan.person}
      hue={loan.color}
      topBarRight={paymentFilterBar}
      sections={sections}
      defaultKey="summary"
    >
      {batchEditor === 'payments' && <LoanPaymentsBatchEditor key={loan.id} loan={loan} rows={[...filteredPayments].sort((a, b) => b.date.localeCompare(a.date) || (b.seq ?? 0) - (a.seq ?? 0))} onClose={() => setBatchEditor(null)} />}
      {batchEditor === 'plans' && <LoanPlansBatchEditor key={loan.id} loan={loan} rows={plans.filter(plan => plan.loanId === loan.id).sort((a, b) => a.date.localeCompare(b.date))} onClose={() => setBatchEditor(null)} />}
      <FabPanel actions={[
        { label: 'Add payment', icon: <TransferIcon />, onClick: () => setAddPaymentOpen(true) },
        { label: 'Add a plan', icon: <PlusIcon />, onClick: () => setAddPlanOpen(true) },
      ]} />
      {editLoanOpen && (
        <Modal title="Edit loan" onClose={() => setEditLoanOpen(false)}>
          <LoanForm loan={loan} onSaved={() => setEditLoanOpen(false)} />
        </Modal>
      )}
      {addPaymentOpen && (
        <TransactionEntryModal
          defaultFinance={{ module: 'personalLoans', ref: loan.id, currencyCode: loan.currencyCode }}
          onClose={() => setAddPaymentOpen(false)}
        />
      )}
      {addPlanOpen && <Modal title="Add a plan" onClose={() => setAddPlanOpen(false)}><PersonalLoanPlanForm loan={loan} onSaved={() => setAddPlanOpen(false)} /></Modal>}
      {editPayment && (
        <TransactionEntryModal
          defaultFinance={{ module: 'personalLoans', ref: loan.id, currencyCode: loan.currencyCode }}
          editPersonalLoanPayment={editPayment}
          onClose={() => setEditPayment(null)}
        />
      )}
      {importOpen && <ImportRepaymentsSection loan={loan} onClose={() => setImportOpen(false)} />}
    </ModuleDetailTemplate>
  );
}

/** Pending item 114: "Main tier: entity items as CARDS rather than long
 * tables with custom reordering options" — converted from a sortable
 * table to an `EntityCard` grid, same pattern already rolled out to
 * Banking's `AccountsList`/`BanksList` and Funds' `BrokersList`. The old
 * per-column sort is gone on purpose (rule 1); ordering is now
 * favorite-first (same "favorites float to the top" convention every
 * other `EntityCard` grid in the app already uses), with Sr# still shown
 * from the loan's own stable creation-order position. */
function LoanList({
  onSelect,
  filter,
  showArchived,
  selectedIds,
}: {
  onSelect: (loan: PersonalLoan) => void;
  filter: 'all' | 'owed_to_me' | 'i_owe';
  showArchived: boolean;
  selectedIds?: string[];
}) {
  const allLoans = usePersonalLoansWorkbookStore((s) => s.workbook.loans);
  const repayments = usePersonalLoansWorkbookStore((s) => s.workbook.repayments);
  const visibleLoans = useMemo(
    () => (showArchived ? allLoans : allLoans.filter((loan) => loan.isActive !== false)).filter((loan) => !selectedIds || selectedIds.includes(loan.id)),
    [allLoans, showArchived, selectedIds],
  );
  const filtered = useMemo(
    () => (filter === 'all' ? visibleLoans : visibleLoans.filter((loan) => loan.direction === filter))
      .sort((a, b) => Number(!!b.isFavorite) - Number(!!a.isFavorite)),
    [visibleLoans, filter],
  );
  const srNumOf = useMemo(() => new Map(allLoans.map((loan, index) => [loan.id, index + 1])), [allLoans]);

  if (!filtered.length) {
    return (
      <p className="text-muted">
        {allLoans.length ? 'No loans match the current filter.' : 'No personal loans yet. Use Actions → Add a loan.'}
      </p>
    );
  }

  return (
    <div className="entity-card-grid">
      {filtered.map((loan) => {
        const outstanding = loanOutstanding(loan, repayments);
        return (
          <EntityCard
            key={loan.id}
            title={<><span className="text-muted entity-card-sr">#{srNumOf.get(loan.id)}</span>{loan.person}</>}
            subtitle={loan.direction === 'owed_to_me' ? 'I lent money' : 'I borrowed money'}
            badge={loan.isActive === false ? <span className="pill-warn fs-10">Closed</span> : undefined}
            statLabel="Outstanding"
            stat={<MoneyValue n={outstanding} currency={loan.currencyCode} />}
            hue={loan.color ?? (loan.direction === 'owed_to_me' ? 'var(--profit)' : 'var(--loss)')}
            onClick={() => onSelect(loan)}
          />
        );
      })}
    </div>
  );
}


function PersonalLoansModulePlans({
  filter,
  onSelectLoan,
  selectedIds,
  filters,
}: {
  filter: 'all' | 'owed_to_me' | 'i_owe';
  onSelectLoan: (loan: PersonalLoan) => void;
  selectedIds: string[];
  filters: TransactionPageFilters;
}) {
  const loans = usePersonalLoansWorkbookStore((s) => s.workbook.loans);
  const plans = usePersonalLoansWorkbookStore((s) => s.workbook.plans ?? []);
  const categories = useCategoryStore((s) => s.workbook.categories);
  const visibleLoans = new Map(
    loans.filter((loan) => selectedIds.includes(loan.id) && (filter === 'all' || loan.direction === filter)).map((loan) => [loan.id, loan]),
  );
  const rows = plans
    .filter((plan) => visibleLoans.has(plan.loanId)
      && (!filters.fromDate || plan.date >= filters.fromDate)
      && (!filters.toDate || plan.date <= filters.toDate)
      && (filters.category === 'all' || categoryName(plan.categoryID, categories) === filters.category))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="table-responsive">
      <table>
        <thead><tr><th>Date</th><th>Loan</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((plan) => {
            const loan = visibleLoans.get(plan.loanId)!;
            return (
              <tr key={plan.id} className="clickable" onClick={() => onSelectLoan(loan)}>
                <td>{plan.date}</td>
                <td>{loan.person}</td>
                <td>{plan.description || '—'}</td>
                <td>{fmtMoney(plan.amount, loan.currencyCode)}</td>
                <td>{plan.executed ? 'Executed' : 'Planned'}</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={5} className="text-muted">No plans match this loan filter.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function PersonalLoansModulePayments({
  filter,
  onSelectLoan,
  selectedIds,
  filters,
}: {
  filter: 'all' | 'owed_to_me' | 'i_owe';
  onSelectLoan: (loan: PersonalLoan) => void;
  selectedIds: string[];
  filters: TransactionPageFilters;
}) {
  const loans = usePersonalLoansWorkbookStore((s) => s.workbook.loans);
  const payments = usePersonalLoansWorkbookStore((s) => s.workbook.repayments);
  const categories = useCategoryStore((s) => s.workbook.categories);
  const visibleLoans = new Map(
    loans.filter((loan) => selectedIds.includes(loan.id) && (filter === 'all' || loan.direction === filter)).map((loan) => [loan.id, loan]),
  );
  const rows = payments
    .filter((payment) => visibleLoans.has(payment.loanId)
      && (!filters.fromDate || payment.date >= filters.fromDate)
      && (!filters.toDate || payment.date <= filters.toDate)
      && (filters.source === 'all' || (payment.source ?? 'manual') === filters.source)
      && (filters.category === 'all' || categoryName(payment.categoryID, categories) === filters.category))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.seq ?? 0) - (a.seq ?? 0));

  return (
    <div className="table-responsive">
      <table>
        <thead><tr><th>Date</th><th>Loan</th><th>Description</th><th>Category</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((payment) => {
            const loan = visibleLoans.get(payment.loanId)!;
            return (
              <tr key={payment.id} className="clickable" onClick={() => onSelectLoan(loan)}>
                <td>{payment.date}</td>
                <td>{loan.person}</td>
                <td>{payment.description || '—'}</td>
                <td>{categoryName(payment.categoryID, categories)}</td>
                <td>{fmtMoney(payment.amount, loan.currencyCode)}</td>
                <td>{payment.isPending ? 'Pending' : 'Cleared'}</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="text-muted">No payments match this loan filter.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// User-reported (2026-08-27, then again 2026-08-28): duplicated the global
// /account hub's own Sync status section — dropped the status text/heading
// here, same fix already applied app-wide (see BankPage.tsx for the
// fullest write-up).
function AccountSection({
  cloudEmpty,
  uploadLocalToCloud,
}: {
  cloudEmpty: boolean;
  uploadLocalToCloud: () => Promise<void>;
}) {
  const loans = usePersonalLoansWorkbookStore((s) => s.workbook.loans);
  const [busy, setBusy] = useState(false);

  if (!firebaseReady || !cloudEmpty) return null;
  return (
    <>
      {cloudEmpty && (
        <Notice tone="warning" className="mt-sm">
          <p className="mt-0">
            No data found in the cloud for this account's Personal Loans workbook. This won't upload automatically.
          </p>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              const ok = await confirmDialog(
                'This will overwrite anything currently in the cloud (there is nothing there now, but confirming since this can\'t be undone).',
                `Upload ${loans.length} local loan(s) to the cloud?`,
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
            Upload local data to cloud ({loans.length} loans)
          </button>
        </Notice>
      )}
    </>
  );
}

export function PersonalLoansPage({
  cloudEmpty,
  uploadLocalToCloud,
}: {
  user: User | null;
  syncStatus: string;
  cloudEmpty: boolean;
  uploadLocalToCloud: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<PersonalLoan | null>(null);
  const [filter, setFilter] = useState<'all' | 'owed_to_me' | 'i_owe'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const loans = usePersonalLoansWorkbookStore((s) => s.workbook.loans);
  const liveSelected = selected ? loans.find((loan) => loan.id === selected.id) ?? null : null;
  const [params] = useSearchParams();
  const selectedIds = selectedEntityValues(params, loans.map((loan) => loan.id));
  const categories = useCategoryStore((state) => state.workbook.categories);
  const repayments = usePersonalLoansWorkbookStore((state) => state.workbook.repayments);
  const { filters: transactionFilters, setFilters, resetFilters, activeCount } = useUrlTransactionFilters();
  const scopedIds = useMemo(() => selectedIds.filter((id) => {
    const loan = loans.find((item) => item.id === id);
    if (!loan) return false;
    if (transactionFilters.direction === 'in' && loan.direction !== 'owed_to_me') return false;
    if (transactionFilters.direction === 'out' && loan.direction !== 'i_owe') return false;
    return true;
  }), [selectedIds, loans, transactionFilters.direction]);
  const filterCategories = useMemo(() => [...new Set(repayments.filter((payment) => selectedIds.includes(payment.loanId)).map((payment) => categoryName(payment.categoryID, categories)))].sort(), [repayments, selectedIds, categories]);
  const archivedCount = useMemo(() => loans.filter((loan) => loan.isActive === false).length, [loans]);

  const landingTopBar = useMemo(() => liveSelected ? null : (
    <TopBarControls>
      <TopBarSelect
        label="Loan type"
        value={filter}
        onChange={(event) => setFilter(event.target.value as typeof filter)}
        options={[
          { value: 'all', label: 'All loans' },
          { value: 'owed_to_me', label: 'I lent money' },
          { value: 'i_owe', label: 'I borrowed money' },
        ]}
      />
      <EntityScopeMenu label="Loans" options={loans.map((loan) => ({ value: loan.id, label: loan.person }))} />
      <TransactionFilterMenu value={transactionFilters} categories={filterCategories} activeCount={activeCount} onChange={setFilters} onClear={resetFilters} />
    </TopBarControls>
  ), [liveSelected, filter, loans, transactionFilters, filterCategories, activeCount, setFilters, resetFilters]);
  usePageTopBarRightSlot(landingTopBar);

  if (liveSelected) {
    return <LoanDetail loan={liveSelected} onBack={() => setSelected(null)} />;
  }

  const loanActions: StandardCardAction[] = archivedCount
    ? [{
        label: showArchived ? 'Hide closed loans' : `Show closed loans (${archivedCount})`,
        onClick: () => setShowArchived((value) => !value),
      }]
    : [];

  const sections: StandardPageSection[] = [
    {
      key: 'summary',
      label: 'Summary',
      defaultOpen: true,
      summary: <SummaryChip label="Loans" value={loans.length} />,
      content: <NetPositionSummary selectedIds={scopedIds} />,
    },
    {
      key: 'loans',
      label: 'Loans',
      defaultOpen: true,
      actions: loanActions,
      summary: <SummaryChip label="Open" value={loans.filter((loan) => loan.isActive !== false).length} />,
      content: <LoanList onSelect={setSelected} filter={filter} showArchived={showArchived} selectedIds={scopedIds} />,
    },
    {
      key: 'plans',
      label: 'Plans',
      content: <PersonalLoansModulePlans filter={filter} onSelectLoan={setSelected} selectedIds={scopedIds} filters={transactionFilters} />,
    },
    {
      key: 'payments',
      label: 'Payments',
      content: <PersonalLoansModulePayments filter={filter} onSelectLoan={setSelected} selectedIds={scopedIds} filters={transactionFilters} />,
    },
    {
      key: 'analytics',
      label: 'Analytics',
      content: <AnalyticsTab filter={filter} selectedIds={scopedIds} filters={transactionFilters} />,
    },
    {
      key: 'settings',
      label: 'Settings',
      content: <AccountSection cloudEmpty={cloudEmpty} uploadLocalToCloud={uploadLocalToCloud} />,
    },
  ];

  return (
    <div className="standard-page">
      <BackButton to="/net-worth">← Overview</BackButton>
      <h1 className="pagetitle">Personal Loans</h1>
      <p className="text-muted mb-12">
        Informal money borrowed from or lent to another person, with payments, linked transfers, categories, and net position tracking.
      </p>
      <StandardPageSections sections={sections} defaultKey="summary" />
      <AddLoanFab />
    </div>
  );
}
