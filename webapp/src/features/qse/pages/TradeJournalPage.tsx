import { ExchangeJournal } from '../../stocks/pages/ExchangeJournal';
import { useQSEDerived } from '../hooks/useQSEDerived';

export function TradeJournalPage() {
  const { workbook, calcFee, realizedBySellTxId } = useQSEDerived();
  return <ExchangeJournal exchange="QSE" transactions={workbook.transactions}
    currency={workbook.settings.currency} calcFee={calcFee} realizedBySellTxId={realizedBySellTxId} />;
}
