import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { PartialTradeAlertsPopup } from '../PartialTradeAlertsPopup';
import { useWorkbookStore } from '../../store/workbookStore';
import { usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import { usePartialTradeAlertDismissalStore } from '../../store/partialTradeAlertDismissalStore';

const qse = useWorkbookStore.getState().workbook;
const psx = usePSXWorkbookStore.getState().workbook;
afterEach(() => {
  useWorkbookStore.setState({ workbook: qse });
  usePSXWorkbookStore.setState({ workbook: psx });
});

it('opens on a price rise after mount and clears when the lots become unprofitable', () => {
  usePartialTradeAlertDismissalStore.setState({ dismissed: {} });
  usePSXWorkbookStore.setState({ workbook: { ...psx, transactions: [] } });
  useWorkbookStore.setState({ workbook: { ...qse, settings: { ...qse.settings, partialTradeAlertsEnabled: true }, transactions: [{ date: '2026-01-01', ticker: 'QFLS', action: 'BUY', shares: 68, price: 10 }], marketPrices: { QFLS: 9 } } });
  render(<MemoryRouter><PartialTradeAlertsPopup /></MemoryRouter>);
  expect(screen.queryByText('QSE QFLS')).toBeNull();
  act(() => useWorkbookStore.getState().setMarketPrice('QFLS', 12.1));
  expect(screen.getByText('QSE QFLS')).toBeTruthy();
  act(() => useWorkbookStore.getState().setMarketPrice('QFLS', 9));
  expect(screen.queryByText('QSE QFLS')).toBeNull();
});
