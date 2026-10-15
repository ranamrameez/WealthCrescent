import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { lazy, useState } from 'react';
import { Link, MemoryRouter, Route, useNavigate } from 'react-router-dom';
import { LoadingSurface } from '../LoadingSurface';
import { PageContent } from '../PageContent';
import { StandardPageSections } from '../StandardPageSections';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('keeps the mask until async content and its paint are ready without remounting it', async () => {
  let mounts = 0;
  function Content() { const [value] = useState(() => ++mounts); return <p>Content {value}</p>; }
  const { container, rerender } = render(<LoadingSurface><div aria-busy="true"><Content /></div></LoadingSurface>);
  const surface = container.firstElementChild!;
  expect(surface).toHaveAttribute('aria-busy', 'true');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
  expect(surface).toHaveAttribute('aria-busy', 'true');
  rerender(<LoadingSurface><div aria-busy="false"><Content /></div></LoadingSurface>);
  await waitFor(() => expect(surface).toHaveAttribute('aria-busy', 'false'));
  expect(mounts).toBe(1);
  expect(container.querySelector('.content-load-mask')).not.toHaveClass('is-loading');
});

it('waits for an eager image to finish, including failed images', async () => {
  let complete = false;
  const { container } = render(<LoadingSurface><img alt="Ticker" /></LoadingSurface>);
  const image = screen.getByAltText('Ticker');
  Object.defineProperty(image, 'complete', { get: () => complete });
  fireEvent.load(image);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
  expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  complete = true;
  fireEvent.error(image);
  await waitFor(() => expect(container.firstElementChild).toHaveAttribute('aria-busy', 'false'));
});

it('does not remount a page or reopen Broker Style when query selections change', async () => {
  function Dashboard() {
    const navigate = useNavigate();
    const [count, setCount] = useState(0);
    return <><button onClick={() => setCount(n => n + 1)}>Count {count}</button>
      <button onClick={() => navigate('?section=strategic')}>Strategic link</button>
      <StandardPageSections defaultKey="broker" sections={[
        { key: 'broker', label: 'Broker Style', content: 'Broker contents', defaultOpen: true },
        { key: 'strategic', label: 'Strategic Trades', content: 'Strategic contents' },
      ]} /></>;
  }
  render(<MemoryRouter useTransitions={false} initialEntries={['/qse?section=broker']}><PageContent><Route path="/qse" element={<Dashboard />} /></PageContent></MemoryRouter>);
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Count 0' }));
  fireEvent.click(screen.getByRole('button', { name: 'Broker Style', expanded: true }));
  await waitFor(() => expect(screen.queryByText('Broker contents')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Strategic link' }));
  await waitFor(() => expect(screen.getByText('Strategic contents')).toBeVisible());
  expect(screen.queryByText('Broker contents')).toBeNull();
  expect(screen.getByRole('button', { name: 'Count 1' })).toBeVisible();
});

it('keeps the page mask in place while the destination module is loading', async () => {
  let finish!: (value: { default: () => React.ReactNode }) => void;
  const Destination = lazy(() => new Promise<{ default: () => React.ReactNode }>(resolve => { finish = resolve; }));
  const { container } = render(<MemoryRouter useTransitions={false} initialEntries={['/']}>
    <Link to="/destination">Destination</Link>
    <PageContent><Route path="/" element={<p>Original page</p>} /><Route path="/destination" element={<Destination />} /></PageContent>
  </MemoryRouter>);
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  fireEvent.click(screen.getByRole('link', { name: 'Destination' }));
  await waitFor(() => expect(container.querySelector('.page-loading-surface')).toHaveAttribute('aria-busy', 'true'));
  expect(screen.queryByText('Destination content')).toBeNull();
  await act(async () => finish({ default: () => <p>Destination content</p> }));
  await waitFor(() => expect(container.querySelector('.page-loading-surface')).toHaveAttribute('aria-busy', 'false'));
  expect(screen.getByText('Destination content')).toBeVisible();
});

it('starts destination pages at the top but preserves scrolling for query changes', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  render(<MemoryRouter useTransitions={false} initialEntries={['/qse']}>
    <Link to="/qse?section=broker">Section</Link><Link to="/portfolio">Portfolio</Link>
    <PageContent><Route path="/qse" element={<p>Dashboard</p>} /><Route path="/portfolio" element={<p>Portfolio content</p>} /></PageContent>
  </MemoryRouter>);
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(window.history.scrollRestoration).toBe('manual');
  scroll.mockClear();
  fireEvent.click(screen.getByRole('link', { name: 'Section' }));
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(scroll).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('link', { name: 'Portfolio' }));
  await waitFor(() => expect(screen.getByText('Portfolio content')).toBeVisible());
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0, behavior: 'instant' });
});
