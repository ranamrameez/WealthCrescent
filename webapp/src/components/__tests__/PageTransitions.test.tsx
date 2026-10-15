import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Link, MemoryRouter, Route } from 'react-router-dom';
import { PageRoutes } from '../PageRoutes';
import { StandardCard } from '../StandardCard';
afterEach(cleanup);
it('switches routed content and preserves destination route parameters', async () => {
  render(<MemoryRouter initialEntries={['/']}><Link to="/stock/QFLS">Go to ticker</Link><PageRoutes><Route path="/" element={<p>Dashboard content</p>} /><Route path="/stock/:ticker" element={<p>Ticker content</p>} /></PageRoutes></MemoryRouter>);
  fireEvent.click(screen.getByText('Go to ticker'));
  await waitFor(() => expect(screen.getByText('Ticker content')).toBeVisible());
  expect(screen.queryByText('Dashboard content')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});
it('makes closing sections inert and unmounts their content after the transition', async () => {
  const { container } = render(<StandardCard title="Holdings"><button>Inside content</button></StandardCard>);
  fireEvent.click(screen.getByRole('button', { name: 'Holdings' }));
  expect(container.querySelector('.section-transition')).toHaveAttribute('inert');
  await waitFor(() => expect(screen.queryByText('Inside content')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Holdings' }));
  expect(screen.getByText('Inside content')).toBeVisible();
  expect(container.querySelector('.section-transition')).not.toHaveAttribute('inert');
});
