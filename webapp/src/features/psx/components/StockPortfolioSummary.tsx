import { usePSXDerived } from '../hooks/usePSXDerived';
import { PositionDetail } from './PositionDetail';

export function StockPortfolioSummary({ticker}:{ticker:string}) {
  const position=usePSXDerived().positions.find(item=>item.ticker===ticker);
  return <div className="stock-portfolio-summary">
    {position?.unmatchedSellShares ? <p className="pill-warn" role="status">Reconciliation warning: {position.unmatchedSellShares} sold shares are not matched to recorded buys across {position.unmatchedSellTransactions ?? 1} transaction(s). These excess shares are excluded from realized profit; check for missing buy records.</p> : null}
    <PositionDetail ticker={ticker} section={position?.shares ? "position" : "all-time"} />
  </div>;
}
