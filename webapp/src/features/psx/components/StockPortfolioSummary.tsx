import { PositionDetail } from './PositionDetail';

export function StockPortfolioSummary({ticker}:{ticker:string}) {
  return <div className="stock-portfolio-summary">
    <div className="stock-portfolio-detail-grid"><div><PositionDetail ticker={ticker} section="position" /></div><div><PositionDetail ticker={ticker} section="comparison" /></div></div>
  </div>;
}
