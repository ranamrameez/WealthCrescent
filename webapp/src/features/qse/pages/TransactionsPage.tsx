import { RecordRow } from '../../../components/RecordRow';
import { useDateTableSort } from '../../../hooks/useDateTableSort';
import { useQSEStockData } from '../hooks/useQSEStockData';
import { shortenCompanyName } from '../../../lib/shortenName';
import { Modal } from '../../../components/Modal';
import { useQseTablePagination } from '../components/useQseTablePagination';
import { StandardPageSections, type SectionCardProps } from '../../../components/StandardPageSections';
import { QseFilterProvider } from '../components/QseFilters';
import { useQseFilters, matchesQseFilters } from '../components/qseFilterModel';
import { QseRecordCard, QseReorder, type QseRow } from '../components/QseTableActions';
import { DateValue } from '../../../components/DateValue';
import { PageHeading } from '../../../components/PageHeading';
import { BackButton } from '../../../components/BackButton';
import { PriceInput } from "../../../components/ui/PriceInput";
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QSE_TICKER_DATALIST_ID } from '../../../components/TickerDatalist';
import { TickerLogo } from '../../../components/TickerLogo';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { ArrowLeftIcon, ArrowRightIcon, CashIcon, CheckIcon, EditIcon, PlusIcon, SaveIcon, TrashIcon, TransferIcon, XIcon } from '../../../components/icons';
import { toast } from '../../../components/Toast';
import { Tooltip } from '../../../components/Tooltip';
import { TransactionEntryModal } from '../../../components/TransactionEntryModal';
import { RecordDetailModal } from '../../../components/RecordDetailModal';
import { LotAllocationFields } from '../../../components/ui/LotAllocationFields';
import { useSortableRows } from '../../../hooks/useSortableRows';
import { usePageFabActions } from '../../../hooks/usePageFabActions';
import { fmt, fmtMoney, fmtQSEPrice } from '../../../lib/format';
import { closedPLBySellTxId, computeClosedTrades, type LotMatchOrder } from '../../../lib/calc/closedTrades';
import { computeAveragePLBySellTxId } from '../../../lib/calc/realizedPL';
import { computeFIFOPositions, type FIFOLot } from '../../../lib/calc/fifoPositions';
import { tradePriceDeviationPct, validateSellQuantities } from '../../../lib/calc/tradeValidation';
import { confirmAndDeleteLinkable } from '../../../lib/linkCascade';
import { transferRunningBalance } from '../../../lib/calc/transferBalance';
import { Field } from '../../../components/ui/Field';
import { AmountInput } from '../../../components/ui/AmountInput';
import { IconButton } from '../../../components/ui/IconButton';
import { TimeZoneFields } from '../../../components/ui/TimeZoneFields';
import { defaultTimeForDate, defaultTimezoneForCurrency, defaultTimezoneForMarket, nowTime } from '../../../lib/datetime';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { ReorderButtons } from '../../../components/ui/ReorderButtons';
import { PendingToggle } from '../../../components/ui/PendingToggle';
import { toInstantMs } from '../../../lib/datetime';
import { createEmptyWorkbook } from '../../../store/defaultWorkbook';
import { useWorkbookStore } from '../../../store/workbookStore';
import { useInterEntityTransfersStore } from '../../../store/interEntityTransfersStore';
import { linkTargetPath, useLinkSideLabel } from '../../transfers/pages/TransferLinksPage';
import type { Adjustment, Transaction, Transfer } from '../../../types/workbook';
import { DividendsSection } from '../components/DividendsSection';
import { useQSEDerived } from '../hooks/useQSEDerived';

const today = () => new Date().toISOString().slice(0, 10);

function emptyRow(): Transaction {
  return { date: today(), ticker: '', action: 'BUY', shares: 0, price: 0, time: nowTime(defaultTimezoneForMarket('QSE')), timezone: defaultTimezoneForMarket('QSE') };
}

export function TransactionRows({ initial, onSaved }: { initial?: Partial<Transaction>; onSaved?: () => void } = {}) {
  const addTransactions = useWorkbookStore((s) => s.addTransactions);
  const workbook = useWorkbookStore((s) => s.workbook);
  const { calcFee, positions } = useQSEDerived();
  const ensureSignedIn = useEnsureSignedIn();
  // Pending item 143 (closed 2026-09-19): manual multi-lot Specific
  // Identification, gated the same way `targetLotBuyId` already is — inert
  // (and hidden) under the default 'average' method, which never reads any
  // lot-targeting field at all. Lots are computed from the workbook's
  // CURRENT committed state only — a batch of several queued rows for the
  // same ticker doesn't simulate each row's own effect on the next one's
  // available lots, same simplification every other per-row field in this
  // form already makes (no row can see what a sibling row will do either).
  const method = workbook.settings.costBasisMethod;
  const showLotAllocation = method === 'fifo' || method === 'lowestCostFirst';
  const lotsByTicker = useMemo(
    () => (showLotAllocation ? computeFIFOPositions(workbook.transactions, calcFee, method!).lotsByTicker : {}),
    [showLotAllocation, workbook.transactions, calcFee, method],
  );
  // Partial Trade's "Sell this lot" pre-fills ticker/action/shares/price
  // via this optional prop, mirroring PSX's TransactionRows.
  const [rows, setRows] = useState<Transaction[]>([{ ...emptyRow(), ...initial }]);
  // Tracks, per queued row, whether the user has actually edited Time
  // themselves — see `defaultTimeForDate()`'s own doc comment. Index-
  // aligned with `rows`; rows are only ever appended/removed, never
  // reordered, so plain array indices stay valid throughout this
  // component's lifecycle (same convention the rest of this app uses for
  // per-row local UI state).
  const [timeTouched, setTimeTouched] = useState<boolean[]>([false]);

  const update = (i: number, patch: Partial<Transaction>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const updateDate = (i: number, date: string) =>
    update(i, timeTouched[i] ? { date } : { date, time: defaultTimeForDate(date, rows[i].timezone) });
  const touchTime = (i: number) => setTimeTouched((ts) => ts.map((t, idx) => (idx === i ? true : t)));

  const submit = async () => {
    const valid = rows.filter((r) => r.ticker && r.shares > 0 && r.price > 0);
    if (!valid.length) {
      toast('Fill in at least one complete row.');
      return;
    }
    const quantityError = validateSellQuantities(valid, Object.fromEntries(positions.map(position => [position.ticker, position.shares])));
    if (quantityError) {
      toast(`Cannot sell ${quantityError.requested} ${quantityError.ticker}: only ${fmt(quantityError.available, 0)} shares are available after the earlier rows.`);
      return;
    }
    const threshold = workbook.settings.tradePriceDeviationPct ?? 10;
    const deviations = valid.flatMap(row => {
      const ticker = row.ticker.toUpperCase();
      const marketPrice = workbook.marketPrices[ticker] ?? 0;
      const deviation = tradePriceDeviationPct(row.price, marketPrice);
      return deviation !== null && Math.abs(deviation) > threshold
        ? [`${ticker}: entered ${fmtQSEPrice(row.price)} vs market ${fmtQSEPrice(marketPrice)} (${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}%)`]
        : [];
    });
    if (deviations.length && !(await confirmDialog(`${deviations.join('\\n')}\\n\\nThis exceeds your ${threshold}% warning threshold. Save these trades anyway?`, 'Trade prices differ from market prices?'))) return;
    if (!(await ensureSignedIn('Sign in to save your transactions.'))) return;
    try {
      const beforeCount = useWorkbookStore.getState().workbook.transactions.length;
      addTransactions(valid.map((r) => ({ ...r, ticker: r.ticker.toUpperCase() })));
      const afterCount = useWorkbookStore.getState().workbook.transactions.length;
      if (afterCount !== beforeCount + valid.length) throw new Error('Transaction store did not retain every submitted row.');
    } catch (error) {
      console.error('Failed to add QSE trade from the transaction form.', error);
      toast('Could not save the trade. Your entries are still here; please try again.');
      return;
    }
    toast(`Added ${valid.length} transaction${valid.length > 1 ? 's' : ''}.`);
    setRows([emptyRow()]);
    setTimeTouched([false]);
    // The shared FAB hosts this form in a modal. Close only after the
    // store mutation succeeds; otherwise preserve the user's entered row.
    onSaved?.();
  };

  return (
    <div>
      {/* README item 10: enter multiple transactions at once, not just one row at a time. */}
      {rows.map((r, i) => (
        <div key={i}>
        <div className="row entry-row gap-sm">
          <Field label={i === 0 ? 'Date' : undefined}>
            <input type="date" value={r.date} onChange={(e) => updateDate(i, e.target.value)} />
          </Field>
          <Field label={i === 0 ? 'Ticker' : undefined} required={i === 0}>
            <input
              placeholder="Ticker"
              value={r.ticker}
              onChange={(e) => update(i, { ticker: e.target.value.toUpperCase() })}
              list={QSE_TICKER_DATALIST_ID}
            />
          </Field>
          <Field label={i === 0 ? 'Action' : undefined}>
            <select value={r.action} onChange={(e) => update(i, { action: e.target.value as 'BUY' | 'SELL' })}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </Field>
          <Field label={i === 0 ? 'Shares' : undefined} required={i === 0} title={i === 0 ? 'You can type a math expression here too, e.g. 100+50.' : undefined}>
            <AmountInput placeholder="Shares" value={r.shares} onChange={(shares) => update(i, { shares })} />
          </Field>
          <Field label={i === 0 ? 'Price' : undefined} required={i === 0} title={i === 0 ? 'You can type a math expression here too, e.g. 10.5+5.' : undefined}>
            <AmountInput exchange="qse" placeholder="Price" value={r.price} onChange={(price) => update(i, { price })} />
          </Field>
          <TimeZoneFields
            time={r.time}
            timezone={r.timezone}
            onTimeChange={(time) => { update(i, { time }); touchTime(i); }}
            onTimezoneChange={(timezone) => update(i, { timezone })}
          />
          <Field label={i === 0 ? 'Order' : undefined} as="div">
            <PendingToggle
              checked={!!r.isPending}
              onChange={(v) => update(i, { isPending: v })}
              title="Placed but not yet filled — excluded from your shares/cash balance until it clears."
            />
          </Field>
          <button
            className="btn secondary small ml-auto align-end"
            onClick={() => {
              setRows((rs) => rs.filter((_, idx) => idx !== i));
              setTimeTouched((ts) => ts.filter((_, idx) => idx !== i));
            }}
          >
            <TrashIcon size={12} />Remove
          </button>
        </div>
        {r.action === 'SELL' && showLotAllocation && r.ticker && (
          <LotAllocationFields exchange="qse"
            lots={lotsByTicker[r.ticker.toUpperCase()] || []}
            totalShares={r.shares}
            value={r.lotAllocations}
            onChange={(next) => update(i, { lotAllocations: next })}
          />
        )}
        </div>
      ))}
      <div className="row gap-sm">
        <button
          className="btn secondary"
          onClick={() => { setRows((rs) => [...rs, emptyRow()]); setTimeTouched((ts) => [...ts, false]); }}
        >
          <PlusIcon />Add row
        </button>
      </div>
      <div className="d-flex justify-center mt-md">
        <button className="btn" style={{ minWidth: 220 }} onClick={submit}>
          <SaveIcon />Save {rows.length > 1 ? `${rows.length} transactions` : 'transaction'}
        </button>
      </div>
    </div>
  );
}

/** User-requested (2026-08-28): the module's own "Transfers" FAB, replacing
 * the old always-visible add-transfer form — opens the shared
 * `TransactionEntryModal` defaulted to this exchange's own workbook.
 *
 * 2026-09-07: registers via `usePageFabActions` instead of rendering its
 * own `FabPanel` — the globally-mounted `CalculatorLauncher` already
 * renders one `FabPanel` for every Stock Exchanges route, and two separate
 * `position:fixed` panels at the same corner was exactly the "overlapping/
 * blocking instead of grouping" bug reported. */
function TransfersFab() {
  const [open, setOpen] = useState(false);
  const actions = useMemo(() => [{ label: 'Transfers', icon: <TransferIcon />, onClick: () => setOpen(true) }], []);
  usePageFabActions('qse-transfers', actions);
  return open ? <TransactionEntryModal defaultFinance={{ module: 'qse' }} onClose={() => setOpen(false)} /> : null;
}

function AdjustmentForm() {
  const addAdjustment = useWorkbookStore((s) => s.addAdjustment);
  const currency = useWorkbookStore((s) => s.workbook.settings.currency);
  const ensureSignedIn = useEnsureSignedIn();
  const emptyAdjustment = (): Adjustment => ({ date: today(), amount: 0, note: '', time: nowTime(defaultTimezoneForCurrency(currency)), timezone: defaultTimezoneForCurrency(currency) });
  const [a, setA] = useState<Adjustment>(emptyAdjustment);
  const [timeTouched, setTimeTouched] = useState(false);

  return (
    <div className="row gap-sm">
      <Field label="Date">
        <input
          type="date"
          value={a.date}
          onChange={(e) => {
            const date = e.target.value;
            setA(timeTouched ? { ...a, date } : { ...a, date, time: defaultTimeForDate(date, a.timezone) });
          }}
        />
      </Field>
      <Field label="Amount">
        <input
          type="number"
          step="0.01"
          placeholder="Amount"
          value={a.amount || ''}
          onChange={(e) => setA({ ...a, amount: Number(e.target.value) })}
          className="w-100"
        />
      </Field>
      <Field label="Note">
        <input placeholder="Note" value={a.note} onChange={(e) => setA({ ...a, note: e.target.value })} />
      </Field>
      <TimeZoneFields
        time={a.time}
        timezone={a.timezone}
        onTimeChange={(time) => { setA({ ...a, time }); setTimeTouched(true); }}
        onTimezoneChange={(timezone) => setA({ ...a, timezone })}
      />
      <button
        className="btn"
        onClick={async () => {
          if (!a.amount) return toast('Enter an amount.');
          if (!(await ensureSignedIn('Sign in to save adjustments.'))) return;
          addAdjustment(a);
          toast('Adjustment added.');
          setA(emptyAdjustment());
          setTimeTouched(false);
        }}
      >
        <PlusIcon />Add
      </button>
    </div>
  );
}

type GroupBy = 'none' | 'ticker' | 'action' | 'month';

function groupKey(tx: Transaction, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'ticker': return tx.ticker;
    case 'action': return tx.action;
    case 'month': return tx.date.slice(0, 7);
    default: return '';
  }
}

function TransactionList({ sectionProps }: { sectionProps?: SectionCardProps } = {}) {
  const pageFilters = useQseFilters();
  const [modifying, setModifying] = useState(false);
  const { workbook, calcFee, positions } = useQSEDerived();
  const deleteTransaction = useWorkbookStore((s) => s.deleteTransaction);
  const updateTransaction = useWorkbookStore((s) => s.updateTransaction);
  const ensureSignedIn = useEnsureSignedIn();
  const currency = workbook.settings.currency;

  const filterTicker = pageFilters.ticker || 'ALL';
  const filterAction = pageFilters.action || 'ALL';
  const groupBy = (pageFilters.group || 'none') as GroupBy;
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<Transaction | null>(null);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [sourceEditRequest, setSourceEditRequest] = useState<QseRow | null>(null);
  // User-reported (2026-09-13): the flat 0.275% fee never depends on which
  // lot a sale is later attributed to, so FIFO's "oldest lot first" is a
  // pure reporting convention here, not a real constraint — offer the
  // cheapest-lot-first alternative as a second, explicitly comparison-only
  // view (see `closedTrades.ts`'s own `LotMatchOrder` doc comment).
  const ctMatchOrder: LotMatchOrder = workbook.settings.costBasisMethod === 'lowestCostFirst' ? 'lowestCostFirst' : 'fifo';

  // Pending item 143: manual lot allocation for the inline edit-row SELL
  // form — same gate as `TransactionRows`' add-row copy above. Lots are
  // computed excluding the transaction currently being edited (so re-
  // editing doesn't double-subtract its own already-applied effect), from
  // every OTHER real transaction regardless of date order — a documented
  // simplification, not true point-in-time state as of this row's own
  // date (matching how the existing "Sell this lot" `targetLotBuyId` flow
  // already just picks from whatever's currently open, with no deeper
  // historical reconstruction).
  const editMethod = workbook.settings.costBasisMethod;
  const showEditLotAllocation = editMethod === 'fifo' || editMethod === 'lowestCostFirst';
  const editLots = useMemo(() => {
    if (!showEditLotAllocation || editIndex === null || !editRow || editRow.action !== 'SELL' || !editRow.ticker) return [];
    const others = workbook.transactions.filter((_, idx) => idx !== editIndex);
    return computeFIFOPositions(others, calcFee, editMethod!).lotsByTicker[editRow.ticker.toUpperCase()] || [];
  }, [showEditLotAllocation, editIndex, editRow, workbook.transactions, calcFee, editMethod]);

  const indexed = workbook.transactions.map((tx, i) => ({ tx, i }));

  // Which tickers are currently open (nonzero shares) vs. fully closed —
  // user request: split the flat transaction log into two sections, same
  // as PSX (see that file for the full reasoning).
  const openTickers = useMemo(() => new Set(positions.filter((p) => p.shares > 0).map((p) => p.ticker)), [positions]);

  const filtered = indexed
    .filter((r) => filterTicker === 'ALL' || r.tx.ticker === filterTicker)
    .filter((r) => filterAction === 'ALL' || r.tx.action === filterAction)
    .filter(r => matchesQseFilters(r.tx, pageFilters));
  type TxCol = 'order' | 'date' | 'ticker' | 'action' | 'shares' | 'price' | 'amount';
  const sortValue = (r: (typeof filtered)[number], col: TxCol): number | string => {
    switch (col) {
      case 'order': return r.tx.globalTransactionIndex ?? r.tx.transactionIndex ?? Number.MAX_SAFE_INTEGER;
      case 'ticker': return r.tx.ticker;
      case 'action': return r.tx.action;
      case 'shares': return r.tx.shares;
      case 'price': return r.tx.price;
      case 'amount': return r.tx.shares * r.tx.price;
      default: return r.tx.date;
    }
  };
  const { sorted, Th, dateSort } = useSortableRows(filtered, sortValue, 'order', 'asc');

  const openSorted = useMemo(() => sorted.filter((r) => openTickers.has(r.tx.ticker)), [sorted, openTickers]);
  const closedSorted = useMemo(() => sorted.filter((r) => !openTickers.has(r.tx.ticker)), [sorted, openTickers]);

  const groupRows = useCallback((rows: typeof sorted) => {
    if (groupBy === 'none') return [{ key: '', rows }];
    const map: Record<string, typeof sorted> = {};
    rows.forEach((r) => {
      const k = groupKey(r.tx, groupBy);
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => ({ key, rows }));
  }, [groupBy]);
  const openPage = useQseTablePagination(openSorted);
  const closedPage = useQseTablePagination(closedSorted);
  const openGroups = groupRows(openPage.rows);
  const closedGroups = groupRows(closedPage.rows);

  // User's own words: "Individual stock should be marker as open/close with
  // its own buy & selling price, B&S taxes, net Buy/sale, so that sold/
  // closed shares do not ruin the calcs." The Open/Closed split above still
  // groups by ticker — a ticker with an open position shows every past
  // transaction (including old, already-closed round trips) under "Open".
  // This ledger instead reconstructs each individual closed round-trip via
  // FIFO matching, with its own buy price/sell price/fees/net P&L, entirely
  // independent of the aggregate position calc (computeClosedTrades never
  // feeds back into computePositions).
  const closedTrades = useMemo(
    () =>
      computeClosedTrades(
        workbook.transactions,
        calcFee,
        ctMatchOrder,
      ),
    [workbook.transactions, calcFee, ctMatchOrder],
  );
  type CTCol = 'ticker' | 'buyDate' | 'buyPrice' | 'sellDate' | 'sellPrice' | 'shares' | 'buyFee' | 'sellFee' | 'netPL' | 'holdingDays';
  const ctSortValue = (t: (typeof closedTrades)[number], col: CTCol): number | string => {
    switch (col) {
      case 'ticker': return t.ticker;
      case 'buyPrice': return t.buyPrice;
      case 'sellDate': return t.sellDate;
      case 'sellPrice': return t.sellPrice;
      case 'shares': return t.shares;
      case 'buyFee': return t.buyFee;
      case 'sellFee': return t.sellFee;
      case 'netPL': return t.netPL;
      case 'holdingDays': return t.holdingDays;
      default: return t.buyDate;
    }
  };
  const { sorted: sortedClosedTrades, Th: CTTh, dateSort: closedDateSort } = useSortableRows(closedTrades.filter(row => (filterTicker === 'ALL' || row.ticker === filterTicker) && filterAction !== 'BUY' && matchesQseFilters({ date: row.sellDate, ticker: row.ticker, action: 'SELL' }, pageFilters)), ctSortValue, 'sellDate', 'desc');

  // User's own ask (2026-09-08): "show the sold price and PL w.r.t. that
  // lot's buy price... inline in the main trade row." Computed from the
  // WHOLE workbook before display filters are applied so
  // a row's own P&L figure never changes just because the ticker filter is
  // narrowed to something else. Shares `ctMatchOrder` with the Closed Trades
  // table above (2026-09-13) — a feature rolled out to one view of a sell's
  // realized P&L must stay consistent with every other view of the same
  // number, or this row's own pill and the table below could show two
  // contradicting figures for the identical sell.
  const sellPLById = useMemo(
    () => (workbook.settings.costBasisMethod === 'average' || !workbook.settings.costBasisMethod)
      ? computeAveragePLBySellTxId(workbook.transactions, calcFee)
      : closedPLBySellTxId(computeClosedTrades(workbook.transactions, calcFee, ctMatchOrder)),
    [workbook.transactions, workbook.settings.costBasisMethod, calcFee, ctMatchOrder],
  );

  // User's own words: "make separate sections for open and closed trades...
  // it gets difficult to know the sold status and price of a lot." Same
  // FIFO-lot view as `computeClosedTrades` above, just the still-held half
  // of it (`computeFIFOPositions`'s own `lotsByTicker`) — a pure reporting
  // ledger, deliberately independent of QSE's own OFFICIAL position calc
  // (`QSESettings.costBasisMethod`, whether that's weighted-average or one
  // of the lot-based methods) so this page's own reporting view never
  // silently changes shape depending on that setting. Shares
  // `ctMatchOrder` with Closed trades below (2026-09-13, see
  // `LotMatchOrder`'s own doc comment) so the two tables always add up to
  // the same picture of which lots are still open vs. already sold.
  const openLots = useMemo(() => {
    const txs = workbook.transactions;
    const { lotsByTicker } = computeFIFOPositions(txs, calcFee, ctMatchOrder);
    const flat: (FIFOLot & { ticker: string })[] = [];
    for (const [ticker, lots] of Object.entries(lotsByTicker)) {
      for (const lot of lots) flat.push({ ticker, ...lot });
    }
    return flat;
  }, [workbook.transactions, calcFee, ctMatchOrder]);
  type OLCol = 'ticker' | 'buyDate' | 'buyPrice' | 'shares' | 'invested' | 'buyFeeTotal';
  const olSortValue = (l: (typeof openLots)[number], col: OLCol): number | string => {
    switch (col) {
      case 'ticker': return l.ticker;
      case 'buyPrice': return l.buyPrice;
      case 'shares': return l.remainingShares;
      case 'invested': return l.remainingShares * l.buyPrice;
      case 'buyFeeTotal': return l.buyFeeTotal;
      default: return l.buyDate;
    }
  };
  const { sorted: sortedOpenLots, Th: OLTh, dateSort: openDateSort } = useSortableRows(openLots.filter(row => (filterTicker === 'ALL' || row.ticker === filterTicker) && filterAction !== 'SELL' && matchesQseFilters({ date: row.buyDate, ticker: row.ticker, action: 'BUY' }, pageFilters)), olSortValue, 'buyDate', 'desc');

  const openLotsPage = useQseTablePagination(sortedOpenLots);
  const closedTradesPage = useQseTablePagination(sortedClosedTrades);

  const startEdit = (i: number, tx: Transaction) => {
    setEditIndex(i);
    setEditRow({ ...tx });
  };
  const saveEdit = async () => {
    if (editIndex === null || !editRow) return;
    if (editRow.action === 'SELL' && !editRow.isPending) {
      const available = computeFIFOPositions(workbook.transactions.filter((_, index) => index !== editIndex), calcFee).positions.find(position => position.ticker === editRow.ticker.toUpperCase())?.shares ?? 0;
      if (editRow.shares > available + 1e-7) return toast(`Cannot save this sell: only ${fmt(available, 0)} ${editRow.ticker.toUpperCase()} shares are available.`);
    }
    const marketPrice = workbook.marketPrices[editRow.ticker.toUpperCase()] ?? 0;
    const deviation = tradePriceDeviationPct(editRow.price, marketPrice);
    const threshold = workbook.settings.tradePriceDeviationPct ?? 10;
    if (deviation !== null && Math.abs(deviation) > threshold) {
      const accepted = await confirmDialog(`Entered ${fmtQSEPrice(editRow.price)}; saved market price is ${fmtQSEPrice(marketPrice)} (${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}%). This exceeds your ${threshold}% warning threshold. Save anyway?`, 'Trade price differs from market price?');
      if (!accepted) return;
    }
    if (!(await ensureSignedIn('Sign in to save changes.'))) return;
    updateTransaction(editIndex, editRow);
    toast('Transaction updated.');
    setEditIndex(null);
    setEditRow(null);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(workbook, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qse-workbook-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setWorkbook = useWorkbookStore((s) => s.setWorkbook);
  const transactionOrderRows = useMemo(() => [...workbook.transactions].sort((a, b) => (a.globalTransactionIndex ?? a.transactionIndex ?? Number.MAX_SAFE_INTEGER) - (b.globalTransactionIndex ?? b.transactionIndex ?? Number.MAX_SAFE_INTEGER)), [workbook.transactions]);
  const clearAll = async () => {
    const ok = await confirmDialog(
      'This clears all transactions, prices and watchlist entries in this browser.',
      'Clear all transaction data?',
    );
    if (!ok || !(await ensureSignedIn('Sign in to clear transaction data.'))) return;
    setWorkbook({ ...createEmptyWorkbook(), settings: workbook.settings, appearance: workbook.appearance });
    toast('All transaction data cleared.');
  };

  const renderTable = (groups: typeof openGroups, emptyMessage: string) => (
    <>
    <div className="table-responsive">
      <table>
        <thead>
          <tr>
            <Th col="date">Date</Th>
            <Th col="ticker">Ticker</Th>
            <Th col="action">Action</Th>
            <Th col="shares">Shares</Th>
            <Th col="price">Price</Th>
            <Th col="amount">Amount</Th>
            <th>
              <Tooltip text="Realized profit/loss for a SELL row using the configured cost-basis method: weighted-average cost under Average cost, or the configured lot-matching method under FIFO/Lowest cost first. Blank on a BUY row (nothing realized yet).">
                P/L
              </Tooltip>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key || 'ungrouped'}>
              {g.key && (
                <tr key={'hdr-' + g.key} style={{ background: 'var(--panel-2)' }}>
                  <td colSpan={8}>
                    <strong>{g.key}</strong> — {g.rows.length} txns ·{' '}
                    buys {fmt(g.rows.filter((r) => r.tx.action === 'BUY').reduce((s, r) => s + r.tx.shares, 0), 0)} ·{' '}
                    sells {fmt(g.rows.filter((r) => r.tx.action === 'SELL').reduce((s, r) => s + r.tx.shares, 0), 0)} ·{' '}
                    volume {fmtMoney(g.rows.reduce((s, r) => s + r.tx.shares * r.tx.price, 0), currency)} ·{' '}
                    fees {fmtMoney(g.rows.reduce((s, r) => s + calcFee(r.tx.shares * r.tx.price, r.tx.action === 'BUY'), 0), currency)}
                  </td>
                </tr>
              )}
              {g.rows.map(({ tx, i }) =>
                editIndex === i && editRow ? (
                  <Fragment key={i}>
                  <RecordRow market="qse" record={{ tx, i }} onCancel={() => setEditIndex(null)}>
                    <td><input type="date" value={editRow.date} onChange={(e) => setEditRow({ ...editRow, date: e.target.value })} className="w-130" /></td>
                    <td><input value={editRow.ticker} onChange={(e) => setEditRow({ ...editRow, ticker: e.target.value.toUpperCase() })} className="w-70" /></td>
                    <td>
                      <select value={editRow.action} onChange={(e) => setEditRow({ ...editRow, action: e.target.value as 'BUY' | 'SELL' })}>
                        <option value="BUY">BUY</option>
                        <option value="SELL">SELL</option>
                      </select>
                    </td>
                    <td><input type="number" value={editRow.shares} onChange={(e) => setEditRow({ ...editRow, shares: Number(e.target.value) })} className="w-70" /></td>
                    <td><PriceInput exchange="qse" type="number" step="0.001" value={editRow.price} onChange={(e) => setEditRow({ ...editRow, price: Number(e.target.value) })} className="w-80" /></td>
                    <td>{fmtMoney(editRow.shares * editRow.price, currency)}</td>
                    <td></td>
                    <td>
                      <PendingToggle
                        checked={!!editRow.isPending}
                        onChange={(v) => setEditRow({ ...editRow, isPending: v })}
                        title="Placed but not yet filled — excluded from shares/cash balance until cleared."
                      />{' '}
                      <IconButton label="Save" icon={<SaveIcon size={13} />} align="right" onClick={saveEdit} />{' '}
                      <IconButton label="Cancel" icon={<XIcon size={13} />} align="right" onClick={() => setEditIndex(null)} />
                    </td>
                  </RecordRow>
                  {editRow.action === 'SELL' && showEditLotAllocation && (
                    <tr>
                      <td colSpan={8}>
                        <LotAllocationFields exchange="qse"
                          lots={editLots}
                          totalShares={editRow.shares}
                          value={editRow.lotAllocations}
                          onChange={(next) => setEditRow({ ...editRow, lotAllocations: next })}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ) : (
                  <RecordRow market="qse" onEdit={() => startEdit(i, tx)}    record={{ tx, i }}  key={i}  className="clickable">
                    <td><DateValue value={tx.date} />{modifying && <span onClick={event => event.stopPropagation()}><QseReorder kind="transactions" row={tx} rows={transactionOrderRows} /></span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <TickerLogo ticker={tx.ticker} size="sm" exchange="qse" /><Link to={`/stock/${tx.ticker}`}>{tx.ticker}</Link>
                      {tx.isPending && (
                        <Tooltip text="Order placed but not yet filled — excluded from your shares/cash balance until cleared.">
                          <span className="pill-warn ml-6">Pending</span>
                        </Tooltip>
                      )}
                    </td>
                    <td className={tx.action === 'BUY' ? 'pill-buy' : 'pill-sell'}>{tx.action}</td>
                    <td>{fmt(tx.shares, 0)}</td>
                    <td>{fmtQSEPrice(tx.price)}</td>
                    <td>{fmtMoney(tx.shares * tx.price, currency)}</td>
                    <td className={tx.id && sellPLById[tx.id] ? (sellPLById[tx.id].netPL >= 0 ? 'pill-positive' : 'pill-negative') : undefined}>
                      {tx.id && sellPLById[tx.id] ? fmtMoney(sellPLById[tx.id].netPL, currency) : '—'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {modifying && <>{tx.isPending && (
                        <IconButton
                          label="Mark cleared"
                          icon={<CheckIcon size={13} />}
                          align="right"
                          onClick={async () => {
                            if (!(await ensureSignedIn('Sign in to update this transaction.'))) return;
                            updateTransaction(i, { isPending: false });
                            toast('Marked cleared.');
                          }}
                        />
                      )}{' '}
                      <IconButton label="Edit" icon={<EditIcon size={13} />} align="right" onClick={() => startEdit(i, tx)} />{' '}
                      <IconButton
                        label="Delete"
                        icon={<TrashIcon size={13} />}
                        align="right"
                        onClick={async () => {
                          if (await confirmDialog('This cannot be undone.', `Delete ${tx.action} ${tx.shares} ${tx.ticker}?`)) deleteTransaction(i);
                        }}
                      /></>}
                    </td>
                  </RecordRow>
                ),
              )}
            </Fragment>
          ))}
          {!groups.some((g) => g.rows.length) && (
            <tr><td colSpan={8} className="text-muted">{emptyMessage}</td></tr>
          )}
        </tbody>
      </table>
    </div></>
  );

  return (
    <QseRecordCard dateSort={dateSort} title="Trade list" editRequest={sourceEditRequest} sectionProps={sectionProps} kind="transactions" rows={sorted.map(row => row.tx)} modifying={modifying} onModify={() => setModifying(value => !value)} extraActions={[{ label: 'Export workbook backup', onClick: exportJSON }, { label: 'Clear all transaction data', tone: 'danger', onClick: clearAll }]}>

      <details open className="mb-md">
        <summary className="summary-heading">
          Open positions — {openSorted.length} txns
        </summary>
        {renderTable(openGroups, 'No transactions for a currently open position.')}
        {openPage.controls}
      </details>

      <details open>
        <summary className="summary-heading">
          Closed positions — {closedSorted.length} txns
        </summary>
        {renderTable(closedGroups, 'No transactions for a fully closed position yet.')}
        {closedPage.controls}
      </details>

      {(workbook.settings.costBasisMethod === 'fifo' || workbook.settings.costBasisMethod === 'lowestCostFirst') ? <>
      <QseRecordCard dateSort={openDateSort} title="Open trades (not yet sold)" kind="transactions" rows={workbook.transactions.filter(tx => sortedOpenLots.some(row => row.buyId === tx.id))} allRecords={workbook.transactions.filter(tx => openLots.some(row => row.buyId === tx.id))} modifying={modifying} onModify={() => setModifying(value => !value)} exportData={{ rows: sortedOpenLots, allRows: openLots }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <OLTh col="ticker">Ticker</OLTh>
                <OLTh col="buyDate">Buy date</OLTh>
                <OLTh col="buyPrice">Buy price</OLTh>
                <OLTh col="shares">Shares</OLTh>
                <OLTh col="invested">Invested</OLTh>
                <OLTh col="buyFeeTotal">Buy fee</OLTh>
                <th>Status</th>{modifying && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {openLotsPage.rows.map((l, i) => (
                <RecordRow market="qse" onEdit={() => { const source = workbook.transactions.find(row => row.id === l.buyId); if (source) setSourceEditRequest({ ...source, id: source.id! }); }}    record={l}  key={i}>
                  <td><TickerLogo ticker={l.ticker} size="sm" exchange="qse" /><Link to={`/stock/${l.ticker}`}>{l.ticker}</Link></td>
                  <td>{l.buyDate}</td>
                  <td>{fmtQSEPrice(l.buyPrice)}</td>
                  <td>{fmt(l.remainingShares, 0)}</td>
                  <td>{fmtMoney(l.remainingShares * l.buyPrice, currency)}</td>
                  <td>{fmtMoney(l.buyFeeTotal, currency)}</td>
                  <td><span className="pill pill-info">Open</span></td>{modifying && <td><IconButton label="Edit buy" icon={<EditIcon size={13} />} align="right" onClick={() => { const source = workbook.transactions.find(row => row.id === l.buyId); if (source) setSourceEditRequest({ ...source, id: source.id! }); }} /></td>}
                </RecordRow>
              ))}
              {!sortedOpenLots.length && (
                <tr><td colSpan={modifying ? 8 : 7} className="text-muted">No open lots — everything bought so far has been sold.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {openLotsPage.controls}
      </QseRecordCard>

      <QseRecordCard dateSort={closedDateSort} title="Closed trades (realized round-trips)" kind="transactions" rows={workbook.transactions.filter(tx => sortedClosedTrades.some(row => row.sellTxId === tx.id))} allRecords={workbook.transactions.filter(tx => closedTrades.some(row => row.sellTxId === tx.id))} modifying={modifying} onModify={() => setModifying(value => !value)} exportData={{ rows: sortedClosedTrades, allRows: closedTrades }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <CTTh col="ticker">Ticker</CTTh>
                <CTTh col="buyDate">Buy date</CTTh>
                <CTTh col="buyPrice">Buy price</CTTh>
                <CTTh col="sellDate">Sell date</CTTh>
                <CTTh col="sellPrice">Sell price</CTTh>
                <CTTh col="shares">Shares</CTTh>
                <CTTh col="buyFee">Buy fee</CTTh>
                <CTTh col="sellFee">Sell fee</CTTh>
                <CTTh col="netPL">Net P/L</CTTh>
                <CTTh col="holdingDays">Days held</CTTh>
                <th>Status</th>{modifying && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {closedTradesPage.rows.map((t, i) => (
                <RecordRow market="qse" onEdit={() => { const source = workbook.transactions.find(row => row.id === t.sellTxId); if (source) setSourceEditRequest({ ...source, id: source.id! }); }}    record={t}  key={i}>
                  <td><TickerLogo ticker={t.ticker} size="sm" exchange="qse" /><Link to={`/stock/${t.ticker}`}>{t.ticker}</Link></td>
                  <td>{t.buyDate}</td>
                  <td>{fmtQSEPrice(t.buyPrice)}</td>
                  <td>{t.sellDate}</td>
                  <td>{fmtQSEPrice(t.sellPrice)}</td>
                  <td>{fmt(t.shares, 0)}</td>
                  <td>{fmtMoney(t.buyFee, currency)}</td>
                  <td>{fmtMoney(t.sellFee, currency)}</td>
                  <td className={t.netPL >= 0 ? 'pill-positive' : 'pill-negative'}>{fmtMoney(t.netPL, currency)}</td>
                  <td>{t.holdingDays}</td>
                  <td><span className="pill pill-info">Closed</span></td>{modifying && <td><IconButton label="Edit sell" icon={<EditIcon size={13} />} align="right" onClick={() => { const source = workbook.transactions.find(row => row.id === t.sellTxId); if (source) setSourceEditRequest({ ...source, id: source.id! }); }} /></td>}
                </RecordRow>
              ))}
              {!sortedClosedTrades.length && (
                <tr><td colSpan={modifying ? 12 : 11} className="text-muted">No closed round-trips yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {closedTradesPage.controls}
      </QseRecordCard>
      </> : <p className="text-muted mt-md">
        Average cost blends all buys into one running cost basis, so individual open/closed lot attribution is not applicable. The transaction rows and portfolio calculations use weighted-average cost.
      </p>}


      {detailTx && (
        <RecordDetailModal
          title={`${detailTx.action} ${detailTx.ticker}`}
          onClose={() => setDetailTx(null)}
          fields={[
            { label: 'Date', value: detailTx.date },
            { label: 'Time', value: detailTx.time ?? '— (defaults to noon)' },
            { label: 'Timezone', value: detailTx.timezone ?? '—' },
            { label: 'Ticker', value: detailTx.ticker },
            { label: 'Action', value: detailTx.action },
            { label: 'Shares', value: fmt(detailTx.shares, 0) },
            { label: 'Price', value: fmtQSEPrice(detailTx.price) },
            { label: 'Amount', value: fmtMoney(detailTx.shares * detailTx.price, currency) },
            ...(detailTx.id && sellPLById[detailTx.id]
              ? [{ label: 'Realized P/L', value: fmtMoney(sellPLById[detailTx.id].netPL, currency) }]
              : []),
            { label: 'Status', value: detailTx.isPending ? 'Pending (not yet cleared)' : 'Cleared' },
          ]}
        />
      )}
    </QseRecordCard>
  );
}

/** User-requested (2026-09-03): "add filters to other tables as well" —
 * extends the Type/Category filter treatment Cash's statement tables got
 * (README Done item 224) to QSE's own Transfers table. */
function TransfersSection({ sectionProps }: { sectionProps?: SectionCardProps } = {}) {
  const pageFilters = useQseFilters();
  const dateSort = useDateTableSort();
  const [modifying, setModifying] = useState(false);
  const workbook = useWorkbookStore((s) => s.workbook);
  const updateTransfer = useWorkbookStore((s) => s.updateTransfer);
  const deleteTransfer = useWorkbookStore((s) => s.deleteTransfer);
  const currency = workbook.settings.currency;
  const links = useInterEntityTransfersStore((s) => s.workbook.entries);
  const ensureSignedIn = useEnsureSignedIn();
  const sideLabel = useLinkSideLabel();

  const [editRow, setEditRow] = useState<Transfer | null>(null);
  const typeFilter = pageFilters.transferType || 'all';

  const linkByRecordId = useMemo(() => {
    const map = new Map<string, (typeof links)[number]>();
    for (const l of links) {
      if (l.from.module === 'qse') map.set(l.fromRecordId, l);
      if (l.to.module === 'qse') map.set(l.toRecordId, l);
    }
    return map;
  }, [links]);

  // Computed independently of the table's own sort order (which the user
  // can flip to any column) so "Balance" always reflects the true
  // chronological running total, not whatever order the rows happen to be
  // displayed in — same reasoning as the Trade Planner's leg-value resolution.
  const balances = useMemo(() => transferRunningBalance(workbook.transfers), [workbook.transfers]);

  const filteredTransfers = useMemo(
    () => workbook.transfers.filter(t => (typeFilter === 'all' || t.type === typeFilter) && matchesQseFilters(t, pageFilters)),
    [workbook.transfers, typeFilter, pageFilters],
  );

  // Display direction preserves chronological sequence ties and precomputed balances.
  const instantOf = (t: Transfer) => toInstantMs(t.date, t.time, t.timezone);
  const dateSortInput = [...filteredTransfers].sort((a, b) => instantOf(b) - instantOf(a) || (b.seq ?? 0) - (a.seq ?? 0));
  const sorted = dateSort.rows(dateSortInput, { date: row => row });
  const reorderTransfer = async (pair: [{ id: string; order: number }, { id: string; order: number }]) => {
    if (!(await ensureSignedIn('Sign in to reorder transfers.'))) return;
    for (const p of pair) updateTransfer(p.id, { seq: p.order });
  };

  const page = useQseTablePagination(sorted);
  const startEdit = (t: Transfer) => setEditRow({ ...t });

  return (<>
    <QseRecordCard dateSort={dateSort} title="Cash transfers" sectionProps={sectionProps} kind="transfers" rows={sorted} modifying={modifying} onModify={() => setModifying(value => !value)}>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <dateSort.Th rows={dateSortInput}>Date</dateSort.Th>
              <th>Type</th>
              <th>Gross</th>
              <th>Fee</th>
              <th>Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((t) => {
              const link = linkByRecordId.get(t.id);
              const otherSide = link ? (link.from.module === 'qse' && link.fromRecordId === t.id ? link.to : link.from) : undefined;
              return (
                <RecordRow market="qse" onEdit={() => startEdit(t)}    record={t}  key={t.id}>
                  <td>
                    <DateValue value={t.date} />{' '}
                    {modifying && <ReorderButtons
                      rows={sorted}
                      index={sorted.findIndex(row => row.id === t.id)}
                      instantOf={instantOf}
                      idOf={(row) => row.id}
                      orderOf={(row) => row.seq}
                      onMove={reorderTransfer}
                    />}
                  </td>
                  <td>
                    {t.type}
                    {link && (
                      <Link to={linkTargetPath(otherSide!)} className="pill-info ml-6" title="Linked — go to the other side">
                        🔗 {sideLabel(link.from)} → {sideLabel(link.to)}
                      </Link>
                    )}
                  </td>
                  <td>{fmtMoney(t.gross, currency)}</td>
                  <td>{fmtMoney(t.fee, currency)}</td>
                  <td>
                    <Tooltip text="Running net cash contributed, in date order — deposits net of fee, minus withdrawals plus their fee. Doesn't include trading gains/losses; see Dashboard for total cash balance.">
                      <span>{fmtMoney(balances.get(t.id) ?? 0, currency)}</span>
                    </Tooltip>
                  </td>
                  <td>
                    {modifying && <><IconButton label="Edit" icon={<EditIcon size={13} />} align="right" onClick={() => startEdit(t)} />{' '}
                    <IconButton label="Delete" icon={<TrashIcon size={13} />} align="right" onClick={() => confirmAndDeleteLinkable('qse', t.id, () => deleteTransfer(t.id))} /></>}
                  </td>
                </RecordRow>
              );
            })}
            {!sorted.length && <tr><td colSpan={6} className="text-muted">No transfers yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {page.controls}
    </QseRecordCard>
      {editRow && <TransactionEntryModal editTransfer={{ module: 'qse', record: editRow }} onClose={() => setEditRow(null)} />}
    </>
  );
}

function AdjustmentsSection({ sectionProps }: { sectionProps?: SectionCardProps } = {}) {
  const [adding, setAdding] = useState(false);
  const ensureSignedIn = useEnsureSignedIn();
  const pageFilters = useQseFilters();
  const [modifying, setModifying] = useState(false);
  const workbook = useWorkbookStore((s) => s.workbook);
  const updateAdjustment = useWorkbookStore((s) => s.updateAdjustment);
  const deleteAdjustment = useWorkbookStore((s) => s.deleteAdjustment);
  const currency = workbook.settings.currency;
  const indexed = workbook.adjustments.map((a, i) => ({ a, i })).filter(row => matchesQseFilters(row.a, pageFilters));
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<Adjustment | null>(null);

  type AdjustmentCol = 'date' | 'amount' | 'note';
  const sortValue = (r: (typeof indexed)[number], col: AdjustmentCol): number | string => {
    switch (col) {
      case 'amount': return r.a.amount;
      case 'note': return r.a.note ?? '';
      default: return `${toInstantMs(r.a.date, r.a.time, r.a.timezone)} ${String(r.a.seq ?? 0).padStart(12, '0')}`;
    }
  };
  const { sorted, Th, dateSort } = useSortableRows(indexed, sortValue, 'date', 'desc');

  const page = useQseTablePagination(sorted);
  const startEdit = (i: number, a: Adjustment) => { setEditIndex(i); setEditRow({ ...a }); };
  const saveEdit = async () => {
    if (editIndex === null || !editRow) return;
    if (!(await ensureSignedIn('Sign in to save changes.'))) return;
    updateAdjustment(editIndex, editRow);
    toast('Adjustment updated.');
    setEditIndex(null);
    setEditRow(null);
  };

  return (
    <QseRecordCard dateSort={dateSort} title="Rewards & adjustments" extraActions={[{ label: 'Add adjustment', onClick: () => setAdding(true) }]} sectionProps={sectionProps} kind="adjustments" rows={sorted.map(row => row.a)} modifying={modifying} onModify={() => setModifying(value => !value)}>
      {adding && <Modal title="Add adjustment" onClose={() => setAdding(false)}><AdjustmentForm /></Modal>}
      <div className="table-scroll mt-sm">
        <table>
          <thead>
            <tr>
              <Th col="date">Date</Th>
              <Th col="amount">Amount</Th>
              <Th col="note">Note</Th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map(({ a, i }) =>
              editIndex === i && editRow ? (
                <RecordRow market="qse" record={{ a, i }} onCancel={() => setEditIndex(null)} key={i}>
                  <td><input type="date" value={editRow.date} onChange={(e) => setEditRow({ ...editRow, date: e.target.value })} className="w-130" /></td>
                  <td><input type="number" step="0.01" value={editRow.amount} onChange={(e) => setEditRow({ ...editRow, amount: Number(e.target.value) })} className="w-90" /></td>
                  <td><input value={editRow.note ?? ''} onChange={(e) => setEditRow({ ...editRow, note: e.target.value })} /></td>
                  <td>
                    <IconButton label="Save" icon={<SaveIcon size={13} />} align="right" onClick={saveEdit} />{' '}
                    <IconButton label="Cancel" icon={<XIcon size={13} />} align="right" onClick={() => setEditIndex(null)} />
                  </td>
                </RecordRow>
              ) : (
                <RecordRow market="qse" onEdit={() => startEdit(i, a)}    record={{ a, i }}  key={i}>
                  <td><DateValue value={a.date} />{modifying && <QseReorder kind="adjustments" row={a} rows={sorted.map(row => row.a)} />}</td>
                  <td>{fmtMoney(a.amount, currency)}</td>
                  <td>{a.note}</td>
                  <td>
                    {modifying && <><IconButton label="Edit" icon={<EditIcon size={13} />} align="right" onClick={() => startEdit(i, a)} />{' '}
                    <IconButton label="Delete" icon={<TrashIcon size={13} />} align="right" onClick={() => deleteAdjustment(i)} /></>}
                  </td>
                </RecordRow>
              ),
            )}
            {!sorted.length && <tr><td colSpan={4} className="text-muted">No adjustments yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {page.controls}
    </QseRecordCard>
  );
}

/** User-requested (2026-09-03): "add filters to other tables as well." */
function CashLedgerSection({ sectionProps }: { sectionProps?: SectionCardProps } = {}) {
  const filters = useQseFilters();
  const { tickerNames } = useQSEStockData();
  const dateSort = useDateTableSort();
  const { workbook, ledger } = useQSEDerived();
  const ensureSignedIn = useEnsureSignedIn();
  const [modifying, setModifying] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState<QseRow | null>(null);
  const sourceFor = (event: (typeof ledger)[number]): QseRow | undefined => {
    const collection = event.kind === 'trade' ? workbook.transactions : event.kind === 'transfer' ? workbook.transfers : workbook.adjustments;
    const record = collection.find(row => row.id === event.sourceId);
    return record ? { ...record, id: record.id!, kind: event.kind } : undefined;
  };
  const dateSortInput = [...ledger].reverse();
  const sorted = dateSort.rows(dateSortInput, { date: row => ({ ...row, seq: ledger.indexOf(row) }) });
  const filtered = sorted.filter(event => (!filters.kind || event.kind === filters.kind) && matchesQseFilters({ ...event, description: event.label }, filters));
  const page = useQseTablePagination(filtered);
  const sources = (events: typeof ledger) => events.map(sourceFor).filter((row): row is QseRow => !!row);
  const exportRows = (events: typeof ledger) => events.map(event => ({ ...sourceFor(event), description: sourceFor(event)?.description ?? '', amount: event.amount, balance: event.balance }));
  const remove = async (source: QseRow) => {
    if (!(await ensureSignedIn('Sign in to delete records.'))) return;
    if (source.kind === 'transfer') return confirmAndDeleteLinkable('qse', source.id, () => useWorkbookStore.getState().deleteTransfer(source.id));
    if (!(await confirmDialog('This cannot be undone.', 'Delete this ledger record?'))) return;
    const state = useWorkbookStore.getState();
    if (source.kind === 'trade') { const index = state.workbook.transactions.findIndex(row => row.id === source.id); if (index >= 0) state.deleteTransaction(index); }
    else { const index = state.workbook.adjustments.findIndex(row => row.id === source.id); if (index >= 0) state.deleteAdjustment(index); }
  };
  return <QseRecordCard dateSort={dateSort} title="Cash ledger" sectionProps={sectionProps} kind="ledger" rows={sources(filtered)} allRecords={sources(sorted)} modifying={modifying} onModify={() => setModifying(value => !value)} editRequest={editRequest} exportData={{ rows: exportRows(filtered), allRows: exportRows(sorted) }}>
    <div className="table-scroll"><table className="cash-ledger-table">
      <thead><tr><th aria-label="Details" /><dateSort.Th rows={dateSortInput}>Date</dateSort.Th><th>Type</th><th>Count</th><th>Unit</th><th>Price</th><th>Amount</th><th>Balance</th>{modifying && <th>Actions</th>}</tr></thead>
      <tbody>{page.rows.map((event, index) => {
        const source = sourceFor(event);
        const description = source?.description || source?.note;
        const info = description || `Fee: ${fmtMoney(event.fee, workbook.settings.currency)}`;
        const rowId = event.kind + (event.sourceId || index);
        const expanded = expandedId === rowId;
        return <Fragment key={rowId}><RecordRow market="qse" onEdit={(source) ? () => setEditRequest({ ...source }) : undefined}    record={{ source, ...event }} >
          <td><button type="button" className="cash-ledger-expand" aria-label={expanded ? 'Collapse details' : 'Expand details'} aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : rowId)}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button></td>
          <td><DateValue value={event.date} />{modifying && source && <QseReorder kind="ledger" row={source} rows={sources(filtered)} />}</td>
          <td className={event.kind === 'trade' ? event.action === 'BUY' ? 'pill-buy' : 'pill-sell' : undefined}>
            <span className="cash-ledger-type">{event.kind === 'trade' && <span className="cash-ledger-direction">{event.action === 'BUY' ? <ArrowRightIcon size={13} /> : <ArrowLeftIcon size={13} />}</span>}
              {event.kind === 'trade' ? event.action === 'BUY' ? 'Buy' : 'Sell' : event.kind === 'transfer' ? source?.description || (event.action === 'DEPOSIT' ? 'Deposit' : 'Withdrawal') : source?.note || (event.amount >= 0 ? 'Trading reward' : 'Adjustment')}
              <Tooltip text={info} />
            </span>
          </td>
          <td className="text-center">{event.kind === 'trade' ? fmt(source?.shares ?? 0, 0) : ''}</td>
          <td>{event.kind === 'trade' && event.ticker ? <span className="cash-ledger-unit"><TickerLogo ticker={event.ticker} size="sm" exchange="qse" /><Link to={`/stock/${event.ticker}`}>{tickerNames[event.ticker] ? shortenCompanyName(tickerNames[event.ticker]) : event.ticker}</Link></span> : <span className="cash-ledger-unit"><CashIcon size={19} />{workbook.settings.currency === 'QAR' ? 'Riyal' : workbook.settings.currency}</span>}</td>
          <td className="text-center">{event.kind === 'trade' ? fmtQSEPrice(source?.price ?? 0) : '-'}</td>
          <td className={event.amount >= 0 ? 'pill-positive' : 'pill-negative'}>{fmtMoney(event.amount, workbook.settings.currency)}</td>
          <td>{fmtMoney(event.balance, workbook.settings.currency)}</td>
          {modifying && <td>{source && <><IconButton label="Edit" icon={<EditIcon size={13} />} align="right" onClick={() => setEditRequest({ ...source })} /><IconButton label="Delete" icon={<TrashIcon size={13} />} align="right" onClick={() => remove(source)} /></>}</td>}

        </RecordRow>{expanded && <tr className="cash-ledger-details"><td colSpan={modifying ? 9 : 8}>{description && <div><strong>Description: </strong>{description}</div>}<div><strong>Fee: </strong>{fmtMoney(event.fee, workbook.settings.currency)}</div></td></tr>}</Fragment>;
      })}{!filtered.length && <tr><td colSpan={modifying ? 9 : 8} className="text-muted">Nothing recorded yet.</td></tr>}</tbody>
    </table></div>
    {page.controls}
  </QseRecordCard>;
}

export function TransactionsPage() {
  const workbook = useWorkbookStore(s => s.workbook);
  const tickers = useMemo(() => [...new Set([...workbook.transactions, ...workbook.dividends].map(row => row.ticker))].sort(), [workbook.transactions, workbook.dividends]);
  return (<QseFilterProvider tickers={tickers}>
    <div className="standard-page">
      <PageHeading back={<BackButton to="/qse">← QSE</BackButton>}><h1 className="pagetitle">Trade Transactions</h1></PageHeading>
      {/* User-reported (2026-08-28, real audit after "you're ignoring what's
         asked for"): the Transfers FAB used to live inside `TransfersSection`
         — content of the "Cash transfers" tab below, which `CollapsibleCard`
         doesn't even mount into the DOM until that specific tab is expanded
         (see `Card.tsx`: `{open && <div>{children}</div>}`, not a CSS hide).
         Since `TransfersFab` is a `position:fixed` floating button, that
         meant it silently didn't exist at all until the user happened to
         open that one tab — every other module has it always visible from
         page load. Moved to the page's own top level so it's mounted
         unconditionally, matching every other module. */}
      <TransfersFab />
      <StandardPageSections
        sections={[
          { key: 'add', label: 'Add trades', content: <TransactionRows /> },
          { key: 'list', label: 'Trade list', content: null, render: sectionProps => <TransactionList sectionProps={sectionProps} /> },
          { key: 'transfers', label: 'Cash transfers', content: null, render: sectionProps => <TransfersSection sectionProps={sectionProps} /> },
          { key: 'adjustments', label: 'Rewards & adjustments', content: null, render: sectionProps => <AdjustmentsSection sectionProps={sectionProps} /> },
          { key: 'ledger', label: 'Cash ledger', content: null, render: sectionProps => <CashLedgerSection sectionProps={sectionProps} /> },
          { key: 'dividends', label: 'Dividends', content: null, render: sectionProps => <DividendsSection sectionProps={sectionProps} /> },
        ]}
      />
    </div></QseFilterProvider>
  );
}
