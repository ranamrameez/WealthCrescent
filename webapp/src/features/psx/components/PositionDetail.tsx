import { MarketPriceHistory } from './MarketPriceHistory';
import { PriceInput } from "../../../components/ui/PriceInput";
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { StockBar as Bar } from '../../../components/StockCharts';
import { STOCK_BUY_COLOR, STOCK_SELL_COLOR } from '../../../lib/stockChartTheme';
import { StandardCard } from '../../../components/StandardCard';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { Tooltip } from '../../../components/Tooltip';
import { EditIcon, SaveIcon, TrashIcon, XIcon } from '../../../components/icons';
import { IconButton } from '../../../components/ui/IconButton';
import { Sparkline } from '../../../components/Sparkline';
import { StatSourceBadge } from '../../../components/StatSourceBadge';
import { toast } from '../../../components/Toast';
import { breakEvenPrice, computePriceStats, getMarketPrice } from '../../../lib/calc';
import { computeClosedTrades } from '../../../lib/calc/closedTrades';
import { computeFIFOPositions } from '../../../lib/calc/fifoPositions';
import { calcCGT, feeScenarios } from '../../../lib/calc/psxFees';
import type { FeeCalculator } from '../../../types/workbook';
import { getDailyPriceHistory } from '../../../lib/calc/priceHistory';
import { applyChartTheme } from '../../../lib/chartSetup';
import { toCSV } from '../../../lib/csv';
import { fmt, fmtMoney, fmtPSXPrice } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { useSortableRows } from '../../../hooks/useSortableRows';
import { HUES, hueStyle } from '../../../lib/statCardHues';
import { useAppearanceStore } from '../../../store/appearanceStore';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import type { PricePoint } from '../../../types/workbook';
import { usePSXDerived } from '../hooks/usePSXDerived';
import { gridAutoStyle } from '../../../lib/gridStyle';

function DetailCard({section,title,children,...props}: ComponentProps<typeof StandardCard> & {section:string}) {
  return section === 'all' ? <StandardCard title={title} {...props}>{children}</StandardCard>
    : <div className={`position-detail-section ${props.className||''}`.trim()}>{section !== 'lots' && section !== 'closed' && section !== 'prices' && section !== 'position' && <h3>{title}</h3>}{children}</div>;
}

function CompactChart({ height, children }: { height: number; children: React.ReactNode }) {
  return <div style={{ height, position: 'relative' }}>{children}</div>;
}

/** PSX's equivalent of the QSE PositionDetail — same layout, plus an
 * estimated CGT-on-gain stat for open positions (README items 5/6: PSX
 * capital gains tax is a real cost QSE doesn't have, so it's worth
 * surfacing here rather than only in the trade calculator). */
export function PositionDetail({ ticker, section = 'all', fromDate = '', toDate = '' }: { ticker: string; section?: 'all' | 'current' | 'position' | 'comparison' | 'comparison-summary' | 'all-time' | 'lots' | 'closed' | 'prices'; fromDate?: string; toDate?: string }) {
  const { workbook, positions, calcFee, lots } = usePSXDerived();
  const setMarketPrice = usePSXWorkbookStore((s) => s.setMarketPrice);
  const updatePricePoint = usePSXWorkbookStore((s) => s.updatePricePoint);
  const deletePricePoint = usePSXWorkbookStore((s) => s.deletePricePoint);
  const ensureSignedIn = useEnsureSignedIn();
  const currency = workbook.settings.currency;
  useAppearanceStore((s) => s.appearance);
  applyChartTheme();

  const position = positions.find((p) => p.ticker === ticker);
  const shares = position?.shares || 0;
  const isOpen = shares > 0;
  const invested = position?.invested || 0;
  const avg = shares > 0 ? invested / shares : 0;
  const mp = getMarketPrice(ticker, workbook.marketPrices, workbook.transactions);
  const be = shares > 0 ? breakEvenPrice(invested, shares, workbook.settings.feePct, workbook.settings.tick, calcFee) : 0;
  // User's own worked example (2026-08-27 trust conversation): "I bought
  // today 1@327.8... no commission until market close... small levies
  // negligible. BE would be [sold same-day, netted] ~327.87, vs. [sold a
  // different day, full commission] ~328.5" — asked to see both scenarios
  // side by side rather than pick one. `calcFee` (passed with no `tx`
  // context, as `breakEvenPrice` always calls it) already only ever returns
  // the FULL fee — see `makePSXFeeCalculator`'s own `if (!tx) return ...
  // .total` branch — so the existing `be` above already IS the "different
  // day" scenario. This second calc reuses `feeScenarios()`'s `netted`
  // figure (government levies only, no commission/SST — the Trade Planner's
  // existing same-day-netting math, README Done item 104) to answer the
  // other half: what BE would be if this sell nets against a same-day buy
  // instead.
  const nettedCalcFee: FeeCalculator = (amount, isBuy, context) =>
    feeScenarios(amount, isBuy, context?.shares ?? 0, workbook.settings).netted;
  const beSameDay = shares > 0 ? breakEvenPrice(invested, shares, workbook.settings.feePct, workbook.settings.tick, nettedCalcFee) : 0;

  const [priceInput, setPriceInput] = useState(mp > 0 ? String(mp) : '');
  useEffect(() => setPriceInput(mp > 0 ? String(mp) : ''), [ticker]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastBuyPrice = [...workbook.transactions].filter((t) => t.ticker === ticker && t.action === 'BUY').sort((a, b) => a.date.localeCompare(b.date)).pop()?.price || 0;
  const soldTx = workbook.transactions.filter((t) => t.ticker === ticker && t.action === 'SELL');
  const lastSellPrice = [...soldTx].sort((a, b) => a.date.localeCompare(b.date)).pop()?.price || 0;
  const avgSellPrice = soldTx.length ? soldTx.reduce((s, t) => s + t.shares * t.price, 0) / soldTx.reduce((s, t) => s + t.shares, 0) : 0;
  const holdingDays = position
    ? Math.max(0, Math.round((new Date(position.lastDate).getTime() - new Date(position.firstDate).getTime()) / 86400000))
    : 0;

  // User's own ask (2026-09-13): per-round-trip buy/sell detail for SOLD
  // shares of this stock — see the identical comment in QSE's
  // PositionDetail.tsx. Uses the default 'fifo' match order (same as the
  // Trade Transactions page's own default), independent of whatever
  // costBasisMethod this workbook is set to — see computeClosedTrades'
  // own doc comment for why it's a separate reporting ledger.
  const closedTrades = useMemo(
    () => computeClosedTrades(workbook.transactions.filter((t) => t.ticker === ticker), calcFee).filter(trade => (!fromDate || trade.sellDate >= fromDate) && (!toDate || trade.sellDate <= toDate)),
    [workbook.transactions, ticker, calcFee, fromDate, toDate],
  );
  type CTCol = 'buyDate' | 'sellDate' | 'shares' | 'netPL' | 'holdingDays';
  const ctSortValue = (t: (typeof closedTrades)[number], col: CTCol): number | string =>
    col === 'shares' ? t.shares : col === 'netPL' ? t.netPL : col === 'holdingDays' ? t.holdingDays : col === 'sellDate' ? t.sellDate : t.buyDate;
  const { sorted: sortedClosedTrades, Th: CTTh } = useSortableRows(closedTrades, ctSortValue, 'sellDate', 'desc');

  // Item 5 of the same batch: this workbook's own "Open lots" section below
  // already shows the real thing when costBasisMethod is 'fifo' or (added
  // 2026-09-17) 'lowestCostFirst' — for the DEFAULT 'average' method there
  // was no open-lots view at all alongside the new Closed round-trips
  // report above, unlike QSE (which always shows a pure-reporting one, see
  // that file's own comment). Same pure-reporting fallback here, only for
  // the weighted-average case so it never duplicates the real cost-basis
  // section just below.
  const usingLots = workbook.settings.costBasisMethod === 'fifo' || workbook.settings.costBasisMethod === 'lowestCostFirst';
  const reportOpenLots = useMemo(
    () => (usingLots
      ? []
      : computeFIFOPositions(workbook.transactions.filter((t) => t.ticker === ticker), calcFee).lotsByTicker[ticker] || []),
    [workbook.transactions, ticker, calcFee, usingLots],
  );

  const stats = computePriceStats(ticker, workbook.priceHistory);
  // README item 2 of a 2026-08-27 feedback batch: see the identical comment
  // in QSE's PositionDetail.tsx.
  const sparkData = getDailyPriceHistory(ticker, workbook.priceHistory).map((p) => p.price);

  const lotRows = lots[ticker] ?? [];
  type LotCol = 'buyDate' | 'buyPrice' | 'remainingShares' | 'costPerShare';
  const lotSortValue = (lot: (typeof lotRows)[number], col: LotCol): number | string => {
    if (col === 'costPerShare') return lot.buyPrice + lot.buyFeeTotal / lot.originalShares;
    return lot[col];
  };
  const { sorted: sortedLots, Th: LotTh } = useSortableRows(lotRows, lotSortValue, 'buyDate', 'asc');

  // User-reported (2026-08-27): "current price updates are shown upto
  // recent 8, no view to see them all" — `stats.recent` is deliberately
  // capped at 8 (computePriceStats' own doc comment), with the only other
  // access to full history being the CSV export button below. This toggle
  // swaps the table's source to the full `stats.chronological` (still
  // newest-first) on demand — both arrays hold the exact same PricePoint
  // object references as `rawHistory`, so `rawHistory.indexOf(p)` below
  // (used for edit/delete) resolves correctly either way.
  const [showAllPrices, setShowAllPrices] = useState(false);
  const recentRows = showAllPrices ? [...(stats?.chronological ?? [])].reverse() : (stats?.recent ?? []);
  type RecentCol = 'when' | 'price';
  const recentSortValue = (p: (typeof recentRows)[number], col: RecentCol): number | string =>
    col === 'price' ? p.price : (p.time ?? p.date);
  const { sorted: sortedRecent, Th: RecentTh } = useSortableRows(recentRows, recentSortValue, 'when', 'desc');

  // README item 1 of the same batch: see the identical comment in QSE's
  // PositionDetail.tsx.
  const [editPriceIndex, setEditPriceIndex] = useState<number | null>(null);
  const [editPriceRow, setEditPriceRow] = useState<PricePoint | null>(null);
  const rawHistory = workbook.priceHistory[ticker] ?? [];

  const startEditPrice = (rawIndex: number, point: PricePoint) => {
    setEditPriceIndex(rawIndex);
    setEditPriceRow({ ...point });
  };
  const cancelEditPrice = () => {
    setEditPriceIndex(null);
    setEditPriceRow(null);
  };
  const saveEditPrice = async () => {
    if (editPriceIndex === null || !editPriceRow) return;
    if (!editPriceRow.price || editPriceRow.price <= 0) return toast('Enter a valid price.');
    if (!(await ensureSignedIn('Sign in to edit price history.'))) return;
    updatePricePoint(ticker, editPriceIndex, editPriceRow);
    toast('Price entry updated.');
    cancelEditPrice();
  };
  const removePricePoint = async (rawIndex: number) => {
    if (!(await confirmDialog('Delete this price entry? This cannot be undone.'))) return;
    if (!(await ensureSignedIn('Sign in to edit price history.'))) return;
    deletePricePoint(ticker, rawIndex);
    toast('Price entry deleted.');
  };

  const grossValue = isOpen && mp > 0 ? shares * mp : 0;
  const estSellFee = grossValue > 0 ? calcFee(grossValue, false, { shares }) : 0;
  const estGain = grossValue > 0 ? grossValue - estSellFee - invested : 0;
  const estCGT = estGain > 0 ? calcCGT(estGain, workbook.settings) : 0;

  // Item 1 of a 2026-08-26 feedback batch: see the identical comment in
  // QSE's PositionDetail.tsx.
  const exitTarget = (pct: number) =>
    shares > 0 ? breakEvenPrice(invested * (1 + pct / 100), shares, workbook.settings.feePct, workbook.settings.tick, calcFee) : 0;
  const netProfit = grossValue > 0 ? grossValue - estSellFee - invested : NaN;
  let statusLabel = '';
  let statusClass = 'pill-neutral';
  let statusHue: string | undefined;
  if (isOpen) {
    if (!Number.isFinite(netProfit)) { statusLabel = 'PRICE NEEDED'; statusClass = 'pill-neutral'; statusHue = undefined; }
    else if (netProfit >= 0) { statusLabel = 'EXIT READY'; statusClass = 'pill-positive'; statusHue = 'var(--profit)'; }
    else if ((netProfit / invested) * 100 > -3) { statusLabel = 'WATCH'; statusClass = 'pill-warn'; statusHue = undefined; }
    else { statusLabel = 'HOLD / REVIEW'; statusClass = 'pill-negative'; statusHue = 'var(--loss)'; }
  }

  /** README item 40: this ticker's price-history statement, separate from
   * the trade statement exported on the Transactions tab — exports the
   * full raw log (`stats.chronological`), not just the "recent" slice
   * shown on screen. */
  const exportPriceHistory = () => {
    if (!stats) return;
    const rows = [...stats.chronological].sort((a, b) => (a.time || a.date).localeCompare(b.time || b.date));
    const header = ['When', 'Price'];
    const body = rows.map((p) => [p.time ? new Date(p.time).toLocaleString() : p.date, p.price]);
    const blob = new Blob([toCSV([header, ...body])], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}_price_history.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Price history downloaded.');
  };

  const commitPrice = async () => {
    const val = parseFloat(priceInput);
    if (!val || val <= 0) return;
    if (!(await ensureSignedIn('Sign in to save price updates.'))) return;
    setMarketPrice(ticker, val);
    toast(`${ticker} price saved: ${fmtPSXPrice(val)}`);
    // User-reported bug: this used to reset to '', which blanked the input
    // right after a successful save even though the price WAS saved
    // correctly (every other stat on the page reflected it) — reads as
    // "current price disappears after saving." Re-fill with what was just
    // saved instead, so the field shows the value it actually holds now.
    setPriceInput(String(val));
  };
  void commitPrice;
  const comparisonValues=lastSellPrice>0?[lastBuyPrice,lastSellPrice,mp,be]:[lastBuyPrice,mp,be];
  const comparisonLabels=lastSellPrice>0?['Latest buy','Latest sell','Market price','Break-even (fees)']:['Latest buy','Market price','Break-even (fees)'];
  const comparisonTerms=lastSellPrice>0?['Latest executed buy price','Latest executed sell price','Current market price','Break-even price including fees']:['Latest executed buy price','Current market price','Break-even price including fees'];
  const comparisonLow=Math.min(...comparisonValues),comparisonHigh=Math.max(...comparisonValues),comparisonPadding=Math.max((comparisonHigh-comparisonLow)*.15,comparisonHigh*.02,workbook.settings.tick);
  const profitableShares=mp>0?[...(usingLots?lotRows:reportOpenLots)].filter(lot=>mp>=breakEvenPrice(lot.remainingShares*(lot.buyPrice+lot.buyFeeTotal/lot.originalShares),lot.remainingShares,workbook.settings.feePct,workbook.settings.tick,calcFee)).reduce((sum,lot)=>sum+lot.remainingShares,0):0;
  const netValue=mp>0?grossValue-estSellFee:NaN;
  const pendingPlans=workbook.transactions.filter(tx=>tx.ticker===ticker&&tx.isPending),openPlans=workbook.tradePlans.flatMap(plan=>plan.legs).filter(leg=>leg.ticker===ticker&&!leg.executed&&!leg.ignored),plannedLegs=[...pendingPlans,...openPlans];
  const plannedBuyCost=plannedLegs.filter(leg=>leg.action==='BUY').reduce((sum,leg)=>sum+leg.shares*leg.price+calcFee(leg.shares*leg.price,true,{shares:leg.shares}),0),plannedSellProceeds=plannedLegs.filter(leg=>leg.action==='SELL').reduce((sum,leg)=>sum+leg.shares*leg.price-calcFee(leg.shares*leg.price,false,{shares:leg.shares}),0);

  return (
    // Pending items 54/56/57: charts + Price range move to a right-hand
    // stack while the other stat cards stay on the left, on wide viewports
    // — see main.css's .position-split comment for the mobile-order
    // tradeoff (left-column content shows first when collapsed to one
    // column, not the original top-to-bottom order).
    <>
      <div>
      <div>

        {(section === 'all' || section === 'current' || section === 'position') && isOpen && (
          <DetailCard section={section} title={<span>Portfolio overview <StatSourceBadge source="official" /></span>} className="mb-12">
            <div className="current-position-sections">
              <section className="current-position-section"><h4>Holding</h4><div className="current-position-lead"><div className="current-position-metrics"><div className="current-position-metric current-position-primary"><span>Shares</span><strong className="shares-box">{fmt(shares,0)}</strong>{profitableShares>0&&<small>{fmt(profitableShares,0)} profitable shares</small>}</div><div className="current-position-metric"><span>Current price</span><strong>{mp>0?fmtPSXPrice(mp):'—'}</strong></div></div><div className="current-position-trend"><span>Trend</span><Sparkline data={sparkData} formatValue={fmtPSXPrice}/></div></div></section>
              <section className="current-position-section"><h4>Cost basis</h4><div className="current-position-metrics"><div className="current-position-metric current-position-primary current-position-break-even"><Tooltip text="The selling price per share required to recover the invested capital and estimated sell fees."><span className="clickable">Break-even / share</span></Tooltip><strong>{fmtPSXPrice(be)}</strong><small>Including sell fees</small></div><div className="current-position-metric"><Tooltip text="Average acquisition cost per share, including buy fees."><span className="clickable">Average cost / share</span></Tooltip><strong>{fmtPSXPrice(avg)}</strong><small>After buy fees</small></div><div className="current-position-metric"><Tooltip text="PSX same-day netting waives commission and SST on the smaller matched leg; government levies still apply."><span className="clickable">Same-day break-even</span></Tooltip><strong>{fmtPSXPrice(beSameDay)}</strong><small>With same-day netting</small></div></div></section>
              <section className="current-position-section"><h4>Performance</h4><div className="current-position-metrics"><div className="current-position-metric current-position-primary"><span>Unrealized P/L</span><strong className={Number.isFinite(netProfit)?netProfit>=0?'text-profit':'text-loss':undefined}>{Number.isFinite(netProfit)?`${netProfit>=0?'▲':'▼'} ${fmtMoney(netProfit,currency)} · ${((netProfit/invested)*100).toFixed(1)}%`:'—'}</strong></div><div className="current-position-metric"><span>Realized P/L</span><strong className={(position?.realized||0)>=0?'text-profit':'text-loss'}>{fmtMoney(position?.realized||0,currency)}</strong></div><div className="current-position-metric"><span>Net P/L</span><strong className={Number.isFinite(netProfit)?(position?.realized||0)+netProfit>=0?'text-profit':'text-loss':undefined}>{Number.isFinite(netProfit)?fmtMoney((position?.realized||0)+netProfit,currency):'—'}</strong></div>{grossValue>0&&<div className="current-position-metric"><span>Estimated CGT</span><strong>{fmtMoney(estCGT,currency)}</strong><small>{workbook.settings.filerStatus==='filer'?`${workbook.settings.cgtFilerPct}% filer rate`:`${workbook.settings.cgtNonFilerPct}% non-filer rate`}</small></div>}</div></section>
              <section className="current-position-section"><h4>Valuation</h4><div className="current-position-metrics"><div className="current-position-metric current-position-primary"><span>Net liquidation value</span><strong className={Number.isFinite(netProfit)?netProfit>=0?'text-profit':'text-loss':undefined}>{Number.isFinite(netValue)?`${netProfit>=0?'▲':'▼'} ${fmtMoney(netValue,currency)}`:'—'}</strong><small>After estimated sell fees</small></div><div className="current-position-metric"><span>Market value</span><strong>{mp>0?fmtMoney(grossValue,currency):'—'}</strong></div><div className="current-position-metric"><span>Net invested</span><strong>{fmtMoney(invested,currency)}</strong><small>Including buy fees</small></div></div></section>
              <section className="current-position-section current-position-comparison"><h4>Price comparison</h4><CompactChart height={lastSellPrice > 0 ? 220 : 180}><Bar data={{labels:comparisonLabels,datasets:[{data:comparisonValues,backgroundColor:lastSellPrice>0?[STOCK_BUY_COLOR,STOCK_SELL_COLOR,'#a78bfa','#c9a35a']:[STOCK_BUY_COLOR,'#a78bfa','#c9a35a'],maxBarThickness:20}]}} options={{maintainAspectRatio:false,indexAxis:'y',interaction:{mode:'nearest',axis:'y',intersect:false},plugins:{legend:{display:false},datalabels:{display:true,formatter:value=>fmtPSXPrice(Number(value))},tooltip:{callbacks:{title:items=>comparisonTerms[items[0]?.dataIndex]||'',label:context=>fmtPSXPrice(Number(context.raw))}}},scales:{x:{min:Math.max(0,comparisonLow-comparisonPadding),max:comparisonHigh+comparisonPadding,ticks:{callback:value=>fmtPSXPrice(Number(value))}},y:{ticks:{autoSkip:false}}}}}/></CompactChart></section>
              <section className="current-position-section" style={hueStyle(statusHue||HUES[6])}><h4>Suggestions</h4><div className="current-position-metrics"><div className="current-position-metric current-position-primary"><span>Status</span><strong className={`pill ${statusClass} current-position-status`}>{statusLabel}</strong></div><div className="current-position-metric"><span>Exit targets</span><strong className="current-position-targets">+1% {fmtPSXPrice(exitTarget(1))}<br/>+2% {fmtPSXPrice(exitTarget(2))}<br/>+5% {fmtPSXPrice(exitTarget(5))}</strong></div></div></section>
              <section className="current-position-section" style={hueStyle(HUES[6])}><h4>Planned activity</h4><div className="current-position-metrics"><div className="current-position-metric"><span>Pending / planned</span><strong>{pendingPlans.length} / {openPlans.length}</strong></div><div className="current-position-metric"><span>Buy cost including fees</span><strong>{fmtMoney(plannedBuyCost,currency)}</strong></div><div className="current-position-metric"><span>Net sell proceeds</span><strong>{fmtMoney(plannedSellProceeds,currency)}</strong></div><div className="current-position-metric current-position-primary"><span>Cash required</span><strong>{fmtMoney(plannedBuyCost-plannedSellProceeds,currency)}</strong></div><div className="current-position-metric"><span>Projected shares</span><strong>{fmt(shares+plannedLegs.reduce((sum,leg)=>sum+(leg.action==='BUY'?leg.shares:-leg.shares),0),0)}</strong></div></div></section>
            </div>
            <div className="current-position-supporting"><div><span>Estimated exit fees</span><strong>{mp>0?fmtMoney(estSellFee,currency):'—'}</strong><small>At current price</small></div><div><span>Estimated exit fees</span><strong>{fmtMoney(calcFee(be*shares,false,{shares}),currency)}</strong><small>At break-even</small></div><div><span>Trade dates</span><strong>{position?.firstDate||'—'}</strong><small>{position?.lastDate?`to ${position.lastDate}`:'—'}</small></div><div><span>Lifetime fees paid</span><strong>{fmtMoney((position?.buyFees||0)+(position?.sellFees||0),currency)}</strong></div>{position&&position.sellCount>0&&<div><span>Average / latest sell</span><strong>{fmtPSXPrice(avgSellPrice)}</strong><small>Latest {fmtPSXPrice(lastSellPrice)}</small></div>}<div><span>Lifetime bought / sold</span><strong>{fmt(position?.totalBoughtShares||0,0)} / {fmt(position?.totalSoldShares||0,0)}</strong><small>{position?.buyCount||0} buys · {position?.sellCount||0} sells</small></div></div>
          </DetailCard>
        )}

        {(section === 'all' || section === 'all-time') && position && (position.buyCount > 0 || position.sellCount > 0) && (
          <DetailCard section={section} title={<span>All-time stats <StatSourceBadge source="official" /></span>} className="mb-12">
            <div className="grid-auto" style={gridAutoStyle(100, 8)}>
              <div className="stat-card card" style={hueStyle(HUES[0])}>
                <div className="label">Bought / Sold</div>
                <div className="value">{fmt(position.totalBoughtShares, 0)} / {fmt(position.totalSoldShares, 0)}</div>
                <div className="sub">{position.buyCount} buys · {position.sellCount} sells</div>
              </div>
              {position.sellCount > 0 && (
                <div className="stat-card card" style={hueStyle(HUES[7])}>
                  <div className="label">Sell price</div>
                  <Tooltip text="Weighted average, and most recent, sell price for this ticker.">
                    <div className="value">{fmtPSXPrice(avgSellPrice)}</div>
                  </Tooltip>
                  <div className="sub">avg · last {fmtPSXPrice(lastSellPrice)}</div>
                </div>
              )}
              <div className="stat-card card" style={hueStyle(position.realized >= 0 ? 'var(--profit)' : 'var(--loss)')}>
                <div className="label">Realized P/L</div>
                <div className="value">{fmtMoney(position.realized, currency)}</div>
              </div>
              <div className="stat-card card" style={hueStyle(HUES[4])}><div className="label">Fees paid</div><div className="value">{fmtMoney(position.buyFees + position.sellFees, currency)}</div></div>
              <div className="stat-card card" style={hueStyle(HUES[3])}>
                <div className="label">Trade dates</div>
                <div className="value fs-14">{position.firstDate}</div>
                <div className="sub">to {position.lastDate}</div>
              </div>
              {!isOpen && <div className="stat-card card" style={hueStyle(HUES[6])}><div className="label">Held</div><div className="value">{holdingDays}d</div></div>}
            </div>
          </DetailCard>
        )}


        {(section === 'all' || section === 'lots') && lotRows.length ? (
          <DetailCard section={section} title={<span>Open lots <StatSourceBadge source="official" /></span>} className="mb-12">
            <div className="table-scroll">
              <table>
                <thead><tr><LotTh col="buyDate">Buy date</LotTh><LotTh col="buyPrice">Buy price</LotTh><LotTh col="remainingShares">Remaining</LotTh><LotTh col="costPerShare">Cost/share</LotTh></tr></thead>
                <tbody>
                  {sortedLots.map((lot, i) => (
                    <tr key={i}>
                      <td>{lot.buyDate}</td>
                      <td>{fmtPSXPrice(lot.buyPrice)}</td>
                      <td><span className="shares-box">{fmt(lot.remainingShares, 0)}</span></td>
                      <td>{fmtPSXPrice(lot.buyPrice + lot.buyFeeTotal / lot.originalShares)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted" style={{ marginTop: 4 }}>
              A future sell of {ticker} will consume {workbook.settings.costBasisMethod === 'fifo' ? 'the oldest lot first (FIFO)' : 'the cheapest lot first'}, unless it targets a specific lot via "Sell this lot."
            </p>
          </DetailCard>
        ) : null}



        {(section === 'all' || section === 'lots') && reportOpenLots.length > 0 && (
          <DetailCard section={section} title={<span>Open lots <StatSourceBadge source="history" /></span>} className="mb-12">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Buy date</th><th>Buy price</th><th>Shares</th><th>Invested</th><th>Buy fee</th></tr>
                </thead>
                <tbody>
                  {reportOpenLots.map((l, i) => (
                    <tr key={i}>
                      <td>{l.buyDate}</td>
                      <td>{fmtPSXPrice(l.buyPrice)}</td>
                      <td><span className="shares-box">{fmt(l.remainingShares, 0)}</span></td>
                      <td>{fmtMoney(l.remainingShares * l.buyPrice, currency)}</td>
                      <td>{fmtMoney(l.buyFeeTotal, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailCard>
        )}

      </div>
      <div>

        {(section === 'all' || section === 'prices') && <DetailCard section={section} title={<span>Market Price</span>} className="mb-12">
        <MarketPriceHistory ticker={ticker} />
        </DetailCard>}

        {(section === 'all' || section === 'current' || section === 'comparison' || section === 'comparison-summary') && isOpen && (
          <DetailCard section={section} title={<span>Price comparison</span>} className="mb-12">
            <CompactChart height={lastSellPrice > 0 ? 220 : 180}>
              <Bar
                data={{
                  labels: comparisonLabels,
                  datasets: [
                    {
                      data: comparisonValues,
                      backgroundColor: lastSellPrice > 0
                        ? [STOCK_BUY_COLOR, STOCK_SELL_COLOR, '#a78bfa', '#c9a35a']
                        : [STOCK_BUY_COLOR, '#a78bfa', '#c9a35a'],
                      maxBarThickness: 20,
                    },
                  ],
                }}
                options={{
                  maintainAspectRatio: false,
                  indexAxis: 'y',
                  interaction: { mode: 'nearest', axis: 'y', intersect: false },
                  plugins: { legend: { display: false }, datalabels:{display:true,formatter:value=>fmtPSXPrice(Number(value))}, tooltip:{callbacks:{title:items=>comparisonTerms[items[0]?.dataIndex] || '',label:context=>fmtPSXPrice(Number(context.raw))}} },
                  // Done item 138: Chart.js's autoSkip was silently dropping
                  // "Sold"/"Break-even" labels from this 4-row category axis.
                  scales: { x:{min:Math.max(0,comparisonLow-comparisonPadding),max:comparisonHigh+comparisonPadding,ticks:{callback:value=>fmtPSXPrice(Number(value))}},y: { ticks: { autoSkip: false } } },
                }}
              />
            </CompactChart>
          </DetailCard>
        )}

        {(section === 'all' || section === 'prices') && stats && (
          <DetailCard section={section} title={<span>Price history</span>}>
            <details>
              <summary className="text-muted clickable">
                {showAllPrices ? `All updates (${stats.totalUpdates})` : `Recent updates (${stats.recent.length} of ${stats.totalUpdates})`}
              </summary>
              {stats.totalUpdates > stats.recent.length && (
                <button
                  className="btn secondary small mt-sm"
                  onClick={() => setShowAllPrices((v) => !v)}
                >
                  {showAllPrices ? 'Show recent 8 only' : `Show all ${stats.totalUpdates} updates`}
                </button>
              )}
              <div className="table-scroll mt-sm">
                <table>
                  <thead><tr><RecentTh col="when">When</RecentTh><RecentTh col="price">Price</RecentTh><th></th></tr></thead>
                  <tbody>
                    {sortedRecent.map((p) => {
                      const rawIndex = rawHistory.indexOf(p);
                      return editPriceIndex === rawIndex && editPriceRow ? (
                        <tr key={rawIndex}>
                          <td><input type="date" value={editPriceRow.date} onChange={(e) => setEditPriceRow({ ...editPriceRow, date: e.target.value })} className="w-130" /></td>
                          <td><PriceInput exchange="psx" type="number" step="0.01" value={editPriceRow.price} onChange={(e) => setEditPriceRow({ ...editPriceRow, price: Number(e.target.value) })} className="w-90" /></td>
                          <td>
                            <IconButton label="Save" icon={<SaveIcon size={12} />} onClick={saveEditPrice} />
                            <IconButton label="Cancel" icon={<XIcon size={12} />} onClick={cancelEditPrice} />
                          </td>
                        </tr>
                      ) : (
                        <tr key={rawIndex}>
                          <td>{p.time ? new Date(p.time).toLocaleString() : p.date}</td>
                          <td>{fmtPSXPrice(p.price)}</td>
                          <td>
                            <IconButton label="Edit" icon={<EditIcon size={12} />} onClick={() => startEditPrice(rawIndex, p)} />
                            <IconButton label="Delete" icon={<TrashIcon size={12} />} onClick={() => removePricePoint(rawIndex)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button className="btn secondary small mt-sm" onClick={exportPriceHistory}>Export price history CSV</button>
            </details>
          </DetailCard>
        )}

      </div>
      </div>
            {/* User's own ask (2026-09-13): per-round-trip buy/sell detail for
            SOLD shares of this stock — Buy price+date, Fee, BE, Total buy
            amount, Sell price+date, Total sale amount, PL/share, Net profit.
            Naturally absent for a still-fully-open position. */}
        {(section === 'all' || section === 'closed') && sortedClosedTrades.length > 0 && (
          <DetailCard section={section} title={<span>Closed Round-Trips <StatSourceBadge source="history" /></span>} className="mb-12">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <CTTh col="buyDate">Buy</CTTh>
                    <CTTh col="sellDate">Sell</CTTh>
                    <CTTh col="shares">Shares</CTTh>
                    <th>Break-even</th>
                    <CTTh col="netPL">
                      <Tooltip text="Realized — already locked in from this specific closed round-trip, independent of the current market price.">
                        Net P/L
                      </Tooltip>
                    </CTTh>
                    <CTTh col="holdingDays">Held</CTTh>
                  </tr>
                </thead>
                <tbody>
                  {sortedClosedTrades.map((t, i) => {
                    const totalBuy = t.shares * t.buyPrice;
                    const totalSale = t.shares * t.sellPrice;
                    const costBasis = totalBuy + t.buyFee;
                    const be = breakEvenPrice(costBasis, t.shares, workbook.settings.feePct, workbook.settings.tick, calcFee);
                    return (
                      <tr key={i}>
                        <td>{t.buyDate}<br /><span className="text-muted">{fmtPSXPrice(t.buyPrice)} · {fmtMoney(totalBuy, currency)}</span><br /><span className="text-muted">fee {fmtMoney(t.buyFee, currency)}</span></td>
                        <td>{t.sellDate}<br /><span className="text-muted">{fmtPSXPrice(t.sellPrice)} · {fmtMoney(totalSale, currency)}</span><br /><span className="text-muted">fee {fmtMoney(t.sellFee, currency)}</span></td>
                        <td><span className="shares-box">{fmt(t.shares, 0)}</span></td>
                        <td>{fmtPSXPrice(be)}</td>
                        <td className={t.netPL >= 0 ? 'text-profit' : 'text-loss'}>
                          {fmtMoney(t.netPL, currency)}
                          <br /><span className="text-muted">{fmtMoney(t.netPL / t.shares, currency)}/sh</span>
                        </td>
                        <td>{t.holdingDays}d</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DetailCard>
        )}

    </>

  );
}
