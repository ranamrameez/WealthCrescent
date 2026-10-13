import { usePSXDerived } from '../hooks/usePSXDerived';
import { PositionDetail } from './PositionDetail';

export function StockPortfolioSummary({ticker}:{ticker:string}) {
  const position=usePSXDerived().positions.find(item=>item.ticker===ticker);
  if(!position?.shares)return <div className="stock-portfolio-summary"><PositionDetail ticker={ticker} section="all-time" /></div>;
  return <div className="stock-portfolio-summary">
    <div className="stock-portfolio-detail-grid"><div><PositionDetail ticker={ticker} section="position" /></div><PositionDetail ticker={ticker} section="comparison-summary" /></div>
  </div>;
}
