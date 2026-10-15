import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { StandardPageSections } from '../StandardPageSections';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Dashboard() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  return <>
    <button onClick={() => setCount(n => n + 1)}>Local count {count}</button>
    <button onClick={() => navigate('?section=strategic')}>Select strategic</button>
    <StandardPageSections defaultKey="broker" sections={[
      { key: 'broker', label: 'Broker Style', defaultOpen: true, content: 'Broker contents' },
      { key: 'strategic', label: 'Strategic Trades', defaultOpen: true, content: 'Strategic contents' },
    ]} />
  </>;
}

function setup(entry: string) {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  return render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/qse" element={<Dashboard />} /></Routes></MemoryRouter>);
}

it('keeps Broker Style closed when clearing the selected section', () => {
  const { container } = setup('/qse?section=broker');
  fireEvent.click(screen.getByRole('button', { name: 'Broker Style', expanded: true }));
  expect(screen.queryByText('Broker contents')).toBeNull();
  expect(screen.getByRole('button', { name: 'Broker Style', expanded: false })).toBeVisible();
  expect(screen.getByText('Strategic contents')).toBeVisible();
  expect(container.querySelector('.standard-card-body')?.parentElement).toHaveClass('standard-card');
  expect(container.querySelector('.section-transition')).toBeNull();
});

it('keeps section and page state while URL selections change', () => {
  setup('/qse');
  fireEvent.click(screen.getByRole('button', { name: 'Local count 0' }));
  fireEvent.click(screen.getByRole('button', { name: 'Broker Style', expanded: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Select strategic' }));
  expect(screen.queryByText('Broker contents')).toBeNull();
  expect(screen.getByText('Strategic contents')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Local count 1' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Strategic Trades', expanded: true }));
  expect(screen.queryByText('Strategic contents')).toBeNull();
  expect(screen.queryByText('Broker contents')).toBeNull();
});
