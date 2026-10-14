import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DesktopProfitAlertsToggle } from '../DesktopProfitAlertsToggle';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('requests browser permission before saving the opt-in', async () => {
  const requestPermission = vi.fn().mockResolvedValue('granted');
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'default', requestPermission }));
  const onChange = vi.fn();
  render(<DesktopProfitAlertsToggle checked={false} onChange={onChange} />);
  await act(async () => fireEvent.click(screen.getByText('Show P/L alerts as desktop notifications')));
  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(true);
});

it('does not save the opt-in when permission is denied', async () => {
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'denied', requestPermission: vi.fn() }));
  const onChange = vi.fn();
  render(<DesktopProfitAlertsToggle checked={false} onChange={onChange} />);
  await act(async () => fireEvent.click(screen.getByText('Show P/L alerts as desktop notifications')));
  expect(onChange).not.toHaveBeenCalled();
});
