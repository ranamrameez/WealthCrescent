import { StatCard2 } from '../../../components/StatCard2';
import { SummarySection, SummarySections, SummaryValue } from '../../../components/SummaryGroupCard';
import { RecordRow } from '../../../components/RecordRow';
import { Pagination } from '../../../components/Pagination';
import { usePagination } from '../../../hooks/usePagination';
import { useDateTableSort } from '../../../hooks/useDateTableSort';
import { MarketPriceHistory } from './MarketPriceHistory';
import { PriceInput } from "../../../components/ui/PriceInput";
import { useEffect, useMemo, useState } from 'react';
import { StockBar as Bar } from '../../../components/StockCharts';
import { STOCK_BUY_COLOR, STOCK_SELL_COLOR } from '../../../lib/stockChartTheme';
import type { ComponentProps } from 'react';
import { StandardCard } from '../../../components/StandardCard';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { EditIcon, SaveIcon, TrashIcon, XIcon } from '../../../components/icons';
import { IconButton } from '../../../components/ui/IconButton';
import { Sparkline } from '../../../components/Sparkline';
import { StatSourceBadge } from '../../../components/StatSourceBadge';
import { toast } from '../../../components/Toast';
import { Tooltip } from '../../../components/Tooltip';
import { breakEvenPrice, computePriceStats, getMarketPrice } from '../../../lib/calc';
import { computeClosedTrades } from '../../../lib/calc/closedTrades';
import { computeFIFOPositions } from '../../../lib/calc/fifoPositions';
import { getDailyPriceHistory } from '../../../lib/calc/priceHistory';
import { applyChartTheme } from '../../../lib/chartSetup';
import { toCSV } from '../../../lib/csv';
import { fmt, fmtMoney, fmtQSEPrice } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { useSortableRows } from '../../../hooks/useSortableRows';
import { HUES, hueStyle } from '../../../lib/statCardHues';
import { useAppearanceStore } from '../../../store/appearanceStore';
import { useWorkbookStore } from '../../../store/workbookStore';
import type { PricePoint } from '../../../types/workbook';
import { useQSEDerived } from '../hooks/useQSEDerived';

function DetailCard({section,title,children,...props}: ComponentProps<typeof StandardCard> & {section:string}) {
  return section === 'all' ? <StandardCard title={title} {...props}>{children}</StandardCard>
    : <div className={`position-detail-section ${props.className||''}`.trim()}>{section !== 'lots' && section !== 'closed' && section !== 'prices' && section !== 'position' && <h3>{title}</h3>}{children}</div>;
}

/** Small, fixed-height chart wrapper — Chart.js defaults to filling
 * whatever block-level space it's given, which meant every chart rendered
 * oversized. maintainAspectRatio:false + an explicit height keeps every
 * chart here compact and consistent, whether shown in a popup or a page. */
function CompactChart({ height, children }: { height: number; children: React.ReactNode }) {
  return <div style={{ height, position: 'relative' }}>{children}</div>;
}

/** The actual "everything about this ticker" content — daily price chart,
 * current position (if open), all-time stats (works for closed positions
 * too, which is what the quick popup used to be missing entirely), and
 * price range. Shared between the quick popup (PositionModal) and the full
 * dedicated stock page (StockPage) so they never drift apart. */
export function PositionDetail({ ticker, section = 'all', fromDate = '', toDate = '' }: { ticker: string; section?: 'all' | 'current' | 'position' | 'comparison' | 'comparison-summary' | 'all-time' | 'lots' | 'closed' | 'prices'; fromDate?: string; toDate?: string }) {
  const dateSort = useDateTableSort();
  const { workbook, positions, calcFee, lots } = useQSEDerived();
  const setMarketPrice = useWorkbookStore((s) => s.setMarketPrice);
  const updatePricePoint = useWorkbookStore((s) => s.updatePricePoint);
  const deletePricePoint = useWorkbookStore((s) => s.deletePricePoint);
  const ensureSignedIn = useEnsureSignedIn();
  const currency = workbook.settings.currency;
  // See DashboardPage: charts only recompute their CSS-var-derived colors
  // on this component's own re-renders.
  useAppearanceStore((s) => s.appearance);
  applyChartTheme();

  const position = positions.find((p) => p.ticker === ticker);
  const shares = position?.shares || 0;
  const isOpen = shares > 0;
  const invested = position?.invested || 0;
  const avg = shares > 0 ? invested / shares : 0;
  const mp = getMarketPrice(ticker, workbook.marketPrices, workbook.transactions);
  const be = shares > 0 ? breakEvenPrice(invested, shares, workbook.settings.feePct, workbook.settings.tick, calcFee) : 0;
  // Item 1 of a 2026-08-26 feedback batch: Portfolio's/Dashboard's Holdings
  // tables both show Exit targets + Status for an open position — this page
  // (the "detail" view for a single stock) didn't have either, even though
  // it's the most natural place to check a specific stock's own exit plan.
  // Same status-threshold logic as those two tables, duplicated per the
  // existing convention rather than factored into a shared helper.
  const exitTarget = (pct: number) =>
    shares > 0 ? breakEvenPrice(invested * (1 + pct / 100), shares, workbook.settings.feePct, workbook.settings.tick, calcFee) : 0;
  const value = shares * mp;
  const sellFee = isOpen && mp > 0 ? calcFee(value, false) : 0;
  const profit = isOpen && mp > 0 ? value - sellFee - invested : NaN;
  let statusLabel = '';
  let statusClass = 'pill-neutral';
  let statusHue: string | undefined;
  if (isOpen) {
    if (!Number.isFinite(profit)) { statusLabel = 'PRICE NEEDED'; statusClass = 'pill-neutral'; statusHue = undefined; }
    else if (profit >= 0) { statusLabel = 'EXIT READY'; statusClass = 'pill-positive'; statusHue = 'var(--profit)'; }
    else if ((profit / invested) * 100 > -3) { statusLabel = 'WATCH'; statusClass = 'pill-warn'; statusHue = undefined; }
    else { statusLabel = 'HOLD / REVIEW'; statusClass = 'pill-negative'; statusHue = 'var(--loss)'; }
  }

  const [priceInput, setPriceInput] = useState(mp > 0 ? String(mp) : '');
  // Re-prefill from the stored price whenever the ticker changes (this
  // component is reused across stock pages without remounting).
  const [editingPrice] = useState(false);
  const [priceDirty,setPriceDirty] = useState(false);
  useEffect(() => { if (!editingPrice && !priceDirty) setPriceInput(mp > 0 ? String(mp) : ''); }, [ticker,mp,editingPrice,priceDirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {setPriceDirty(false);setPriceInput(mp > 0 ? String(mp) : '');}, [ticker]);
  const lastBuyPrice = [...workbook.transactions].filter((t) => t.ticker === ticker && !t.isPending && t.action === 'BUY').sort((a, b) => a.date.localeCompare(b.date)).pop()?.price || 0;
  const soldTx = workbook.transactions.filter((t) => t.ticker === ticker && !t.isPending && t.action === 'SELL');
  const lastSellPrice = [...soldTx].sort((a, b) => a.date.localeCompare(b.date)).pop()?.price || 0;
  const avgSellPrice = soldTx.length ? soldTx.reduce((s, t) => s + t.shares * t.price, 0) / soldTx.reduce((s, t) => s + t.shares, 0) : 0;
  const holdingDays = position
    ? Math.max(0, Math.round((new Date(position.lastDate).getTime() - new Date(position.firstDate).getTime()) / 86400000))
    : 0;

  // User's own ask (2026-09-13): "Each stock should be saved with this
  // metadata: Buy Price + Date, Fee, BE, Total Buy Amount, Selling Price +
  // Date, Total Sale Amount, PL/share + Net Profit" for sold shares, and
  // "for open positions we can skip Selling data on UI." Reuses
  // `computeClosedTrades` (already the app's one reporting ledger for
  // per-round-trip buy/sell detail, see the Trade Transactions page's own
  // "Closed trades" table) scoped to just this ticker — BE/Total buy/Total
  // sale/PL-per-share are simple derivations from its existing fields, not
  // new calc logic. Empty for a ticker with no sells yet, which naturally
  // satisfies "skip Selling data" for a still-fully-open position.
  const closedTrades = useMemo(
    () => section === 'all' || section === 'closed' ? computeClosedTrades(workbook.transactions.filter((t) => t.ticker === ticker), calcFee).filter(trade => (!fromDate || trade.sellDate >= fromDate) && (!toDate || trade.sellDate <= toDate)) : [],
    [workbook.transactions, ticker, calcFee, fromDate, toDate, section],
  );
  type CTCol = 'buyDate' | 'sellDate' | 'shares' | 'netPL' | 'holdingDays';
  const ctSortValue = (t: (typeof closedTrades)[number], col: CTCol): number | string =>
    col === 'shares' ? t.shares : col === 'netPL' ? t.netPL : col === 'holdingDays' ? t.holdingDays : col === 'sellDate' ? t.sellDate : t.buyDate;
  const { sorted: sortedClosedTrades, Th: CTTh } = useSortableRows(closedTrades, ctSortValue, 'sellDate', 'desc');

  // Item 5 of the 2026-09-13 batch: "there should be two tables for opened
  // lots & closed lots." Originally QSE's REAL position calc was ALWAYS
  // weighted-average with no lot concept at all — this was a pure
  // REPORTING view, mirroring the Trade Transactions page's own "Open
  // trades" table, that never fed back into `avg`/`be`/`invested` above.
  // 2026-09-17: `QSESettings.costBasisMethod` now lets a user opt into
  // real lot-based accounting (see that field's own doc comment for the
  // real financial-loss bug that prompted it) — when it's set to 'fifo'/
  // 'lowestCostFirst', `lots` (from `useQSEDerived`) IS the official
  // remainder, same engine driving `avg`/`be` above, so this section
  // switches to that and drops the redundant independent recompute.
  // Weighted-average (the unchanged default) keeps the old pure-reporting
  // fallback, exactly as before.
  const usingLots = (workbook.settings.costBasisMethod ?? 'average') !== 'average';
  const officialLots = lots[ticker] ?? [];
  type LotCol = 'buyDate' | 'buyPrice' | 'remainingShares' | 'costPerShare';
  const lotSortValue = (lot: (typeof officialLots)[number], col: LotCol): number | string =>
    col === 'costPerShare' ? lot.buyPrice + lot.buyFeeTotal / lot.originalShares : lot[col];
  const { sorted: sortedOfficialLots, Th: LotTh } = useSortableRows(officialLots, lotSortValue, 'buyDate', 'asc');
  const reportOpenLots = useMemo(
    () => (usingLots || !['all','lots','current','position'].includes(section) ? [] : computeFIFOPositions(workbook.transactions.filter((t) => t.ticker === ticker), calcFee).lotsByTicker[ticker] || []),
    [workbook.transactions, ticker, calcFee, usingLots, section],
  );

  const stats = computePriceStats(ticker, workbook.priceHistory);
  const lotTotal = usingLots ? sortedOfficialLots.length : reportOpenLots.length;
  const {page:safeLotPage,pageCount:lotPages,setPage:setLotPage}=usePagination(lotTotal,ticker);
  const {page:safeClosedPage,pageCount:closedPages,setPage:setClosedPage}=usePagination(sortedClosedTrades.length,ticker+'|'+fromDate+'|'+toDate);
  // README item 2 of a 2026-08-27 feedback batch: the Dashboard/Portfolio
  // Holdings tables' Trend sparkline was the one column Done item 152
  // didn't actually bring over here — same data source those tables use.
  const sparkData = getDailyPriceHistory(ticker, workbook.priceHistory).map((p) => p.price);

  // User-reported (2026-08-27): "current price updates are shown upto
  // recent 8, no view to see them all" — see the identical comment in
  // PSX's PositionDetail.tsx for why swapping the source array is safe
  // for the existing edit/delete `rawHistory.indexOf(p)` resolution.
  const [showAllPrices, setShowAllPrices] = useState(false);
  const recentRows = showAllPrices ? [...(stats?.chronological ?? [])].reverse() : (stats?.recent ?? []);
  type RecentCol = 'when' | 'price';
  const recentSortValue = (p: (typeof recentRows)[number], col: RecentCol): number | string =>
    col === 'price' ? p.price : (p.time ?? p.date);
  const { sorted: sortedRecent, Th: RecentTh } = useSortableRows(recentRows, recentSortValue, 'when', 'desc');

  // README item 1 of the same batch: "the option to change the past
  // current prices" — `setMarketPrice` only ever appends a new point for
  // TODAY; there was no way to correct a mistaken past entry. Addressed by
  // raw array index within `priceHistory[ticker]` (object identity survives
  // `computePriceStats`'s sort/slice, so `indexOf` on a displayed row finds
  // its real index — see `updatePricePoint`'s own doc comment in the store).
  const [editPriceIndex, setEditPriceIndex] = useState<number | null>(null);
  const [editPriceRow, setEditPriceRow] = useState<PricePoint | null>(null);
  const rawHistory = useWorkbookStore(s => s.workbook.priceHistory[ticker]) ?? [];

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
    setPriceDirty(false);
    toast(`${ticker} price saved: ${fmtQSEPrice(val)}`);
    // User-reported bug: this used to reset to '', which blanked the input
    // right after a successful save even though the price WAS saved
    // correctly (every other stat on the page reflected it) — reads as
    // "current price disappears after saving." Re-fill with what was just
    // saved instead, so the field shows the value it actually holds now.
    setPriceInput(String(val));
  };
  void commitPrice;
  const recordedPrices=(workbook.priceHistory[ticker]??[]).filter(point=>Number.isFinite(point.price)&&point.price>0);
  const latestPriceDate=recordedPrices.map(point=>point.date).sort().at(-1);
  const latestDayPrices=latestPriceDate?recordedPrices.filter(point=>point.date===latestPriceDate).map(point=>point.price):[];
  const baseComparisonValues=lastSellPrice>0?[lastBuyPrice,lastSellPrice,mp,be]:[lastBuyPrice,mp,be];
  const baseComparisonLabels=lastSellPrice>0?['Latest buy','Latest sell','Market price','Break-even (fees)']:['Latest buy','Market price','Break-even (fees)'];
  const baseComparisonTerms=lastSellPrice>0?['Latest executed buy price','Latest executed sell price','Current market price','Break-even price including fees']:['Latest executed buy price','Current market price','Break-even price including fees'];
  const dailyBounds=latestDayPrices.length?[Math.min(...latestDayPrices),Math.max(...latestDayPrices)]:[];
  const lifetimeBounds=recordedPrices.length?[Math.min(...recordedPrices.map(point=>point.price)),Math.max(...recordedPrices.map(point=>point.price))]:[];
  const comparisonValues=[...baseComparisonValues,...dailyBounds,...lifetimeBounds];
  const comparisonLabels=[...baseComparisonLabels,...(dailyBounds.length?['Latest day low','Latest day high']:[]),...(lifetimeBounds.length?['Lifetime low','Lifetime high']:[])];
  const comparisonTerms=[...baseComparisonTerms,...(dailyBounds.length?['Lowest recorded price on ' + latestPriceDate,'Highest recorded price on ' + latestPriceDate]:[]),...(lifetimeBounds.length?['Lowest recorded price in history','Highest recorded price in history']:[])];
  const comparisonLow=Math.min(...comparisonValues),comparisonHigh=Math.max(...comparisonValues),comparisonPadding=Math.max((comparisonHigh-comparisonLow)*.15,comparisonHigh*.02,workbook.settings.tick);
  const profitableShares=mp>0&&['all','current','position'].includes(section)?[...(usingLots?officialLots:reportOpenLots)].filter(lot=>mp>=breakEvenPrice(lot.remainingShares*(lot.buyPrice+lot.buyFeeTotal/lot.originalShares),lot.remainingShares,workbook.settings.feePct,workbook.settings.tick,calcFee)).reduce((sum,lot)=>sum+lot.remainingShares,0):0;
  const netValue=mp>0?value-sellFee:NaN;
  const pendingPlans=workbook.transactions.filter(tx=>tx.ticker===ticker&&tx.isPending),openPlans=workbook.tradePlans.flatMap(plan=>plan.legs).filter(leg=>leg.ticker===ticker&&!leg.executed),plannedLegs=[...pendingPlans,...openPlans];
  const plannedBuyCost=plannedLegs.filter(leg=>leg.action==='BUY').reduce((sum,leg)=>sum+leg.shares*leg.price+calcFee(leg.shares*leg.price,true),0),plannedSellProceeds=plannedLegs.filter(leg=>leg.action==='SELL').reduce((sum,leg)=>sum+leg.shares*leg.price-calcFee(leg.shares*leg.price,false),0);

  return (
    // Pending items 54/56/57: charts + Price range move to a right-hand
    // stack while the other stat cards stay on the left, on wide viewports
    // — see main.css's .position-split comment for the mobile-order
    // tradeoff (left-column content shows first when collapsed to one
    // column, not the original top-to-bottom order).
    <div>

    <div>
    <div>

      {(section === 'all' || section === 'current' || section === 'position') && isOpen && (
        <DetailCard section={section} title={<span>Portfolio overview <StatSourceBadge source="official" /></span>} className="mb-12">
          <div className="current-position-sections">
            <section className="current-position-section"><h4>Holding</h4><div className="current-position-lead"><div className="current-position-metrics"><div className="current-position-metric current-position-primary"><span>Shares</span><strong className="shares-box">{fmt(shares,0)}</strong>{profitableShares>0&&<small>{fmt(profitableShares,0)} profitable shares</small>}</div><div className="current-position-metric"><span>Current price</span><strong>{mp>0?fmtQSEPrice(mp):'—'}</strong></div></div><div className="current-position-trend"><span>Trend</span><Sparkline data={sparkData} formatValue={fmtQSEPrice}/></div></div></section>
            <section className="current-position-section"><h4>Cost basis</h4><div className="current-position-metrics"><div className="current-position-metric current-position-primary current-position-break-even"><Tooltip text="The selling price per share required to recover the invested capital and estimated sell fees."><span className="clickable">Break-even / share</span></Tooltip><strong>{fmtQSEPrice(be)}</strong><small>Including sell fees</small></div><div className="current-position-metric"><Tooltip text="Average acquisition cost per share, including buy fees."><span className="clickable">Average cost / share</span></Tooltip><strong>{fmtQSEPrice(avg)}</strong><small>After buy fees</small></div></div></section>
            <section className="current-position-section"><h4>Performance</h4><div className="current-position-metrics"><div className="current-position-metric current-position-primary"><span>Unrealized P/L</span><strong className={Number.isFinite(profit)?profit>=0?'text-profit':'text-loss':undefined}>{Number.isFinite(profit)?`${profit>=0?'▲':'▼'} ${fmtMoney(profit,currency)} · ${((profit/invested)*100).toFixed(1)}%`:'—'}</strong></div><div className="current-position-metric"><span>Realized P/L</span><strong className={(position?.realized||0)>=0?'text-profit':'text-loss'}>{fmtMoney(position?.realized||0,currency)}</strong></div><div className="current-position-metric"><span>Net P/L</span><strong className={Number.isFinite(profit)?(position?.realized||0)+profit>=0?'text-profit':'text-loss':undefined}>{Number.isFinite(profit)?fmtMoney((position?.realized||0)+profit,currency):'—'}</strong></div></div></section>
            <section className="current-position-section"><h4>Valuation</h4><div className="current-position-metrics"><div className="current-position-metric current-position-primary"><span>Net liquidation value</span><strong className={Number.isFinite(profit)?profit>=0?'text-profit':'text-loss':undefined}>{Number.isFinite(netValue)?`${profit>=0?'▲':'▼'} ${fmtMoney(netValue,currency)}`:'—'}</strong><small>After estimated sell fees</small></div><div className="current-position-metric"><span>Market value</span><strong>{mp>0?fmtMoney(value,currency):'—'}</strong></div><div className="current-position-metric"><span>Net invested</span><strong>{fmtMoney(invested,currency)}</strong><small>Including buy fees</small></div></div></section>
            <section className="current-position-section current-position-comparison"><h4>Price comparison</h4><CompactChart height={Math.max(180, comparisonLabels.length * 36)}><Bar data={{labels:comparisonLabels,datasets:[{data:comparisonValues,backgroundColor:comparisonValues.map((_,index)=>{const baseCount=lastSellPrice>0?4:3;const baseColors=lastSellPrice>0?[STOCK_BUY_COLOR,STOCK_SELL_COLOR,'#a78bfa','#c9a35a']:[STOCK_BUY_COLOR,'#a78bfa','#c9a35a'];return index<baseCount?baseColors[index]:index<baseCount+dailyBounds.length?'#38bdf8':'#64748b';}),maxBarThickness:20}]}} options={{maintainAspectRatio:false,indexAxis:'y',interaction:{mode:'nearest',axis:'y',intersect:false},plugins:{legend:{display:false},datalabels:{display:true,formatter:value=>fmtQSEPrice(Number(value))},tooltip:{callbacks:{title:items=>comparisonTerms[items[0]?.dataIndex]||'',label:context=>fmtQSEPrice(Number(context.raw))}}},scales:{x:{min:Math.max(0,comparisonLow-comparisonPadding),max:comparisonHigh+comparisonPadding,ticks:{callback:value=>fmtQSEPrice(Number(value))}},y:{ticks:{autoSkip:false}}}}}/></CompactChart></section>
            <section className="current-position-section" style={hueStyle(statusHue||HUES[6])}><h4>Suggestions</h4><div className="current-position-metrics"><div className="current-position-metric current-position-primary"><span>Status</span><strong className={`pill ${statusClass} current-position-status`}>{statusLabel}</strong></div><div className="current-position-metric"><span>Exit targets</span><strong className="current-position-targets">+1% {fmtQSEPrice(exitTarget(1))}<br/>+2% {fmtQSEPrice(exitTarget(2))}<br/>+5% {fmtQSEPrice(exitTarget(5))}</strong></div></div></section>
            <section className="current-position-section" style={hueStyle(HUES[6])}><h4>Planned activity</h4><div className="current-position-metrics"><div className="current-position-metric"><span>Pending / planned</span><strong>{pendingPlans.length} / {openPlans.length}</strong></div><div className="current-position-metric"><span>Buy cost including fees</span><strong>{fmtMoney(plannedBuyCost,currency)}</strong></div><div className="current-position-metric"><span>Net sell proceeds</span><strong>{fmtMoney(plannedSellProceeds,currency)}</strong></div><div className="current-position-metric current-position-primary"><span>Cash required</span><strong>{fmtMoney(plannedBuyCost-plannedSellProceeds,currency)}</strong></div><div className="current-position-metric"><span>Projected shares</span><strong>{fmt(shares+plannedLegs.reduce((sum,leg)=>sum+(leg.action==='BUY'?leg.shares:-leg.shares),0),0)}</strong></div></div></section>
          </div>
          <div className="current-position-supporting"><StatCard2 label="Estimated exit fees" value={<>{mp>0?fmtMoney(sellFee,currency):'—'}</>} description={<>At current price</>} /><StatCard2 label="Estimated exit fees" value={<>{fmtMoney(calcFee(be*shares,false),currency)}</>} description={<>At break-even</>} /><StatCard2 label="Trade dates" value={<>{position?.firstDate||'—'}</>} description={<>{position?.lastDate?`to ${position.lastDate}`:'—'}</>} /><StatCard2 label="Lifetime fees paid" value={<>{fmtMoney((position?.buyFees||0)+(position?.sellFees||0),currency)}</>} />{position&&position.sellCount>0&&<StatCard2 label="Average / latest sell" value={<>{fmtQSEPrice(avgSellPrice)}</>} description={<>Latest {fmtQSEPrice(lastSellPrice)}</>} />}<StatCard2 label="Lifetime bought / sold" value={<>{fmt(position?.totalBoughtShares||0,0)} / {fmt(position?.totalSoldShares||0,0)}</>} description={<>{position?.buyCount||0} buys · {position?.sellCount||0} sells</>} /></div>
        </DetailCard>
      )}

      {/* All-time stats: the thing closed positions were missing entirely —
          shares/avg-cost/break-even are meaningless once a position is
          fully closed, but the lifetime record (what was bought, sold,
          realized, and over what period) is exactly what you'd want to
          look back on. */}
      {(section === 'all' || section === 'all-time') && position && (position.buyCount > 0 || position.sellCount > 0) && (
        <DetailCard section={section} title={<span>All-time stats <StatSourceBadge source="official" /></span>} className="mb-12">
          <SummarySections className="stock-all-time-summary">
            <SummarySection title="Trading activity">
              <SummaryValue label="Bought / sold" value={`${fmt(position.totalBoughtShares, 0)} / ${fmt(position.totalSoldShares, 0)}`} primary detail={`${position.buyCount} buys · ${position.sellCount} sells`} />
              {position.sellCount > 0 && <SummaryValue label={<Tooltip text="Weighted average, and most recent, sell price for this ticker.">Sell price</Tooltip>} value={fmtQSEPrice(avgSellPrice)} detail={`Latest ${fmtQSEPrice(lastSellPrice)}`} />}
              <SummaryValue label="Trade dates" value={position.firstDate} detail={`to ${position.lastDate}`} />
              {!isOpen && <SummaryValue label="Holding period" value={`${holdingDays} days`} />}
            </SummarySection>
            <SummarySection title="Returns & fees">
              <SummaryValue label="Realized P/L" value={fmtMoney(position.realized, currency)} tone={position.realized >= 0 ? 'positive' : 'negative'} primary />
              <SummaryValue label="Fees paid" value={fmtMoney(position.buyFees + position.sellFees, currency)} />
              {(position.unmatchedSellShares ?? 0) > 0 && <SummaryValue label="Unmatched sells" value={fmt(position.unmatchedSellShares ?? 0, 0)} detail={`${position.unmatchedSellTransactions ?? 1} transaction(s) require reconciliation`} tone="negative" />}
            </SummarySection>
          </SummarySections>
        </DetailCard>
      )}

      {/* Open lots — official (this workbook's own real remaining lots,
          same engine as avg/BE above) when costBasisMethod is lot-based,
          else the independent pure-reporting fallback. See `usingLots`'
          own doc comment. */}
      {(section === 'all' || section === 'lots') && (usingLots ? (
        sortedOfficialLots.length > 0 && (
          <DetailCard section={section} title={<span>Open Lots <StatSourceBadge source="official" /></span>} className="mb-12">
            <div className="table-scroll">
              <table>
                <thead><tr><LotTh col="buyDate">Buy date</LotTh><LotTh col="buyPrice">Buy price</LotTh><LotTh col="remainingShares">Remaining</LotTh><LotTh col="costPerShare">Cost/share</LotTh></tr></thead>
                <tbody>
                  {sortedOfficialLots.slice(safeLotPage * 50, (safeLotPage + 1) * 50).map((lot, i) => (
                    <RecordRow market="qse" record={lot} key={i}>
                      <td>{lot.buyDate}</td>
                      <td>{fmtQSEPrice(lot.buyPrice)}</td>
                      <td><span className="shares-box">{fmt(lot.remainingShares, 0)}</span></td>
                      <td>{fmtQSEPrice(lot.buyPrice + lot.buyFeeTotal / lot.originalShares)}</td>
                    </RecordRow>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted" style={{ marginTop: 4 }}>
              A future sell of {ticker} will consume {workbook.settings.costBasisMethod === 'fifo' ? 'the oldest lot first (FIFO)' : 'the cheapest lot first'}, unless it targets a specific lot via "Sell this lot."
            </p>
          </DetailCard>
        )
      ) : (
        reportOpenLots.length > 0 && (
          <DetailCard section={section} title={<span>Open Lots <StatSourceBadge source="history" /></span>} className="mb-12">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><dateSort.Th rows={reportOpenLots} column="date">Buy date</dateSort.Th><th>Buy price</th><th>Shares</th><th>Invested</th><th>Buy fee</th></tr>
                </thead>
                <tbody>
                  {dateSort.rows(reportOpenLots, { date: row => row.buyDate }).slice(safeLotPage * 50, (safeLotPage + 1) * 50).map((l, i) => (
                    <RecordRow market="qse" record={l} key={i}>
                      <td>{l.buyDate}</td>
                      <td>{fmtQSEPrice(l.buyPrice)}</td>
                      <td><span className="shares-box">{fmt(l.remainingShares, 0)}</span></td>
                      <td>{fmtMoney(l.remainingShares * l.buyPrice, currency)}</td>
                      <td>{fmtMoney(l.buyFeeTotal, currency)}</td>
                    </RecordRow>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailCard>
        )
      ))}


    </div>
    <div>

      {/* Daily price — the single most-asked-about number, so it leads
          instead of being buried under other sections. */}
      {(section === 'all' || section === 'lots') && lotTotal > 0 && <Pagination page={safeLotPage} pageCount={lotPages} total={lotTotal} onChange={setLotPage}/>}
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
                plugins: { legend: { display: false }, datalabels:{display:true,formatter:value=>fmtQSEPrice(Number(value))}, tooltip:{callbacks:{title:items=>comparisonTerms[items[0]?.dataIndex] || '',label:context=>fmtQSEPrice(Number(context.raw))}} },
                // Done item 138: Chart.js's autoSkip was silently dropping
                // "Sold"/"Break-even" labels from this 4-row category axis.
                scales: { x:{min:Math.max(0,comparisonLow-comparisonPadding),max:comparisonHigh+comparisonPadding,ticks:{callback:value=>fmtQSEPrice(Number(value))}},y: { ticks: { autoSkip: false } } },
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
                  {sortedRecent.map((p, rowIndex) => {
                    const rawIndex = rawHistory.indexOf(p);
                    return editPriceIndex === rawIndex && editPriceRow ? (
                      <RecordRow market="qse" record={p} onCancel={cancelEditPrice} key={rawIndex >= 0 ? 'manual:'+rawIndex : 'shared:'+rowIndex}>
                        <td><input type="date" value={editPriceRow.date} onChange={(e) => setEditPriceRow({ ...editPriceRow, date: e.target.value })} className="w-130" /></td>
                        <td><PriceInput exchange="qse" type="number" step="0.001" value={editPriceRow.price} onChange={(e) => setEditPriceRow({ ...editPriceRow, price: Number(e.target.value) })} className="w-90" /></td>
                        <td>
                          <IconButton label="Save" icon={<SaveIcon size={12} />} onClick={saveEditPrice} />
                          <IconButton label="Cancel" icon={<XIcon size={12} />} onClick={cancelEditPrice} />
                        </td>
                      </RecordRow>
                    ) : (
                      <RecordRow market="qse" onEdit={() => startEditPrice(rawIndex, p)}    record={p}  key={rawIndex >= 0 ? 'manual:'+rawIndex : 'shared:'+rowIndex}>
                        <td>{p.time ? new Date(p.time).toLocaleString() : p.date}</td>
                        <td>{fmtQSEPrice(p.price)} {rawIndex < 0 && <small>Shared feed</small>}</td>
                        <td>
                          <IconButton label="Edit" disabled={rawIndex < 0} icon={<EditIcon size={12} />} onClick={() => startEditPrice(rawIndex, p)} />
                          <IconButton label="Delete" disabled={rawIndex < 0} icon={<TrashIcon size={12} />} onClick={() => removePricePoint(rawIndex)} />
                        </td>
                      </RecordRow>
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
          Naturally absent for a still-fully-open position (nothing sold
          yet to show), matching the "skip Selling data" half of the ask. */}
      {(section === 'all' || section === 'closed') && sortedClosedTrades.length > 0 && (
        <DetailCard section={section} title={<span>Closed round-trips <StatSourceBadge source="history" /></span>} className="mb-12">
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
                {sortedClosedTrades.slice(safeClosedPage * 50, (safeClosedPage + 1) * 50).map((t, i) => {
                  const totalBuy = t.shares * t.buyPrice;
                  const totalSale = t.shares * t.sellPrice;
                  const costBasis = totalBuy + t.buyFee;
                  const be = breakEvenPrice(costBasis, t.shares, workbook.settings.feePct, workbook.settings.tick, calcFee);
                  return (
                    <RecordRow market="qse" record={t} key={i}>
                      <td>{t.buyDate}<br /><span className="text-muted">{fmtQSEPrice(t.buyPrice)} · {fmtMoney(totalBuy, currency)}</span><br /><span className="text-muted">fee {fmtMoney(t.buyFee, currency)}</span></td>
                      <td>{t.sellDate}<br /><span className="text-muted">{fmtQSEPrice(t.sellPrice)} · {fmtMoney(totalSale, currency)}</span><br /><span className="text-muted">fee {fmtMoney(t.sellFee, currency)}</span></td>
                      <td><span className="shares-box">{fmt(t.shares, 0)}</span></td>
                      <td>{fmtQSEPrice(be)}</td>
                      <td className={t.netPL >= 0 ? 'text-profit' : 'text-loss'}>
                        {fmtMoney(t.netPL, currency)}
                        <br /><span className="text-muted">{fmtMoney(t.netPL / t.shares, currency)}/sh</span>
                      </td>
                      <td>{t.holdingDays}d</td>
                    </RecordRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DetailCard>
      )}
      
      {(section === 'all' || section === 'closed') && sortedClosedTrades.length > 0 && <Pagination page={safeClosedPage} pageCount={closedPages} total={sortedClosedTrades.length} onChange={setClosedPage}/>}
    </div>
  );
}
