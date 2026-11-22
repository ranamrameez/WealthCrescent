import { ExchangeJournal } from '../../stocks/pages/ExchangeJournal';
import { usePSXDerived } from '../hooks/usePSXDerived';

export function TradeJournalPage() {
  const { workbook, calcFee, realizedBySellTxId } = usePSXDerived();
  return <ExchangeJournal exchange="PSX" transactions={workbook.transactions}
    currency={workbook.settings.currency} calcFee={calcFee} realizedBySellTxId={realizedBySellTxId} />;
}
