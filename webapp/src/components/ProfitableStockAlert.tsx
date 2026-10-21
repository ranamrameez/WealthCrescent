import { Notice } from './Notice';
import { fmt, fmtMoney, fmtPSXPrice, fmtQSEPrice } from '../lib/format';

export function ProfitableStockAlert({ ticker, sellable, total, price, profit, grossProfit, sellFees, grossProceeds, netProceeds, currency, exchange, onSell }: {
  ticker?: string; sellable: number; total: number; price: number; profit: number;
  grossProfit: number; sellFees: number; grossProceeds: number; netProceeds: number; currency: string; exchange: 'psx' | 'qse'; onSell?: () => void;
}) {
  const priceFormat = exchange === 'psx' ? fmtPSXPrice : fmtQSEPrice;
  return <Notice tone="success" className="mb-sm">
    {ticker && <><strong>{ticker}</strong>: </>}<strong>{fmt(sellable, 0)}</strong> of <strong>{fmt(total, 0)}</strong> shares profitable at <strong>{priceFormat(price)}</strong>
    {' · '}Gross P/L at sale price <strong>{fmtMoney(grossProfit, currency)}</strong>
    {' · '}Net P/L after commission <strong>{fmtMoney(profit, currency)}</strong>
    {' · '}Commission <strong>{fmtMoney(sellFees, currency)}</strong>
    {' · '}Gross / net proceeds <strong>{fmtMoney(grossProceeds, currency)} / {fmtMoney(netProceeds, currency)}</strong>
    {onSell && <> <button type="button" className="btn secondary small" onClick={onSell}>Sell</button></>}
  </Notice>;
}
