import { RecordRow } from './RecordRow';
import { ProfitableStockAlert } from './ProfitableStockAlert';
import { useSortableRows } from '../hooks/useSortableRows';
import { profitableLotTotals, sellableShareSummary, type LotAdvice } from '../lib/calc/partialTradeStrategy';
import { fmt, fmtMoney, fmtPSXPrice, fmtQSEPrice } from '../lib/format';

type LotCol = 'buyDate' | 'buyPrice' | 'remainingShares' | 'costPerShare' | 'breakEven' | 'grossPL' | 'unrealizedPL' | 'suggestion';

export function PartialTradeAdviceTable({ advice, currentPrice, currency, exchange, ticker, onSellLot, onSellLots }: {
  advice: LotAdvice[];
  currentPrice: number;
  currency: string;
  exchange: 'psx' | 'qse';
  ticker: string;
  onSellLot: (lot: LotAdvice) => void;
  onSellLots: (lots: LotAdvice[]) => void;
}) {
  const priceFormat = exchange === 'psx' ? fmtPSXPrice : fmtQSEPrice;
  const { sellable, total } = sellableShareSummary(advice);
  const totals = profitableLotTotals(advice, currentPrice);
  const { sorted, Th } = useSortableRows(advice, (lot: LotAdvice, col: LotCol) => lot[col], 'buyDate', 'desc');

  return <div className="mb-md">
    {sellable > 0
      ? <ProfitableStockAlert sellable={sellable} total={total} price={currentPrice} {...totals} currency={currency} exchange={exchange} onSell={() => onSellLots(advice.filter(lot => lot.suggestion === 'sell'))} />
      : <p className="text-muted mb-sm">No lot of {ticker.toUpperCase()} is profitable at the current price ({priceFormat(currentPrice)}) yet.</p>}
    <div className="table-scroll">
      <table>
        <thead><tr><Th col="buyDate">Buy date</Th><Th col="buyPrice">Buy price</Th><Th col="remainingShares">Shares</Th><Th col="costPerShare">Cost/share</Th><Th col="breakEven">Break-even</Th><Th col="grossPL">Gross P/L @ sale</Th><Th col="unrealizedPL">Net P/L after commission</Th><Th col="suggestion">Suggestion</Th><th /></tr></thead>
        <tbody>{sorted.map((lot, index) => <RecordRow market={exchange} record={lot} key={lot.buyId ?? `${lot.buyDate}:${index}`}>
          <td>{lot.buyDate}</td><td>{priceFormat(lot.buyPrice)}</td><td>{fmt(lot.remainingShares, 0)}</td><td>{priceFormat(lot.costPerShare)}</td><td>{priceFormat(lot.breakEven)}</td>
          <td className={lot.grossPL >= 0 ? 'pill-positive' : 'pill-negative'}>{fmtMoney(lot.grossPL, currency)}</td>
          <td className={lot.unrealizedPL >= 0 ? 'pill-positive' : 'pill-negative'}>{fmtMoney(lot.unrealizedPL, currency)}</td>
          <td><span className={lot.suggestion === 'sell' ? 'pill-positive' : 'text-muted'}>{lot.suggestion === 'sell' ? 'Sell' : 'Hold'}</span></td>
          <td>{lot.suggestion === 'sell' && <button className="btn secondary small" onClick={() => onSellLot(lot)}>Sell this lot</button>}</td>
        </RecordRow>)}</tbody>
      </table>
    </div>
  </div>;
}
