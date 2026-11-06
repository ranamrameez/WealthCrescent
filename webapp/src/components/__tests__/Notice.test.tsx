import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Notice } from '../Notice';
afterEach(cleanup);
it('dismisses an alert and reveals a new message instead of leaving it hidden', () => {
  const view = render(<Notice>First message</Notice>);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
  expect(screen.queryByText('First message')).toBeNull();
  view.rerender(<Notice>New message</Notice>);
  expect(screen.getByText('New message')).toBeTruthy();
});
it('keeps required non-dismissible content visible', () => {
  render(<Notice dismissible={false}>Required confirmation</Notice>);
  expect(screen.queryByRole('button', { name: 'Dismiss notice' })).toBeNull();
  expect(screen.getByText('Required confirmation')).toBeTruthy();
});
