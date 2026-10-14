import { useQseFeed } from '../../features/qse/hooks/useLiveQseWorkbook';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { PartialTradeAlertsPopup } from '../PartialTradeAlertsPopup';
import { useWorkbookStore } from '../../store/workbookStore';
import { usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import { usePartialTradeAlertDismissalStore } from '../../store/partialTradeAlertDismissalStore';

const qse = useWorkbookStore.getState().workbook;
const psx = usePSXWorkbookStore.getState().workbook;
afterEach(() => {
  cleanup();
  useQseFeed.setState({points:{}});
  useWorkbookStore.setState({ workbook: qse });
  usePSXWorkbookStore.setState({ workbook: psx });
  vi.unstubAllGlobals();
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

it('triggers from shared QSE prices while a different app page is open', () => {
  usePartialTradeAlertDismissalStore.setState({dismissed:{}});
  usePSXWorkbookStore.setState({workbook:{...psx,transactions:[]}});
  useWorkbookStore.setState({workbook:{...qse,settings:{...qse.settings,partialTradeAlertsEnabled:true},priceHistory:{},transactions:[{date:'2026-01-01',ticker:'QFLS',action:'BUY',shares:68,price:10}],marketPrices:{QFLS:9}}});
  render(<MemoryRouter initialEntries={['/subscriptions']}><PartialTradeAlertsPopup /></MemoryRouter>);
  expect(screen.queryByText('QSE QFLS')).toBeNull();
  act(()=>useQseFeed.setState({points:{QFLS:[{date:'2026-10-12',time:'2026-10-12T09:00:00Z',price:12.1}]}}));
  expect(screen.getByText('QSE QFLS')).toBeTruthy();
  act(()=>useQseFeed.setState({points:{QFLS:[{date:'2026-10-12',time:'2026-10-12T09:01:00Z',price:9}]}}));
  expect(screen.queryByText('QSE QFLS')).toBeNull();
});
it('respects the disabled popup setting even when shared prices are profitable',()=>{
  useWorkbookStore.setState({workbook:{...qse,settings:{...qse.settings,partialTradeAlertsEnabled:false},transactions:[{date:'2026-01-01',ticker:'QFLS',action:'BUY',shares:68,price:10}],marketPrices:{QFLS:12.1}}});
  usePSXWorkbookStore.setState({workbook:{...psx,transactions:[]}});
  render(<MemoryRouter><PartialTradeAlertsPopup /></MemoryRouter>);
  expect(screen.queryByLabelText('Profitable share notifications')).toBeNull();
});

it('sends a desktop P/L alert without requiring the popup setting', () => {
  const notify = Object.assign(vi.fn(), { permission: 'granted', requestPermission: vi.fn() });
  vi.stubGlobal('Notification', notify);
  usePartialTradeAlertDismissalStore.setState({ dismissed: {} });
  usePSXWorkbookStore.setState({ workbook: { ...psx, transactions: [] } });
  useWorkbookStore.setState({ workbook: {
    ...qse,
    settings: { ...qse.settings, partialTradeAlertsEnabled: false, desktopProfitAlertsEnabled: true },
    transactions: [{ date: '2026-01-01', ticker: 'QFLS', action: 'BUY', shares: 68, price: 10 }],
    marketPrices: { QFLS: 12.1 },
  } });
  render(<MemoryRouter><PartialTradeAlertsPopup /></MemoryRouter>);
  expect(screen.queryByLabelText('Profitable share notifications')).toBeNull();
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify.mock.calls[0][0]).toContain('QSE QFLS');
  expect(notify.mock.calls[0][1].body).toContain('P/L');
});
