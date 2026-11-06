import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ remove: vi.fn(), confirm: vi.fn() }));
vi.mock('../../../../services/appData/removeAllFinancialData', () => ({ removeAllFinancialData: mocks.remove }));
vi.mock('../../../../lib/firebase/useAuthState', () => ({ useAuthState: () => ({ user: { uid: 'owner', email: 'owner@example.test' }, authResolved: true }) }));
vi.mock('../../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
vi.mock('../../../../components/ConfirmDialog', () => ({ confirmDialog: mocks.confirm }));
import { AppDataPage } from '../AppDataPage';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('requires the typed phrase and respects cancelled confirmation', async () => {
  mocks.confirm.mockResolvedValue(false);
  render(<MemoryRouter><AppDataPage /></MemoryRouter>);
  const button = screen.getByRole('button', { name: 'Remove all app data' });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole('textbox', { name: 'Deletion confirmation' }), { target: { value: 'DELETE ALL DATA' } });
  fireEvent.click(button);
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('dispatches only the confirmed account and resets the typed phrase after success', async () => {
  mocks.confirm.mockResolvedValue(true); mocks.remove.mockResolvedValue(undefined);
  render(<MemoryRouter><AppDataPage /></MemoryRouter>);
  const input = screen.getByRole('textbox', { name: 'Deletion confirmation' });
  fireEvent.change(input, { target: { value: 'DELETE ALL DATA' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove all app data' }));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('owner'));
  await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
});
