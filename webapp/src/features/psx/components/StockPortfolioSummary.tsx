import { usePSXDerived } from '../hooks/usePSXDerived';
import { fmtMoney } from '../../../lib/format';
import { PositionDetail } from './PositionDetail';

export function StockPortfolioSummary({ticker}:{ticker:string}) {
  const derived=usePSXDerived();
  const position=derived.positions.find(item=>item.ticker===ticker);
  const currency=derived.workbook.settings.currency;
  return <div className="stock-portfolio-summary">
    {position?.unmatchedSellShares ? <p className="pill-warn" role="status">Reconciliation warning: {position.unmatchedSellShares} sold shares are not matched to recorded buys across {position.unmatchedSellTransactions ?? 1} transaction(s). These excess shares are excluded from realized profit; check for missing buy records.{(position.unmatchedSellFees ?? 0) > 0 ? ` Unmatched SELL fees: ${fmtMoney(position.unmatchedSellFees ?? 0, currency)}.` : ''}</p> : null}
    <PositionDetail ticker={ticker} section={position?.shares ? "position" : "all-time"} />
  </div>;
}
