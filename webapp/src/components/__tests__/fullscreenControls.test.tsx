import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Modal } from '../Modal';
import { StandardCard } from '../StandardCard';

afterEach(cleanup);

it.each([
  ['dialog', <Modal title="Details" onClose={vi.fn()} manageFocus>Content</Modal>],
  ['section card', <StandardCard title="Details">Content</StandardCard>],
])('uses a distinct icon and label when exiting full screen in a %s', (_, component) => {
  render(component);
  const button = screen.getByRole('button', { name: 'Full screen' });
  const expand = button.querySelector('path')?.getAttribute('d');
  expect(expand).toBeTruthy();
  fireEvent.click(button);
  const exit = screen.getByRole('button', { name: 'Exit full screen' });
  const collapse = exit.querySelector('path')?.getAttribute('d');
  expect(collapse).toBeTruthy();
  expect(collapse).not.toBe(expand);
  fireEvent.click(exit);
  expect(screen.getByRole('button', { name: 'Full screen' }).querySelector('path')?.getAttribute('d')).toBe(expand);
});
