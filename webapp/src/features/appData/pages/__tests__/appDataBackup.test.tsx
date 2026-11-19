import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ export: vi.fn(), review: vi.fn(), restore: vi.fn(), confirm: vi.fn(), toast: vi.fn(), current: { uid: 'owner' } }));
vi.mock('../../../../services/appData/fullBackupService', () => ({ exportFullCloudBackup: mocks.export, reviewFullBackup: mocks.review, restoreReviewedFullBackup: mocks.restore }));
vi.mock('../../../../lib/firebase/useAuthState', () => ({ useAuthState: () => ({ user: mocks.current }), getCurrentUser: () => mocks.current }));
vi.mock('../../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
vi.mock('../../../../components/ConfirmDialog', () => ({ confirmDialog: mocks.confirm }));
vi.mock('../../../../components/Toast', () => ({ toast: mocks.toast }));
import { AppDataPage } from '../AppDataPage';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
function upload() {
  const file = new File(['{}'], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => '{"cash":{"entries":[]}}' });
  fireEvent.change(screen.getByLabelText('Backup JSON file'), { target: { files: [file] } });
}
it('downloads a complete cloud snapshot through the account service and offers local recovery separately', async () => {
  const create = vi.fn(() => 'blob:backup');
  Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  mocks.export.mockResolvedValue({ cash: { entries: [] }, paymentExecutions: [] });
  render(<MemoryRouter><AppDataPage /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Export local workbooks' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Export full cloud backup' }));
  await waitFor(() => expect(mocks.export).toHaveBeenCalledWith('owner'));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  expect(mocks.toast).toHaveBeenCalledWith('Full cloud backup downloaded, including payment execution history.');
});
it('reviews the file under the signed-in owner and respects cancelled restore confirmation', async () => {
  mocks.review.mockResolvedValue({ owner: 'owner', modules: ['cash'], includesPaymentHistory: false, executionCount: 0 });
  mocks.confirm.mockResolvedValue(false);
  render(<MemoryRouter><AppDataPage /></MemoryRouter>);
  upload();
  await waitFor(() => expect(mocks.review).toHaveBeenCalledWith('owner', { cash: { entries: [] } }));
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
  expect(mocks.restore).not.toHaveBeenCalled();
});
it('reports stale or denied restores without claiming success or changing local workbooks', async () => {
  const preview = { owner: 'owner', modules: ['cash'], includesPaymentHistory: false, executionCount: 0 };
  mocks.review.mockResolvedValue(preview); mocks.confirm.mockResolvedValue(true);
  mocks.restore.mockRejectedValue(new Error('Cloud data changed. Review again.'));
  render(<MemoryRouter><AppDataPage /></MemoryRouter>);
  upload();
  await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith(preview));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Cloud data changed. Review again.'));
  expect(mocks.toast).not.toHaveBeenCalledWith('Backup restored. Selected workbooks are syncing.');
});

it('refreshes only through the acknowledged restore command and reports success', async () => {
  const preview = { owner: 'owner', modules: ['cash'], includesPaymentHistory: false, executionCount: 0 };
  mocks.review.mockResolvedValue(preview); mocks.confirm.mockResolvedValue(true); mocks.restore.mockResolvedValue(undefined);
  render(<MemoryRouter><AppDataPage /></MemoryRouter>);
  upload();
  await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith(preview));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Backup restored. Selected workbooks are syncing.'));
});
