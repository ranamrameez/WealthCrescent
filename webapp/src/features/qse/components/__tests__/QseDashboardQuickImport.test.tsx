import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWorkbookStore } from '../../../../store/workbookStore';
import { createEmptyWorkbook } from '../../../../store/defaultWorkbook';
import { QseDashboardQuickImport } from '../QseDashboardQuickImport';

vi.mock('../../../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => ({ uid: 'fixture' }) }));
vi.mock('../../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
vi.mock('../../hooks/useQSEStockData', () => ({ useQSEStockData: () => ({ tickerNames: {} }) }));

const original = useWorkbookStore.getState().workbook;
afterEach(() => {
  cleanup();
  useWorkbookStore.getState().setWorkbook(original);
});

it('reviews from the dashboard, saves selected trades, and restores focus', async () => {
  useWorkbookStore.getState().setWorkbook(createEmptyWorkbook());
  render(<QseDashboardQuickImport />);
  const shortcut = screen.getByRole('button', { name: 'Import QSE trades' });
  shortcut.focus();
  fireEvent.click(shortcut);
  const dialog = screen.getByRole('dialog', { name: 'Import QSE trades' });
  const file = new File([], 'fixture.csv');
  Object.defineProperty(file, 'text', { value: async () => 'Date,Type,Count,Unit,Price,Amount\n17/11/2026,Buy,4,GWC,8,-32' });
  fireEvent.change(within(dialog).getByLabelText('The Group statement (.xlsx or .csv)'), { target: { files: [file] } });
  const review = await screen.findByRole('dialog', { name: 'Review The Group trades' });
  expect(review).toBe(dialog);
  expect(within(review).getByText('GWCS')).toBeTruthy();
  expect(useWorkbookStore.getState().workbook.transactions).toEqual([]);
  fireEvent.click(within(review).getByRole('button', { name: 'Select all new trades' }));
  fireEvent.click(within(review).getByRole('button', { name: 'Import selected trades (1)' }));
  expect(useWorkbookStore.getState().workbook.transactions).toMatchObject([{ ticker: 'GWCS', shares: 4 }]);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(shortcut);
});
