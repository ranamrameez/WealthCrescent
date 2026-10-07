import { Notice } from './Notice';
import { fmt, fmtMoney, fmtPSXPrice, fmtQSEPrice } from '../lib/format';

export function ProfitableStockAlert({ ticker, sellable, total, price, profit, grossProceeds, netProceeds, currency, exchange, onSell }: {
  ticker?: string; sellable: number; total: number; price: number; profit: number;
  grossProceeds: number; netProceeds: number; currency: string; exchange: 'psx' | 'qse'; onSell?: () => void;
}) {
  const priceFormat = exchange === 'psx' ? fmtPSXPrice : fmtQSEPrice;
  return <Notice tone="success" className="mb-sm">
    {ticker && <><strong>{ticker}</strong>: </>}<strong>{fmt(sellable, 0)}</strong> of <strong>{fmt(total, 0)}</strong> shares profitable at <strong>{priceFormat(price)}</strong>
    {' · '}Estimated profit <strong>{fmtMoney(profit, currency)}</strong>
    {' · '}Sale value <strong>{fmtMoney(grossProceeds, currency)}</strong>
    {' · '}Net proceeds <strong>{fmtMoney(netProceeds, currency)}</strong>
    {onSell && <> <button type="button" className="btn secondary small" onClick={onSell}>Sell</button></>}
  </Notice>;
}
