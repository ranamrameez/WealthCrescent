import { SummaryChip } from '../../../components/StandardCard';
import { useActivePageSection } from '../../../hooks/useActivePageSection';
import { ProfitableStockAlert } from '../../../components/ProfitableStockAlert';
import { StarIcon, CalendarIcon, ChecklistIcon, ArchiveIcon, RestoreIcon } from '../../../components/icons';
import { ProfitableLotAlerts } from '../../../components/ProfitableLotAlerts';
import { PlanExecutionSummary } from '../../../components/PlanExecutionSummary';
import { DateValue } from '../../../components/DateValue';
import { ToggleChip } from '../../../components/ui/ToggleChip';
import { PageHeading } from '../../../components/PageHeading';
import { TopBarControls } from '../../../components/TopBarControls';
import { BackButton } from '../../../components/BackButton';
import { PriceInput } from "../../../components/ui/PriceInput";
import { Fragment, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StandardCard, type StandardCardAction } from '../../../components/StandardCard';
import { BatchEditGrid, type BatchColumn, type BatchChange } from '../../../components/BatchEditGrid';
import { TickerLogo } from '../../../components/TickerLogo';
import { QSE_TICKER_DATALIST_ID } from '../../../components/TickerDatalist';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { CheckIcon, EditIcon, PlusIcon, SaveIcon, TrashIcon } from '../../../components/icons';
import { toast } from '../../../components/Toast';
import { Notice } from '../../../components/Notice';
import { Modal } from '../../../components/Modal';
import { StatSourceBadge } from '../../../components/StatSourceBadge';
import { usePageFabActions } from '../../../hooks/usePageFabActions';
import { usePageTopBarChips, usePageTopBarRightSlot } from '../../../hooks/usePageTopBar';
import { Field, Select, TextInput } from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { useSortableRows } from '../../../hooks/useSortableRows';
import { hueStyle } from '../../../lib/statCardHues';
import { analyzeTradePlanByTicker, whatIfExit, type TradePlanTickerSummary } from '../../../lib/calc/tradePlanAnalysis';
import { breakEvenPrice } from '../../../lib/calc/fees';
import { getMarketPrice } from '../../../lib/calc/priceHistory';
import { strategyPositions } from '../../../lib/calc/strategyPositions';
import { computeAveragingScenario } from '../../../lib/calc/riskAnalysis';
import {
  computeLotAdvice,
  findMissedOpportunity,
  perShareCommission,
  sellableShareSummary,
  profitableLotTotals,
  type LotAdvice,
} from '../../../lib/calc/partialTradeStrategy';
import { fmt, fmtMoney, fmtQSEPrice } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { useAuthState } from '../../../lib/firebase/useAuthState';
import { useWorkbookStore } from '../../../store/workbookStore';
import type { Transaction, TradePlan, TradePlanLeg } from '../../../types/workbook';
import { useQSEDerived } from '../hooks/useQSEDerived';
import { useQSEStockData } from '../hooks/useQSEStockData';
import { gridAutoStyle } from '../../../lib/gridStyle';

const today = () => new Date().toISOString().slice(0, 10);

/** User-reported (2026-09-16): "a duplicate entry was added as OGDC" — a
 * freely-typed ticker on a new plan silently mismatched the ticker string
 * already used in real transaction history (whitespace/casing drift), so
 * the plan populated zero lots with no explanation. Reject on save instead
 * of accepting free text: valid means an exact match against the known
 * ticker list OR a ticker already used in this workbook's own real
 * transactions — the same universe already offered by the ticker
 * datalist, just enforced rather than merely suggested. */
function isKnownTicker(ticker: string, tickerNames: Record<string, string>, transactions: Transaction[]): boolean {
  return ticker in tickerNames || transactions.some((t) => t.ticker === ticker);
}

/** QSE's mirror of PSX's TradeStrategyPage — same shape, no same-day
 * netting concept (QSE's fee is a flat % with no commission-netting rule,
 * per `makeQSEFeeCalculator`), so no `FeeModeControl`/fee-scenario display
 * is needed here — just a plain optional fee-override input on a leg. */
function BuySellAvgDownCalculator() {
  const { workbook, calcFee, rows } = useQSEDerived();
  const currency = workbook.settings.currency;
  const feePct = workbook.settings.feePct;
  const tick = workbook.settings.tick;

  const [ticker, setTicker] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [shares, setShares] = useState('');
  const [targetSell, setTargetSell] = useState('');
  const [avgDown, setAvgDown] = useState(false);

  const held = rows.find((r) => r.ticker === ticker.trim().toUpperCase());
  const canAvgDown = !!held && held.shares > 0;

  const price = Number(buyPrice) || 0;
  const shareCount = Number(shares) || 0;
  const target = Number(targetSell) || 0;

  const perShare = price > 0 ? perShareCommission(price, calcFee) : null;

  const simpleCost = shareCount * price;
  const simpleFee = shareCount > 0 && price > 0 ? calcFee(simpleCost, true, { shares: shareCount }) : 0;
  const simpleBreakEven =
    shareCount > 0 && price > 0 ? breakEvenPrice(simpleCost + simpleFee, shareCount, feePct, tick, calcFee) : 0;
  const simpleTargetPL =
    shareCount > 0 && target > 0 ? whatIfExit(shareCount, (simpleCost + simpleFee) / shareCount, target, calcFee).pl : null;

  const scenario =
    avgDown && canAvgDown && shareCount > 0 && price > 0
      ? computeAveragingScenario(
          shareCount * price,
          price,
          held!.shares,
          held!.invested / held!.shares,
          target || price,
          feePct,
          tick,
          calcFee,
        )
      : null;

  return (
    <StandardCard title="Buy/Sell & Avg Down" defaultOpen>
      <p className="text-muted" style={{ marginBottom: 12 }}>
        Buy/Sell &amp; Avg Down, and Trade Planner &amp; Partial Trade — sketch out trades ahead of time, or get
        advice on lots you already hold. Every open position gets its own plan automatically.
      </p>
      <div className="row gap-sm mb-sm">
        <Field label="Ticker">
          <TextInput value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} list={QSE_TICKER_DATALIST_ID} placeholder="e.g. QIBK" />
        </Field>
        <Field label="Buy price">
          <PriceInput exchange="qse" type="number" step="0.001" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} />
        </Field>
        <Field label="Shares">
          <TextInput type="number" value={shares} onChange={(e) => setShares(e.target.value)} />
        </Field>
        <Field label="Target sell price (optional)">
          <PriceInput exchange="qse" type="number" step="0.001" value={targetSell} onChange={(e) => setTargetSell(e.target.value)} />
        </Field>
        <Field label=" ">
          <ToggleChip checked={avgDown} onChange={setAvgDown} label={`Average down: ${avgDown ? 'On' : 'Off'}`} />
        </Field>
      </div>

      {perShare && (
        <p className="text-muted mb-sm">
          Commission per share @ {fmtQSEPrice(price)}: Buy {fmtMoney(perShare.buy, currency)} · Sell {fmtMoney(perShare.sell, currency)}
        </p>
      )}

      {avgDown && !canAvgDown && <p className="text-muted mb-sm">Select a ticker with existing holdings to calculate averaging down.</p>}
      {avgDown && canAvgDown && (
        <Notice tone="warning" className="mb-sm">
          Averaging down increases your exposure to a losing position — it lowers your break-even, but only by
          committing more capital to a stock that's currently down. <Link to="/legal">Read more</Link>
        </Notice>
      )}

      {!avgDown && shareCount > 0 && price > 0 && (
        <div className="grid-auto" style={gridAutoStyle(160, 8)}>
          <div className="card stat-card" style={hueStyle('var(--accent)')}><div className="label">Cost</div><div className="value">{fmtMoney(simpleCost + simpleFee, currency)}</div></div>
          <div className="card stat-card" style={hueStyle('var(--gold)')}><div className="label">Break-even</div><div className="value">{fmtQSEPrice(simpleBreakEven)}</div></div>
          {simpleTargetPL !== null && (
            <div className="card stat-card" style={hueStyle('var(--accent)')}>
              <div className="label">P/L @ target</div>
              <div className={`value ${simpleTargetPL >= 0 ? 'pill-positive' : 'pill-negative'}`}>{fmtMoney(simpleTargetPL, currency)}</div>
            </div>
          )}
        </div>
      )}

      {avgDown && scenario && (
        <div className="grid-auto" style={gridAutoStyle(160, 8)}>
          <div className="card stat-card" style={hueStyle('var(--info)')}><div className="label">New shares</div><div className="value">{fmt(scenario.newShares, 0)} ({fmt(scenario.newShares - scenario.extraShares, 0)} + {fmt(scenario.extraShares, 0)})</div></div>
          <div className="card stat-card" style={hueStyle('var(--accent)')}><div className="label">New avg cost</div><div className="value">{fmtQSEPrice(scenario.newAvg)}</div></div>
          <div className="card stat-card" style={hueStyle('var(--gold)')}><div className="label">New break-even</div><div className="value">{fmtQSEPrice(scenario.breakEven)}</div></div>
          <div className="card stat-card" style={hueStyle('var(--accent)')}><div className="label">Recovery needed</div><div className="value">{scenario.recoveryNeededPct.toFixed(2)}%</div></div>
          <div className="card stat-card" style={hueStyle('var(--accent)')}>
            <div className="label">Net @ target</div>
            <div className={`value ${scenario.netAtTarget >= 0 ? 'pill-positive' : 'pill-negative'}`}>{fmtMoney(scenario.netAtTarget, currency)}</div>
          </div>
        </div>
      )}
    </StandardCard>
  );
}

function PartialTradeAdvisor({ ticker, onSellLot, onSellLots }: { ticker: string; onSellLot: (lot: LotAdvice) => void; onSellLots: (lots: LotAdvice[]) => void }) {
  const { workbook, calcFee, rows } = useQSEDerived();
  const currency = workbook.settings.currency;
  const feePct = workbook.settings.feePct;
  const tick = workbook.settings.tick;

  // 'lowestCostFirst' (2026-09-13): this page's own advice is meant to
  // concentrate the remaining position in the worst-performing lots —
  // oldest-first FIFO only does that by coincidence, and got it backwards
  // for a real reported case (see `LotMatchOrder`'s own doc comment).
  const { lotsByTicker } = useMemo(() => strategyPositions(workbook.transactions, calcFee), [workbook.transactions, calcFee]);
  const lots = lotsByTicker[ticker.toUpperCase()] || [];
  const row = rows.find((r) => r.ticker === ticker.toUpperCase());
  const currentPrice = row?.marketPrice || 0;
  const advice = computeLotAdvice(lots, calcFee, currentPrice, feePct, tick);
  type LotCol = 'buyDate' | 'buyPrice' | 'remainingShares' | 'costPerShare' | 'breakEven' | 'unrealizedPL' | 'suggestion';
  const { sorted: sortedAdvice, Th: LotTh } = useSortableRows(advice, (lot: LotAdvice, col: LotCol) => lot[col], 'buyDate', 'desc');


  // User-reported (2026-09-16): a plan's ticker with zero matching
  // transactions at all (e.g. a mismatched/mistyped ticker string) used to
  // render nothing here, with no explanation — reading exactly like "the
  // plan is broken" instead of "this ticker has no trades yet." Distinct
  // from the normal "0 open shares" case below (a real, fully-closed
  // position), which stays silent on purpose.
  const hasAnyTx = workbook.transactions.some((t) => t.ticker === ticker.toUpperCase());
  if (!hasAnyTx) {
    return (
      <Notice tone="warning" className="mb-sm">
        No transactions found for {ticker.toUpperCase()} yet — check the ticker is spelled exactly like your real
        trades (e.g. a stray space or different casing would cause this).
      </Notice>
    );
  }

  // User-reported (2026-09-13): "IQCD has no view in Partial Trade now
  // while shares 13, still exist." This guard used to require 2+ lots
  // (there's nothing to "concentrate into" with just one), but that meant
  // a ticker whose shares had genuinely collapsed into a single lot — the
  // exact outcome the 2026-09-13 FIFO-matching fix produces once it's
  // done its job — rendered completely blank instead of showing that
  // single lot's own status. Only a ticker with literally zero open
  // shares (or no price data) has nothing to show at all.
  if (!lots.length || currentPrice <= 0) return null;

  const { sellable, total } = sellableShareSummary(advice);
  const profitableTotals = profitableLotTotals(advice, currentPrice);

  return (
    <div style={{ marginBottom: 16 }}>
      {sellable > 0 ? (
        <ProfitableStockAlert sellable={sellable} total={total} price={currentPrice} {...profitableTotals} currency={currency} exchange="qse" onSell={() => onSellLots(advice.filter(lot => lot.suggestion === 'sell'))} />
      ) : (
        <p className="text-muted mb-sm">No lot of {ticker.toUpperCase()} is profitable at the current price ({fmtQSEPrice(currentPrice)}) yet.</p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr><LotTh col="buyDate">Buy date</LotTh><LotTh col="buyPrice">Buy price</LotTh><LotTh col="remainingShares">Shares</LotTh><LotTh col="costPerShare">Cost/share</LotTh><LotTh col="breakEven">Break-even</LotTh><LotTh col="unrealizedPL">Unrealized P/L</LotTh><LotTh col="suggestion">Suggestion</LotTh><th></th></tr>
          </thead>
          <tbody>
            {sortedAdvice.map((a, i) => (
              <tr key={i}>
                <td>{a.buyDate}</td>
                <td>{fmtQSEPrice(a.buyPrice)}</td>
                <td>{fmt(a.remainingShares, 0)}</td>
                <td>{fmtQSEPrice(a.costPerShare)}</td>
                <td>{fmtQSEPrice(a.breakEven)}</td>
                <td className={a.unrealizedPL >= 0 ? 'pill-positive' : 'pill-negative'}>{fmtMoney(a.unrealizedPL, currency)}</td>
                <td><span className={a.suggestion === 'sell' ? 'pill-positive' : 'text-muted'}>{a.suggestion === 'sell' ? 'Sell' : 'Hold'}</span></td>
                <td>{a.suggestion === 'sell' && <button className="btn secondary small" onClick={() => onSellLot(a)}>Sell this lot</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WhatIfExitCalculator({
  tickerAnalysis,
  calcFee,
  currency,
  currentPrices,
}: {
  tickerAnalysis: TradePlanTickerSummary[];
  calcFee: (amount: number, isBuy: boolean, context?: { shares?: number }) => number;
  currency: string;
  currentPrices: Record<string, number>;
}) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [sharesToSell, setSharesToSell] = useState<Record<string, number>>({});

  return (
    <div style={{ marginTop: 10 }}>
      <div className="text-muted" style={{ marginBottom: 8 }}>
        What if? Simulate selling a selected number of shares at a hypothetical exit price. The default shares are the
        position remaining after this plan's pending sells.
      </div>
      {tickerAnalysis.map((t) => {
        const price = prices[t.ticker] ?? currentPrices[t.ticker] ?? 0;
        const availableShares = Math.max(0, t.effectiveShares);
        const selectedShares = sharesToSell[t.ticker] ?? availableShares;
        const simulatedShares = Math.max(0, Math.min(selectedShares, availableShares));
        const result = whatIfExit(simulatedShares, t.avgCost, price, calcFee);
        const sharesAfter = availableShares - simulatedShares;
        const prePlanShares = t.effectiveShares + t.plannedSold;

        return (
          <div key={t.ticker} className="card" style={{ padding: 10, marginBottom: 8 }}>
            <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Ticker" width={90}>
                <div style={{ height: 32, display: 'flex', alignItems: 'center', fontWeight: 700 }}>{t.ticker}</div>
              </Field>
              <Field label="Exit price" width={110}>
                <PriceInput exchange="qse"
                  type="number"
                  step="0.001"
                  value={price || ''}
                  onChange={(e) => setPrices((p) => ({ ...p, [t.ticker]: Number(e.target.value) }))}
                />
              </Field>
              <Field label="Shares to sell" width={120} title={`Maximum ${fmt(availableShares, 0)} shares — the position remaining after this plan's pending sells.`}>
                <TextInput
                  type="number"
                  step="1"
                  min={0}
                  max={availableShares}
                  value={selectedShares || ''}
                  onChange={(e) => setSharesToSell((shares) => ({ ...shares, [t.ticker]: Math.max(0, Number(e.target.value)) }))}
                />
              </Field>
              <div className="text-muted" style={{ fontSize: 12, paddingBottom: 7 }}>
                Available after planned sells: <strong>{fmt(availableShares, 0)} sh</strong>
                {t.plannedSold > 0 && <> · Before planned sells: <strong>{fmt(prePlanShares, 0)} sh</strong> · Planned sells: <strong>{fmt(t.plannedSold, 0)} sh</strong></>}
              </div>
            </div>

            {price > 0 && simulatedShares > 0 ? (
              <div className="grid-auto" style={{ ...gridAutoStyle(150, 8), marginTop: 8 }}>
                <div className="stat-card card" style={hueStyle('var(--accent)')}>
                  <div className="label">Sale proceeds</div>
                  <div className="value">{fmtMoney(result.proceeds, currency)}</div>
                </div>
                <div className="stat-card card" style={hueStyle('var(--accent)')}>
                  <div className="label">P/L on selected shares</div>
                  <div className={`value ${result.pl >= 0 ? 'pill-positive' : 'pill-negative'}`}>{fmtMoney(result.pl, currency)}</div>
                </div>
                <div className="stat-card card" style={hueStyle('var(--accent)')}>
                  <div className="label">Shares after simulation</div>
                  <div className="value">{fmt(sharesAfter, 0)}</div>
                </div>
              </div>
            ) : (
              <p className="text-muted mb-0 mt-sm">Enter an exit price and shares to see the simulated sale impact.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
function NewPlanFab() {
  const addTradePlan = useWorkbookStore((s) => s.addTradePlan);
  const transactions = useWorkbookStore((s) => s.workbook.transactions);
  const { tickerNames } = useQSEStockData();
  const ensureSignedIn = useEnsureSignedIn();
  const [open, setOpen] = useState(false);
  usePageFabActions('qse-trade-plan', useMemo(() => [{ label: 'Add plan', icon: <PlusIcon size={18} />, onClick: () => setOpen(true) }], []));
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [ticker, setTicker] = useState('');
  const [legs, setLegs] = useState<Omit<TradePlanLeg, 'ticker'>[]>([{ date: today(), action: 'BUY', shares: 0, price: 0 }]);

  const update = (i: number, patch: Partial<TradePlanLeg>) =>
    setLegs((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const reset = () => {
    setName('');
    setNotes('');
    setTicker('');
    setLegs([{ date: today(), action: 'BUY', shares: 0, price: 0 }]);
  };

  const save = async () => {
    const valid = legs.filter((l) => l.shares > 0 && l.price > 0);
    if (!name.trim()) return toast('Give this plan a name.');
    if (!ticker.trim()) return toast('Pick a ticker for this plan.');
    if (!valid.length) return toast('Add at least one complete leg (shares, price).');
    const tickerUpper = ticker.trim().toUpperCase();
    if (!isKnownTicker(tickerUpper, tickerNames, transactions)) {
      return toast(`"${tickerUpper}" isn't a recognized ticker — pick one from the suggestion list.`);
    }
    if (!(await ensureSignedIn('Sign in to save trade plans.'))) return;
    const plan: TradePlan = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: today(),
      notes: notes.trim() || undefined,
      legs: valid.map((l) => ({ ...l, ticker: tickerUpper })),
      defaultTicker: tickerUpper,
    };
    addTradePlan(plan);
    toast(`Saved plan "${plan.name}" with ${valid.length} leg${valid.length > 1 ? 's' : ''}.`);
    reset();
    setOpen(false);
  };

  return (
    <>
      {open && (
        <Modal title="New trade plan" onClose={() => { reset(); setOpen(false); }}>
          <div className="row gap-sm mb-sm">
            <Field label="Plan name" width={220}>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 QIBK rotation" />
            </Field>
            <Field label="Notes (optional)" width={280}>
              <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Field label="Ticker" width={140} title="Every leg in this plan is for this one ticker.">
              <TextInput value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} list={QSE_TICKER_DATALIST_ID} placeholder="e.g. QIBK" />
            </Field>
          </div>
          {legs.map((l, i) => (
            <div key={i} className="row gap-sm mb-sm">
              <input type="date" value={l.date} onChange={(e) => update(i, { date: e.target.value })} />
              <select value={l.action} onChange={(e) => update(i, { action: e.target.value as 'BUY' | 'SELL' })}>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
              <input type="number" placeholder="Shares" value={l.shares || ''} onChange={(e) => update(i, { shares: Number(e.target.value) })} className="w-90" />
              <PriceInput exchange="qse" type="number" step="0.001" placeholder="Price" value={l.price || ''} onChange={(e) => update(i, { price: Number(e.target.value) })} className="w-90" />
              <button className="btn secondary small" onClick={() => setLegs((rs) => rs.filter((_, idx) => idx !== i))}>
                <TrashIcon size={12} />Remove
              </button>
            </div>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn secondary" onClick={() => setLegs((rs) => [...rs, { date: today(), action: 'BUY', shares: 0, price: 0 }])}>
              <PlusIcon />Add leg
            </button>
            <button className="btn" onClick={save}><SaveIcon />Save plan</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function PlanCard({ plan, open, onToggle }: { plan: TradePlan; open?: boolean; onToggle?: (open: boolean) => void }) {
  const updateTradePlan = useWorkbookStore((s) => s.updateTradePlan);
  const deleteTradePlan = useWorkbookStore((s) => s.deleteTradePlan);
  const executeTradePlanLeg = useWorkbookStore((s) => s.executeTradePlanLeg);
  const setMarketPrice = useWorkbookStore((s) => s.setMarketPrice);
  const ensureSignedIn = useEnsureSignedIn();
  const { workbook, calcFee, rows, positions } = useQSEDerived();
  const { tickerNames } = useQSEStockData();
  const currency = workbook.settings.currency;

  // Phase 3 delete-guard: a plan for a ticker you still hold shares of
  // can't be deleted outright — it's the home for that ticker's own
  // Partial Trade advice and any not-yet-executed "Sell this lot" legs.
  // "Clear plan" (remove every leg) stays available regardless. Also the
  // ticker passed to `analyzeTradePlanByTicker` as `extraTicker` so a
  // freshly auto-created, still-empty plan shows its own current-status
  // stats right away instead of only once a leg exists.
  const guardTicker = plan.defaultTicker || plan.legs[0]?.ticker || '';
  const hasOpenShares = (rows.find((r) => r.ticker === guardTicker)?.shares || 0) > 0;
  const currentPlanDate = today();
  useEffect(() => {
    if (!plan.legs.some((leg) => !leg.executed && !leg.ignored && leg.date !== currentPlanDate)) return;
    updateTradePlan(plan.id, {
      legs: plan.legs.map((leg) => (leg.executed || leg.ignored) ? leg : { ...leg, date: currentPlanDate }),
    });
  }, [currentPlanDate, plan.id, plan.legs, updateTradePlan]);

  const planLots = useMemo(
    () => strategyPositions(workbook.transactions, calcFee).lotsByTicker[guardTicker.toUpperCase()] || [],
    [workbook.transactions, calcFee, guardTicker],
  );
  const missedOpportunity = useMemo(() => guardTicker
    ? findMissedOpportunity(workbook.priceHistory[guardTicker.toUpperCase()] || [], planLots, calcFee)
    : null, [guardTicker, workbook.priceHistory, planLots, calcFee]);
  const [showMissedOpportunities, setShowMissedOpportunities] = useState(false);

  const calcLegFee = useCallback((leg: TradePlanLeg) =>
    leg.feeOverride !== undefined ? leg.feeOverride : calcFee(leg.shares * leg.price, leg.action === 'BUY', { shares: leg.shares }), [calcFee]);
  const resolveExecutedTx = (leg: TradePlanLeg): Transaction | null =>
    leg.executedTransactionId ? (workbook.transactions.find((t) => t.id === leg.executedTransactionId) ?? null) : null;
  const legFee = (leg: TradePlanLeg): number => {
    if (leg.executed) {
      const tx = resolveExecutedTx(leg);
      if (tx) return calcFee(tx.shares * tx.price, tx.action === 'BUY', { shares: tx.shares, tx });
    }
    return calcLegFee(leg);
  };

  const updateTransaction = useWorkbookStore((s) => s.updateTransaction);
  const [linkingLegIndex, setLinkingLegIndex] = useState<number | null>(null);
  const [linkChoice, setLinkChoice] = useState('');
  const candidateTxsFor = (ticker: string): Transaction[] => workbook.transactions.filter((t) => t.ticker === ticker && t.id);
  const confirmLink = (i: number) => {
    if (!linkChoice) return;
    updateTradePlan(plan.id, { legs: plan.legs.map((l, idx) => (idx === i ? { ...l, executedTransactionId: linkChoice } : l)) });
    toast('Linked to that transaction — its live data will show here from now on.');
    setLinkingLegIndex(null);
    setLinkChoice('');
  };

  const [editingTxLegIndex, setEditingTxLegIndex] = useState<number | null>(null);
  const [editTxRow, setEditTxRow] = useState<Transaction | null>(null);
  const startEditTx = (i: number, tx: Transaction) => {
    setEditingTxLegIndex(i);
    setEditTxRow({ ...tx });
  };
  const saveEditTx = () => {
    if (editingTxLegIndex === null || !editTxRow) return;
    const idx = workbook.transactions.findIndex((t) => t.id === editTxRow.id);
    if (idx < 0) {
      toast('Could not find that transaction — it may have been deleted.');
      return;
    }
    updateTransaction(idx, editTxRow);
    toast('Transaction updated.');
    setEditingTxLegIndex(null);
    setEditTxRow(null);
  };

  const tickerAnalysis = useMemo(() => analyzeTradePlanByTicker(plan.legs, rows, calcFee, workbook.settings.feePct, workbook.settings.tick, calcLegFee, guardTicker || undefined), [plan.legs, rows, calcFee, workbook.settings.feePct, workbook.settings.tick, calcLegFee, guardTicker]);

  const [editingMeta, setEditingMeta] = useState(false);
  const [name, setName] = useState(plan.name);
  const [notes, setNotes] = useState(plan.notes || '');
  const [planTicker, setPlanTicker] = useState(plan.defaultTicker || plan.legs[0]?.ticker || '');
  const [editLegIndex, setEditLegIndex] = useState<number | null>(null);
  const [editLeg, setEditLeg] = useState<TradePlanLeg | null>(null);
  const [addingLeg, setAddingLeg] = useState<Omit<TradePlanLeg, 'ticker'> | null>(null);
  const [batchEditingLegs, setBatchEditingLegs] = useState(false);
  // Trust-restoration (2026-09-16): the user's own original request,
  // restored — a real toggle between the OFFICIAL numbers (what a broker
  // statement would show) and the ADVISORY Strategic Trades view, so both
  // are directly comparable without leaving this card. Defaults to Broker
  // Style — the real, trustworthy figure first.

  const addLeg = () => {
    if (!addingLeg || !addingLeg.shares || !addingLeg.price) return toast('Fill in shares and price first.');
    updateTradePlan(plan.id, { legs: [...plan.legs, { ...addingLeg, ticker: plan.defaultTicker || planTicker }] });
    toast('Leg added to plan.');
    setAddingLeg(null);
  };

  const saveMeta = () => {
    const tickerUpper = planTicker.trim().toUpperCase();
    if (!tickerUpper) return toast('This plan needs a ticker.');
    if (!isKnownTicker(tickerUpper, tickerNames, workbook.transactions)) {
      return toast(`"${tickerUpper}" isn't a recognized ticker — pick one from the suggestion list.`);
    }
    updateTradePlan(plan.id, {
      name: name.trim() || plan.name,
      notes: notes.trim() || undefined,
      defaultTicker: tickerUpper,
      legs: plan.legs.map((l) => (l.executed ? l : { ...l, ticker: tickerUpper })),
    });
    setEditingMeta(false);
  };

  const startEditLeg = (i: number) => {
    setEditLegIndex(i);
    setEditLeg({ ...plan.legs[i] });
  };
  const saveLeg = () => {
    if (editLegIndex === null || !editLeg) return;
    updateTradePlan(plan.id, { legs: plan.legs.map((l, i) => (i === editLegIndex ? editLeg : l)) });
    setEditLegIndex(null);
    setEditLeg(null);
  };
  const removeLeg = async (i: number) => {
    const leg = plan.legs[i];
    const ok = await confirmDialog('This only removes it from the plan, not from your transaction history.', `Remove ${leg.action} ${leg.shares} ${leg.ticker} from this plan?`);
    if (!ok) return;
    updateTradePlan(plan.id, { legs: plan.legs.filter((_, idx) => idx !== i) });
  };
  const markDone = async (i: number) => {
    const leg = plan.legs[i];
    const ok = await confirmDialog(`Add ${leg.action} ${fmt(leg.shares, 0)} ${leg.ticker} @ ${fmtQSEPrice(leg.price)} to your transaction history? This can't be undone from here.`, 'Mark leg as done?');
    if (!ok) return;
    if (!(await ensureSignedIn('Sign in to record this transaction.'))) return;
    executeTradePlanLeg(plan.id, i);
    toast('Logged to transaction history.');
  };

  const resolvedLegValues = (leg: TradePlanLeg): { date: string; ticker: string; action: 'BUY' | 'SELL'; shares: number; price: number } => {
    const tx = leg.executed ? resolveExecutedTx(leg) : null;
    if (tx) return tx;
    return { date: leg.date || today(), ticker: leg.ticker, action: leg.action, shares: leg.shares, price: leg.price };
  };

  const doneCount = plan.legs.filter((l) => l.executed).length;
  const totalBuy = plan.legs.filter(l => !l.ignored).reduce((s, l) => { const v = resolvedLegValues(l); return s + (v.action === 'BUY' ? v.shares * v.price : 0); }, 0);
  const totalSell = plan.legs.filter(l => !l.ignored).reduce((s, l) => { const v = resolvedLegValues(l); return s + (v.action === 'SELL' ? v.shares * v.price : 0); }, 0);
  const brokerRow = rows.find((row) => row.ticker === guardTicker);
  const realizedPL = positions.find(position => position.ticker === guardTicker)?.realized ?? 0;
  const holdingsPrice = brokerRow?.marketPrice || getMarketPrice(guardTicker, workbook.marketPrices, workbook.transactions);
  const roundTrip = holdingsPrice > 0 ? perShareCommission(holdingsPrice, calcFee) : null;
  const brokerAvg = brokerRow && brokerRow.shares > 0 ? brokerRow.invested / brokerRow.shares : 0;
  const brokerBE = brokerRow && brokerRow.shares > 0 ? breakEvenPrice(brokerRow.invested, brokerRow.shares, workbook.settings.feePct, workbook.settings.tick, calcFee) : 0;
  const strategicRow = tickerAnalysis.find((row) => row.ticker === guardTicker) ?? tickerAnalysis[0];

  type LegRow = { leg: TradePlanLeg; originalIndex: number };
  const legRows: LegRow[] = plan.legs.map((leg, originalIndex) => ({ leg, originalIndex }));
  type LegCol = 'date' | 'ticker' | 'action' | 'shares' | 'price' | 'amount' | 'fee' | 'status';
  const legSortValue = (r: LegRow, col: LegCol): number | string => {
    const v = resolvedLegValues(r.leg);
    switch (col) {
      case 'ticker': return v.ticker;
      case 'action': return v.action;
      case 'shares': return v.shares;
      case 'price': return v.price;
      case 'amount': return v.shares * v.price;
      case 'fee': return legFee(r.leg);
      case 'status': return r.leg.ignored ? 2 : r.leg.executed ? 1 : 0;
      default: return v.date || '';
    }
  };
  const { sorted: sortedLegRows, Th: LegTh } = useSortableRows(legRows, legSortValue, 'price', 'desc');

  const cardActions: StandardCardAction[] = [
    {
      label: 'Edit plan',
      icon: <EditIcon size={14} />,
      onClick: () => {
        setName(plan.name);
        setNotes(plan.notes || '');
        setPlanTicker(guardTicker);
        setEditingMeta(true);
      },
    },
    ...(!plan.isDefault && guardTicker ? [{
      label: 'Make default',
      icon: <StarIcon size={14} />,
      onClick: () => {
        const state = useWorkbookStore.getState();
        for (const other of state.workbook.tradePlans) {
          if (other.id !== plan.id && (other.defaultTicker || other.legs[0]?.ticker) === guardTicker && other.isDefault) {
            state.updateTradePlan(other.id, { isDefault: false });
          }
        }
        state.updateTradePlan(plan.id, { isDefault: true });
      },
    }] : []),
    ...(missedOpportunity ? [{
      label: 'Recent missed opportunities',
      icon: <CalendarIcon size={14} />,
      onClick: () => setShowMissedOpportunities(true),
    }] : []),
    ...(doneCount > 0 ? [{
      label: 'Clear executed trades',
      icon: <ArchiveIcon size={14} />,
      onClick: () => {
        void (async () => {
          const ok = await confirmDialog(
            'This removes executed rows from this plan only. Their linked transactions remain in transaction history.',
            `Clear ${doneCount} executed trade${doneCount === 1 ? '' : 's'} from "${plan.name}"?`,
          );
          if (ok) updateTradePlan(plan.id, { legs: plan.legs.filter((leg) => !leg.executed) });
        })();
      },
    }] : []),
    ...(plan.legs.length > 0 ? [{
      label: 'Batch edit planned legs',
      icon: <ChecklistIcon size={14} />,
      onClick: () => setBatchEditingLegs(true),
    }] : []),
    ...(plan.legs.length > 0 ? [{
      label: 'Clear plan',
      icon: <RestoreIcon size={14} />,
      onClick: () => {
        void (async () => {
          const ok = await confirmDialog(
            'This removes every leg from the plan for a fresh start — the plan itself, its name/notes, and any transactions already logged from marking a leg done are untouched.',
            `Clear all legs from "${plan.name}"?`,
          );
          if (ok) updateTradePlan(plan.id, { legs: [] });
        })();
      },
    }] : []),
    {
      label: 'Delete plan',
      icon: <TrashIcon size={14} />,
      disabled: hasOpenShares && !!plan.isDefault,
      tone: 'danger',
      onClick: () => {
        void (async () => {
          const ok = await confirmDialog(
            'This deletes the plan itself, not any transactions already logged from it.',
            `Delete plan "${plan.name}"?`,
          );
          if (ok) deleteTradePlan(plan.id);
        })();
      },
    },
  ];
  const addLotToPlan = (lot: LotAdvice) => {
    const row = rows.find((r) => r.ticker === guardTicker);
    const price = row?.marketPrice || lot.breakEven;
    updateTradePlan(plan.id, {
      legs: [...plan.legs, { date: today(), action: 'SELL', ticker: guardTicker, shares: lot.remainingShares, price, targetLotBuyId: lot.buyId }],
    });
    toast(`Added SELL ${fmt(lot.remainingShares, 0)} ${guardTicker} @ ${fmtQSEPrice(price)} to this plan.`);
  };

  const addProfitableLotsToPlan = async (lots: LotAdvice[]) => {
    if (!(await ensureSignedIn('Sign in to update trade plans.'))) return;
    const current = useWorkbookStore.getState().workbook.tradePlans.find(item => item.id === plan.id);
    if (!current) return;
    const legs = lots.flatMap(lot => {
      const alreadyPlanned = current.legs.filter(leg => !leg.executed && !leg.ignored && leg.action === 'SELL' && leg.ticker === guardTicker && leg.targetLotBuyId === lot.buyId).reduce((sum, leg) => sum + leg.shares, 0);
      const shares = Math.max(0, lot.remainingShares - alreadyPlanned);
      return shares > 0 ? [{ date: today(), action: 'SELL' as const, ticker: guardTicker, shares, price: holdingsPrice, targetLotBuyId: lot.buyId }] : [];
    });
    if (!legs.length) { toast('Profitable shares are already planned.'); return; }
    updateTradePlan(plan.id, { legs: [...current.legs, ...legs] });
    toast('Added profitable shares to planned trades.');
  };

  const bodyContent = open ? (
    <>
      {editingMeta && (
        <div className="row mb-sm" style={{ gap: 8 }}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
          <TextInput value={planTicker} onChange={(e) => setPlanTicker(e.target.value.toUpperCase())} list={QSE_TICKER_DATALIST_ID} placeholder="Ticker" className="w-100" />
          <button className="btn secondary small" onClick={saveMeta}><SaveIcon size={12} />Save</button>
          <button className="btn secondary small" onClick={() => setEditingMeta(false)}>Cancel</button>
        </div>
      )}
      <div className="grid-auto mb-sm" style={gridAutoStyle(260, 8)}>
        <div className="card stat-card">
          <div className="label">Current Holdings <StatSourceBadge source="official" /></div>
          <div className="value">Avg {brokerAvg > 0 ? fmtQSEPrice(brokerAvg) : '—'} · BE {brokerBE > 0 ? fmtQSEPrice(brokerBE) : '—'} <span className="shares-box">{fmt(brokerRow?.shares || 0, 0)}</span></div>
          <div className="sub">Value {brokerRow ? fmtMoney(brokerRow.value, currency) : '\u2014'} {'\u00b7'} <span className={`pill ${realizedPL >= 0 ? 'pill-positive' : 'pill-negative'}`}>Realized P/L {fmtMoney(realizedPL, currency)}</span></div>
          {guardTicker && <div className="holdings-price-section plan-execution-split" onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
            <div className="label">Current Price</div>
            <div className="holdings-price-row"><PriceInput exchange="qse" aria-label={`Current price for ${guardTicker}`} key={holdingsPrice} type="number" step="0.001" className="price-input w-96" defaultValue={holdingsPrice || ''} placeholder="—" onKeyDown={async event=>{if(event.key==='Enter'){const target=event.currentTarget;const value=parseFloat(target.value)||0;if(value>0 && await ensureSignedIn('Sign in to save price updates.')){setMarketPrice(guardTicker,value);toast(`${guardTicker} price saved: ${fmtQSEPrice(value)}`);}target.blur();}}} />
            <div className="holdings-roundtrip">
            <span className="holdings-rtc" title="Buy and sell commission per share">RTC {roundTrip ? '+'+fmtQSEPrice(roundTrip.buy+roundTrip.sell) : '—'}</span>
            <span title="Current price plus buy and sell commission per share">RT {roundTrip ? fmtQSEPrice(holdingsPrice+roundTrip.buy+roundTrip.sell) : '—'}</span>
            </div>
            <span className={`pill ${(brokerRow?.profit ?? 0) >= 0 ? 'pill-positive' : 'pill-negative'}`}>Unrealized P/L {brokerRow ? fmtMoney(brokerRow.profit, currency) : '\u2014'}</span>
            </div>
          </div>}
        </div>
        <div className="card stat-card">
          <div className="label">Planned Strategic Trades <StatSourceBadge source="advisory" /></div>
          <div className="value">Avg {strategicRow?.avgCost ? fmtQSEPrice(strategicRow.avgCost) : '—'} · BE {strategicRow?.breakEven ? fmtQSEPrice(strategicRow.breakEven) : '—'} <span className="shares-box">{fmt(strategicRow?.effectiveShares ?? 0, 0)}</span></div>
          {strategicRow && <PlanExecutionSummary analysis={[strategicRow]} exchange="qse" currency={currency} compact calcFee={calcFee} marketPrices={{ ...workbook.marketPrices, ...Object.fromEntries(rows.map(row => [row.ticker, row.marketPrice])) }} realizedByTicker={Object.fromEntries(positions.map(position => [position.ticker, position.realized]))} />}
        </div>
      </div>



      {tickerAnalysis.some(row => row.ticker !== strategicRow?.ticker) && <PlanExecutionSummary analysis={tickerAnalysis.filter(row => row.ticker !== strategicRow?.ticker)} exchange="qse" currency={currency} calcFee={calcFee} marketPrices={{ ...workbook.marketPrices, ...Object.fromEntries(rows.map(row => [row.ticker, row.marketPrice])) }} realizedByTicker={Object.fromEntries(positions.map(position => [position.ticker, position.realized]))} />}


      <h3 className="mb-sm">Planned Trades</h3>
      {planLots.length > 1 && (
        <Notice tone="warning" className="mb-sm">
          Partial Trade Strategy concentrates your remaining position in your worst-performing lots — you keep
          holding whatever doesn't sell. <Link to="/legal">Read more</Link>
        </Notice>
      )}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <LegTh col="date">Date</LegTh><LegTh col="ticker">Ticker</LegTh><LegTh col="action">Action</LegTh>
              <LegTh col="shares">Shares</LegTh><LegTh col="price">Price</LegTh><LegTh col="amount">Amount</LegTh>
              <LegTh col="fee">Est. fee</LegTh><LegTh col="status">Status</LegTh><th></th>
            </tr>
          </thead>
          <tbody>
            {sortedLegRows.map(({ leg, originalIndex: i }) => {
              if (editLegIndex === i && editLeg) return (
                <tr key={i}>
                  <td><input type="date" value={editLeg.date} onChange={(e) => setEditLeg({ ...editLeg, date: e.target.value })} className="w-130" /></td>
                  <td>{editLeg.ticker}</td>
                  <td>
                    <select value={editLeg.action} onChange={(e) => setEditLeg({ ...editLeg, action: e.target.value as 'BUY' | 'SELL' })}>
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </td>
                  <td><input type="number" value={editLeg.shares} onChange={(e) => setEditLeg({ ...editLeg, shares: Number(e.target.value) })} className="w-70" /></td>
                  <td><PriceInput exchange="qse" type="number" step="0.001" value={editLeg.price} onChange={(e) => setEditLeg({ ...editLeg, price: Number(e.target.value) })} className="w-80" /></td>
                  <td>{fmtMoney(editLeg.shares * editLeg.price, currency)}</td>
                  <td>
                    <input
                      type="number"
                      step="0.001"
                      className="price-input"
                      placeholder="auto"
                      title="Leave blank to compute automatically, or type an exact fee from your statement."
                      value={editLeg.feeOverride ?? ''}
                      onChange={(e) => setEditLeg({ ...editLeg, feeOverride: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                  </td>
                  <td></td>
                  <td>
                    <button className="btn secondary small" onClick={saveLeg}><SaveIcon size={12} />Save</button>{' '}
                    <button className="btn secondary small" onClick={() => setEditLegIndex(null)}>Cancel</button>
                  </td>
                </tr>
              );

              if (editingTxLegIndex === i && editTxRow) return (
                <tr key={i}>
                  <td><input type="date" value={editTxRow.date} onChange={(e) => setEditTxRow({ ...editTxRow, date: e.target.value })} className="w-130" /></td>
                  <td>{editTxRow.ticker}</td>
                  <td>
                    <select value={editTxRow.action} onChange={(e) => setEditTxRow({ ...editTxRow, action: e.target.value as 'BUY' | 'SELL' })}>
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </td>
                  <td><input type="number" value={editTxRow.shares} onChange={(e) => setEditTxRow({ ...editTxRow, shares: Number(e.target.value) })} className="w-70" /></td>
                  <td><PriceInput exchange="qse" type="number" step="0.001" value={editTxRow.price} onChange={(e) => setEditTxRow({ ...editTxRow, price: Number(e.target.value) })} className="w-80" /></td>
                  <td>{fmtMoney(editTxRow.shares * editTxRow.price, currency)}</td>
                  <td>{fmtMoney(calcFee(editTxRow.shares * editTxRow.price, editTxRow.action === 'BUY', { shares: editTxRow.shares, tx: editTxRow }), currency)}</td>
                  <td><span className="pill-positive">Executed</span></td>
                  <td>
                    <button className="btn secondary small" onClick={saveEditTx}><SaveIcon size={12} />Save</button>{' '}
                    <button className="btn secondary small" onClick={() => { setEditingTxLegIndex(null); setEditTxRow(null); }}>Cancel</button>
                  </td>
                </tr>
              );

              const linkedTx = leg.executed ? resolveExecutedTx(leg) : null;
              const display = linkedTx ?? leg;
              const stale = leg.executed && !linkedTx;
              return (
                <Fragment key={i}>
                  <tr style={(leg.executed || leg.ignored) ? { opacity: 0.6, borderLeft: '3px solid var(--profit)' } : { borderLeft: '3px solid transparent' }}>
                    <td><DateValue value={display.date} />{stale && <span style={{ color: 'var(--warn)' }} title="No linked transaction found — showing the plan's original snapshot."> ⚠</span>}</td>
                    <td style={{ display: 'flex', alignItems: 'center', gap: 4 }}><TickerLogo ticker={display.ticker} exchange="qse" size="sm" />{display.ticker}</td>
                    <td className={display.action === 'BUY' ? 'pill-buy' : 'pill-sell'}>{display.action}</td>
                    <td>{fmt(display.shares, 0)}</td>
                    <td>{fmtQSEPrice(display.price)}</td>
                    <td>{fmtMoney(display.shares * display.price, currency)}</td>
                    <td>{fmtMoney(legFee(leg), currency)}</td>
                    <td>
                      {leg.executed ? (
                        linkedTx ? <span className="pill-positive" title="Synced with its transaction — edit it below or from the Transactions page.">Executed</span> : <span className="pill-negative">Executed (unlinked)</span>
                      ) : (
                        <span className="text-muted">{leg.ignored ? 'Ignored' : 'Planned'}</span>
                      )}
                    </td>
                    <td>
                      {!leg.executed && (
                        <>
                          <IconButton label="Edit" icon={<EditIcon size={13} />} align="right" onClick={() => startEditLeg(i)} />{' '}
                          {!leg.ignored && <button className="btn secondary small" onClick={() => markDone(i)}><CheckIcon size={12} />Execute</button>}{' '}
                          <button className="btn secondary small" onClick={async () => { if (await ensureSignedIn('Sign in to update trade plans.')) updateTradePlan(plan.id, { legs: plan.legs.map((item, index) => index === i ? { ...item, ignored: !item.ignored } : item) }); }}>{leg.ignored ? 'Restore' : 'Ignore'}</button>{' '}
                          <button className="btn secondary small" onClick={() => removeLeg(i)}><TrashIcon size={12} />Remove</button>
                        </>
                      )}
                      {leg.executed && linkedTx && <IconButton label="Edit" icon={<EditIcon size={13} />} align="right" onClick={() => startEditTx(i, linkedTx)} />}
                      {stale && <button className="btn secondary small" onClick={() => setLinkingLegIndex(linkingLegIndex === i ? null : i)}>Link…</button>}
                    </td>
                  </tr>
                  {linkingLegIndex === i && (
                    <tr>
                      <td colSpan={9} style={{ padding: 0 }}>
                        <Notice tone="warning" style={{ margin: '4px 0' }}>
                          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                            <span>Pick the transaction this leg actually corresponds to:</span>
                            <select value={linkChoice} onChange={(e) => setLinkChoice(e.target.value)}>
                              <option value="">— Select a transaction —</option>
                              {candidateTxsFor(leg.ticker).map((t) => (
                                <option key={t.id} value={t.id}>{t.date} · {t.action} {fmt(t.shares, 0)} @ {fmtQSEPrice(t.price)}</option>
                              ))}
                            </select>
                            <button className="btn secondary small" disabled={!linkChoice} onClick={() => confirmLink(i)}>Confirm link</button>
                            <button className="btn secondary small" onClick={() => { setLinkingLegIndex(null); setLinkChoice(''); }}>Cancel</button>
                          </div>
                        </Notice>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!plan.legs.length && (<tr><td colSpan={9} className="text-muted">No legs left in this plan.</td></tr>)}
            {addingLeg && (
              <tr>
                <td><input type="date" value={addingLeg.date} onChange={(e) => setAddingLeg({ ...addingLeg, date: e.target.value })} className="w-130" /></td>
                <td>{plan.defaultTicker || planTicker}</td>
                <td>
                  <select value={addingLeg.action} onChange={(e) => setAddingLeg({ ...addingLeg, action: e.target.value as 'BUY' | 'SELL' })}>
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </td>
                <td><input type="number" placeholder="Shares" value={addingLeg.shares || ''} onChange={(e) => setAddingLeg({ ...addingLeg, shares: Number(e.target.value) })} className="w-70" /></td>
                <td><PriceInput exchange="qse" type="number" step="0.001" placeholder="Price" value={addingLeg.price || ''} onChange={(e) => setAddingLeg({ ...addingLeg, price: Number(e.target.value) })} className="w-80" /></td>
                <td>{fmtMoney(addingLeg.shares * addingLeg.price, currency)}</td>
                <td>
                  <input
                    type="number"
                    step="0.001"
                    className="price-input"
                    placeholder="auto"
                    title="Leave blank to compute automatically, or type an exact fee from your statement."
                    value={addingLeg.feeOverride ?? ''}
                    onChange={(e) => setAddingLeg({ ...addingLeg, feeOverride: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </td>
                <td></td>
                <td>
                  <button className="btn secondary small" onClick={addLeg}><SaveIcon size={12} />Add</button>{' '}
                  <button className="btn secondary small" onClick={() => setAddingLeg(null)}>Cancel</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row gap-sm mt-sm mb-sm" style={{ alignItems: 'center' }}>
        {!addingLeg && <button type="button" className="btn secondary small" onClick={() => setAddingLeg({ date: today(), action: 'BUY', shares: 0, price: 0 })}><PlusIcon size={12} />Add leg</button>}
        <SummaryChip label="Planned buys" value={fmtMoney(totalBuy, currency)} />
        <SummaryChip label="Planned sells" value={fmtMoney(totalSell, currency)} />
        {tickerAnalysis.some(summary => summary.plannedSold > 0) && <SummaryChip label="Pending sell P/L" value={fmtMoney(tickerAnalysis.reduce((sum, summary) => sum + summary.realizedPL, 0), currency)} />}
      </div>

      {guardTicker && (
        <div className="mt-sm strategy-view-panel">
          <h3 className="mb-sm">Open Lots</h3>
          <PartialTradeAdvisor ticker={guardTicker} onSellLot={addLotToPlan} onSellLots={addProfitableLotsToPlan} />
        </div>
      )}


    </>
  ) : null;

  return (
    <>
      <StandardCard
        title={<span className="trade-plan-title">{guardTicker && <><TickerLogo ticker={guardTicker} exchange="qse" size="sm" /><span className="trade-plan-stock">{tickerNames[guardTicker] || guardTicker}{tickerNames[guardTicker] && <> ({guardTicker})</>}</span></>}<span className="trade-plan-name">{plan.name}</span></span>}
        headerEnd={<>{plan.isDefault && <span className="pill pill-info">Default</span>}<span className="text-muted trade-plan-execution-count">{doneCount}/{plan.legs.length} executed</span></>}
        actions={cardActions}
        defaultOpen={false}
        open={open}
        onToggle={onToggle}
        className="trade-plan-card"
      >
        {bodyContent}
      </StandardCard>
      {batchEditingLegs && <BatchEditGrid<TradePlanLeg & { _batchId: string }>
        title={`Batch edit planned legs — ${plan.name}`}
        description="Spreadsheet-style batch editing. Executed legs are read-only; save all changes together."
        rows={plan.legs.map((leg, index) => ({ ...leg, _batchId: `${plan.id}:${index}` }))}
        columns={[
          { key: 'date', label: 'Date', type: 'date', editable: (row) => !row.executed, width: 150 },
          { key: 'ticker', label: 'Ticker', editable: false, width: 110 },
          { key: 'action', label: 'Action', type: 'select', editable: (row) => !row.executed, options: [{ value: 'BUY', label: 'BUY' }, { value: 'SELL', label: 'SELL' }], width: 110 },
          { key: 'shares', label: 'Shares', type: 'number', editable: (row) => !row.executed, width: 120 },
          { key: 'price', label: 'Price', type: 'number', editable: (row) => !row.executed, width: 130, formatter: (value, _row) => fmtQSEPrice(Number(value)) },
          { key: 'feeOverride', label: 'Fee override', type: 'number', editable: (row) => !row.executed, width: 140 },
        ] as BatchColumn<TradePlanLeg & { _batchId: string }>[]}
        getRowId={(row) => row._batchId}
        getRowDate={(row) => row.date ?? ''}
        onSave={(changes: BatchChange<TradePlanLeg & { _batchId: string }>[]) => {
          const replacements = new Map(changes.map(({ before, after }) => [before._batchId, after] as const));
          updateTradePlan(plan.id, { legs: plan.legs.map((leg, index) => {
            const replacement = replacements.get(`${plan.id}:${index}`);
            if (!replacement) return leg;
            const { _batchId: _ignored, ...savedLeg } = replacement;
            void _ignored;
            return savedLeg;
          }) });
        }}
        onClose={() => setBatchEditingLegs(false)}
      />}
      {showMissedOpportunities && missedOpportunity && (
        <Modal title={`Recent missed opportunities — ${guardTicker}`} onClose={() => setShowMissedOpportunities(false)}>
          <p className="text-muted">Only prices on or after each buy date are considered.</p>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Buy date</th><th>Buy price</th><th>Peak</th><th>Peak date</th><th>Potential P/L</th></tr></thead>
              <tbody>
                {missedOpportunity.lots.map((lot, index) => (
                  <tr key={index}>
                    <td>{lot.buyDate}</td>
                    <td>{fmtQSEPrice(lot.buyPrice)}</td>
                    <td>{fmtQSEPrice(lot.peakPrice)}</td>
                    <td>{lot.peakDate}</td>
                    <td className={lot.wouldHaveProfited >= 0 ? 'pill-positive' : 'pill-negative'}>{fmtMoney(lot.wouldHaveProfited, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}

const MemoPlanCard = memo(PlanCard);

export function TradeStrategyPage() {
  const tradePlans = useWorkbookStore((s) => s.workbook.tradePlans);
  const addTradePlan = useWorkbookStore((s) => s.addTradePlan);
  const sorted = [...tradePlans].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const navigate = useNavigate();
  const exchange = "QSE";
  const [openPlans, setOpenPlans] = useState<Record<string, boolean>>({});
  const planToggleHandlers = useMemo(() => Object.fromEntries(tradePlans.map(plan => [plan.id, (open: boolean) => setOpenPlans(current => ({ ...current, [plan.id]: open }))])), [tradePlans]);
  const { activeSection, setActiveSection } = useActivePageSection([
    { key: 'profitable-share-alerts', id: 'profitable-share-alerts' },
    ...sorted.map(plan => ({ key: plan.id, id: `trade-plan-${plan.id}` })),
    { key: 'buy-sell-avg-down', id: 'buy-sell-avg-down' },
  ]);
  usePageTopBarRightSlot(
    <TopBarControls><Select
      aria-label="Stock exchange"
      value={exchange}
      width={110}
      onChange={(event) => navigate(event.target.value === 'QSE' ? '/trade-strategy' : '/psx/trade-strategy')}
    >
      <option value="QSE">QSE</option>
      <option value="PSX">PSX</option>
    </Select></TopBarControls>,
  );
  usePageTopBarChips(useMemo(() => [
    { key: 'profitable-share-alerts', label: 'Alerts', active: activeSection === 'profitable-share-alerts', onClick: () => { setActiveSection('profitable-share-alerts'); document.getElementById('profitable-share-alerts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    ...sorted.map((plan) => ({
      key: plan.id,
      label: plan.name,
      active: activeSection === plan.id,
      onClick: () => {
        setActiveSection(plan.id);
        setOpenPlans((current) => ({ ...current, [plan.id]: true }));
        requestAnimationFrame(() => document.getElementById(`trade-plan-${plan.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      },
    })),
    {
      key: 'buy-sell-avg-down',
      label: 'Calculator',
      active: activeSection === 'buy-sell-avg-down',
      onClick: () => {
        setActiveSection('buy-sell-avg-down');
        document.getElementById('buy-sell-avg-down')?.querySelector<HTMLButtonElement>('.standard-card-toggle[aria-expanded="false"]')?.click();
        requestAnimationFrame(() => document.getElementById('buy-sell-avg-down')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      },
    },
  ], [tradePlans, activeSection, setActiveSection]));
  const { rows, workbook, calcFee } = useQSEDerived();
  const ensureSignedIn = useEnsureSignedIn();
  const planProfitableShares = async (ticker: string, lots: LotAdvice[], price: number) => {
    if (!(await ensureSignedIn('Sign in to update trade plans.'))) return;
    const state = useWorkbookStore.getState();
    const existing = state.workbook.tradePlans.find(plan => (plan.defaultTicker || plan.legs[0]?.ticker) === ticker && plan.isDefault)
      || state.workbook.tradePlans.find(plan => (plan.defaultTicker || plan.legs[0]?.ticker) === ticker);
    const legs = lots.flatMap(lot => {
      const planned = (existing?.legs || []).filter(leg => !leg.executed && !leg.ignored && leg.action === 'SELL' && leg.ticker === ticker && leg.targetLotBuyId === lot.buyId).reduce((sum, leg) => sum + leg.shares, 0);
      const shares = Math.max(0, lot.remainingShares - planned);
      return shares > 0 ? [{ date: today(), action: 'SELL' as const, ticker, shares, price, targetLotBuyId: lot.buyId }] : [];
    });
    if (!legs.length) { toast('Profitable shares are already planned.'); return; }
    const id = existing?.id || crypto.randomUUID();
    if (existing) state.updateTradePlan(id, { legs: [...existing.legs, ...legs] });
    else state.addTradePlan({ id, name: ticker + ' Plan', createdAt: today(), defaultTicker: ticker, isDefault: true, legs });
    setOpenPlans(current => ({ ...current, [id]: true }));
    toast('Added profitable shares to planned trades.');
  };
  const { user } = useAuthState();

  // Phase 3: every open position always has its own plan to host that
  // ticker's Partial Trade advice and any "Sell this lot" legs — no need to
  // create one by hand first (the old standalone "Partial Trade" section,
  // reachable without a plan, is gone — this makes it redundant). Never
  // fires signed out: browsing stays free, this never prompts a sign-in
  // modal on its own. Idempotent — only creates a plan genuinely missing.
  useEffect(() => {
    if (!user) return;
    const openTickers = rows.filter((r) => r.shares > 0).map((r) => r.ticker);
    for (const ticker of openTickers) {
      const hasDefaultPlan = tradePlans.some((p) => (p.defaultTicker || p.legs[0]?.ticker) === ticker && p.isDefault);
      if (!hasDefaultPlan) {
        const existing = tradePlans.find((p) => (p.defaultTicker || p.legs[0]?.ticker) === ticker);
        if (existing) {
          useWorkbookStore.getState().updateTradePlan(existing.id, { isDefault: true });
        } else {
          addTradePlan({ id: crypto.randomUUID(), name: `${ticker} Plan`, createdAt: today(), legs: [], defaultTicker: ticker, isDefault: true });
        }
      }
    }
  }, [user, rows, tradePlans, addTradePlan]);

  return (
    <div className="standard-page trade-strategy-page">
      <PageHeading back={<BackButton to="/qse">← QSE</BackButton>}><h1 className="pagetitle">QSE Trade Strategy</h1></PageHeading>
     <ProfitableLotAlerts transactions={workbook.transactions} marketPrices={workbook.marketPrices} calcFee={calcFee} feePct={workbook.settings.feePct} tick={workbook.settings.tick} currency={workbook.settings.currency} exchange="qse" onSell={planProfitableShares} />

      <section>
      <h2 className="trade-strategy-heading">Trade Planner</h2>
      <NewPlanFab />
      {sorted.length ? <div className="standard-section-stack">{sorted.map((p) => <div key={p.id} id={`trade-plan-${p.id}`} className="standard-section-anchor" style={{ scrollMarginTop: 96 }}><MemoPlanCard plan={p} open={!!openPlans[p.id]} onToggle={planToggleHandlers[p.id]} /></div>)}</div> : <p className="text-muted">No trade plans yet.</p>}


      </section>
      <section id="buy-sell-avg-down" className="standard-section-anchor" style={{ scrollMarginTop: 96 }}>
        <h2 className="trade-strategy-heading">Trade Calculator</h2>
        <BuySellAvgDownCalculator />
      </section>
    </div>
  );
}
