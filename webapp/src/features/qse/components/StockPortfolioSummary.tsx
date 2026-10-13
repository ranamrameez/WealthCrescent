import { useQSEDerived } from '../hooks/useQSEDerived';
import { PositionDetail } from './PositionDetail';

export function StockPortfolioSummary({ticker}:{ticker:string}) {
  const position=useQSEDerived().positions.find(item=>item.ticker===ticker);
  if(!position?.shares)return <div className="stock-portfolio-summary"><PositionDetail ticker={ticker} section="all-time" /></div>;
  return <div className="stock-portfolio-summary"><PositionDetail ticker={ticker} section="position" /></div>;
}
