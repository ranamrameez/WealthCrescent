import { useLiveQseWorkbook } from '../features/qse/hooks/useLiveQseWorkbook';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { computeFIFOPositions } from '../lib/calc/fifoPositions';
import { computeLotAdvice } from '../lib/calc/partialTradeStrategy';
import { getMarketPrice } from '../lib/calc/priceHistory';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { makeQSEFeeCalculator } from '../lib/calc/fees';
import { makePSXFeeCalculator } from '../lib/calc/psxFees';
import { scanPortfolioForOpportunities, type PartialTradeOpportunity } from '../lib/calc/partialTradeStrategy';
import { fmtMoney } from '../lib/format';
import { usePartialTradeAlertDismissalStore } from '../store/partialTradeAlertDismissalStore';
import { useWorkbookStore } from '../store/workbookStore';
import { usePSXWorkbookStore } from '../store/psxWorkbookStore';
import { XIcon } from './icons';

const AUTO_HIDE_MS = 12000;
const today = () => new Date().toISOString().slice(0, 10);

interface AlertRow extends PartialTradeOpportunity {
  exchange: 'qse' | 'psx';
  currency: string;
  key: string;
}

/** App-wide, opt-in alerts for both exchanges, recomputed from live prices.
 * Each occurrence can be dismissed or used to add profitable lots to a plan. */
export function PartialTradeAlertsPopup() {
  const ensureSignedIn = useEnsureSignedIn();
  const planSell = async (row: AlertRow) => {
    if (!(await ensureSignedIn('Sign in to update trade plans.'))) return;
    const state = row.exchange === 'psx' ? usePSXWorkbookStore.getState() : useWorkbookStore.getState();
    const wb = row.exchange === 'qse' ? qseWorkbook : state.workbook;
    const fee = row.exchange === 'psx' ? makePSXFeeCalculator(usePSXWorkbookStore.getState().workbook.settings, wb.transactions) : makeQSEFeeCalculator(useWorkbookStore.getState().workbook.settings);
    const price = getMarketPrice(row.ticker, wb.marketPrices, wb.transactions);
    const lots = computeFIFOPositions(wb.transactions, fee, 'lowestCostFirst').lotsByTicker[row.ticker] || [];
    const advice = computeLotAdvice(lots, fee, price, wb.settings.feePct, wb.settings.tick).filter(lot => lot.suggestion === 'sell');
    const plan = wb.tradePlans.find(item => (item.defaultTicker || item.legs[0]?.ticker) === row.ticker && item.isDefault) || wb.tradePlans.find(item => (item.defaultTicker || item.legs[0]?.ticker) === row.ticker);
    const legs = advice.flatMap(lot => {
      const pending = (plan?.legs || []).filter(leg => !leg.executed && !leg.ignored && leg.action === 'SELL' && leg.ticker === row.ticker && leg.targetLotBuyId === lot.buyId).reduce((sum, leg) => sum + leg.shares, 0);
      const shares = Math.max(0, lot.remainingShares - pending);
      return shares > 0 ? [{ date: today(), ticker: row.ticker, action: 'SELL' as const, shares, price, targetLotBuyId: lot.buyId }] : [];
    });
    if (!legs.length) return;
    if (plan) state.updateTradePlan(plan.id, { legs: [...plan.legs, ...legs] });
    else state.addTradePlan({ id: crypto.randomUUID(), name: row.ticker + ' Plan', createdAt: today(), defaultTicker: row.ticker, isDefault: true, legs });
    setHidden(true);
  };
  const qseWorkbook = useLiveQseWorkbook();
  const {settings:qseSettings,transactions:qseTx,marketPrices:qseMarketPrices} = qseWorkbook;
  const psxSettings = usePSXWorkbookStore((s) => s.workbook.settings);
  const psxTx = usePSXWorkbookStore((s) => s.workbook.transactions);
  const psxMarketPrices = usePSXWorkbookStore((s) => s.workbook.marketPrices);

  const isDismissed = usePartialTradeAlertDismissalStore((s) => s.isDismissed);
  const dismiss = usePartialTradeAlertDismissalStore((s) => s.dismiss);

  // Include incoming shared-feed prices as well as manual price updates.
  const initial = useMemo(() => {
    const rows: AlertRow[] = [];
    const date = today();
    if (qseSettings.partialTradeAlertsEnabled) {
      const calcFee = makeQSEFeeCalculator(qseSettings);
      scanPortfolioForOpportunities(qseTx, calcFee, qseMarketPrices, qseSettings.feePct, qseSettings.tick).forEach((o) => {
        const key = `qse:${o.ticker}:${date}:${o.sellableShares}:${o.bestUnrealizedPL}`;
        if (!isDismissed(key)) rows.push({ ...o, exchange: 'qse', currency: qseSettings.currency, key });
      });
    }
    if (psxSettings.partialTradeAlertsEnabled) {
      const calcFee = makePSXFeeCalculator(psxSettings, psxTx);
      scanPortfolioForOpportunities(psxTx, calcFee, psxMarketPrices, psxSettings.feePct, psxSettings.tick).forEach((o) => {
        const key = `psx:${o.ticker}:${date}:${o.sellableShares}:${o.bestUnrealizedPL}`;
        if (!isDismissed(key)) rows.push({ ...o, exchange: 'psx', currency: psxSettings.currency, key });
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qseSettings, qseTx, qseMarketPrices, psxSettings, psxTx, psxMarketPrices, isDismissed]);

  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => initial.map((d) => d.key));
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setVisibleKeys(initial.map(row => row.key));
    setHidden(false);
    if (!initial.length) return;
    const t = setTimeout(() => setHidden(true), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [initial]);

  const visible = initial.filter((d) => visibleKeys.includes(d.key));
  if (hidden || !visible.length) return null;

  const dismissOne = (key: string) => {
    dismiss(key);
    setVisibleKeys((keys) => keys.filter((k) => k !== key));
  };

  return (
    <div role="status" aria-label="Profitable share notifications"
      style={{
        width: '100%',
        background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 8px 28px rgba(0,0,0,.28)', padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          Profitable shares: {visible.length} ticker{visible.length > 1 ? 's' : ''} sellable
        </div>
        <button className="btn ghost" style={{ padding: 2, minHeight: 22, minWidth: 22 }} aria-label="Close profitable share notifications" onClick={() => setHidden(true)}>
          <XIcon size={13} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map((d) => (
          <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div>
              <Link to={d.exchange === 'psx' ? `/psx/stock/${d.ticker}` : `/stock/${d.ticker}`} style={{ fontWeight: 600, fontSize: 13 }} onClick={() => setHidden(true)}>
                {d.exchange.toUpperCase()} {d.ticker}
              </Link>
              <div className="text-muted">
                {d.sellableShares}/{d.totalShares} sh sellable · {fmtMoney(d.bestUnrealizedPL, d.currency)}
              </div>
            </div>
            <div className="row gap-sm"><button className="btn secondary small" onClick={() => planSell(d)}>Sell</button><button className="btn secondary small" onClick={() => dismissOne(d.key)}>Dismiss</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}
