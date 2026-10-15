import '@testing-library/jest-dom/vitest';
import { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectTopBarSections, useTopBarPageSections } from '../useTopBarPageSections';
import { StandardCard } from '../../components/StandardCard';
import { orderedPageSections } from '../../lib/pageSectionOrder';
import { MemoryRouter } from 'react-router-dom';
import { StandardPageSections } from '../../components/StandardPageSections';
import { usePageTopBarStore } from '../../store/pageTopBarStore';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function Page() {
  const bar = useRef<HTMLDivElement>(null);
  const chips = useTopBarPageSections(bar, [], '/test');
  return <main><div ref={bar} className="page-topbar">{chips.map(chip => <button key={chip.key} className={chip.active ? 'active' : ''} onClick={chip.onClick}>{chip.label}</button>)}</div><StandardCard title="Summary">Summary contents</StandardCard><StandardCard title="Transactions" defaultOpen={false}>Transaction contents</StandardCard></main>;
}

function RegisteredPage() {
  const bar = useRef<HTMLDivElement>(null);
  const registered = usePageTopBarStore(state => state.chips);
  const chips = useTopBarPageSections(bar, registered, '/registered');
  return <main><div ref={bar} className="page-topbar">{chips.map(chip => <button key={chip.key} onClick={chip.onClick}>{chip.label}</button>)}</div><StandardPageSections sections={[{ key: 'summary', label: 'Summary', content: 'Summary contents' }, { key: 'plans', label: 'Plans', content: 'Plan contents', defaultOpen: false }]} /></main>;
}

describe('page section navigation', () => {
  it('includes standalone sections in page order without nested metric cards or modal contents', () => {
    const root = document.createElement('main');
    root.innerHTML = '<div data-page-section="summary" data-section-label="Summary"><section class="standard-card"><header class="standard-card-header"><span class="standard-card-title">Summary</span></header><div class="card"><h3>Metric</h3></div></section></div><section class="card"><h3>Details</h3></section><div class="modal-overlay"><section class="card"><h3>Editor</h3></section></div>';
    expect(collectTopBarSections(root, []).map(item => item.label)).toEqual(['Summary', 'Details']);
  });

  it('orders finance sections without discarding their contents or actions', () => {
    const sections = ['Settings', 'Transactions', 'Plans', 'Accounts', 'Details', 'Analytics', 'Summary'].map(label => ({ key: label.toLowerCase(), label, content: label, action: vi.fn() }));
    const ordered = orderedPageSections(sections);
    expect(ordered.map(item => item.label)).toEqual(['Summary', 'Details', 'Accounts', 'Plans', 'Transactions', 'Analytics', 'Settings']);
    expect(ordered.every(item => sections.includes(item))).toBe(true);
  });

  it('matches strategy plan anchors to their registered controls without duplicating inner cards', () => {
    const root = document.createElement('main');
    root.innerHTML = '<div id="trade-plan-stock" class="standard-section-anchor"><section class="standard-card"><header class="standard-card-header"><span class="standard-card-title">Stock holdings</span></header></section></div>';
    const control = { key: 'stock', label: 'Stock plan', active: false, onClick: vi.fn() };
    const sections = collectTopBarSections(root, [control]);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ key: 'stock', label: 'Stock plan', registered: control });
  });

  it('uses registered section actions to expand without toggling an already open section closed', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { container } = render(<MemoryRouter><RegisteredPage /></MemoryRouter>);
    const plans = [...container.querySelectorAll<HTMLButtonElement>('.page-topbar button')].find(button => button.textContent === 'Plans')!;
    expect(screen.queryByText('Plan contents')).toBeNull();
    fireEvent.click(plans);
    expect(screen.getByText('Plan contents')).toBeVisible();
    fireEvent.click(plans);
    expect(screen.getByText('Plan contents')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Plans/, expanded: true }));
    expect(screen.queryByText('Plan contents')).toBeNull();
    fireEvent.click(plans);
    expect(screen.getByText('Plan contents')).toBeVisible();
  });

  it('expands a collapsed section on click and scrolls to it, then follows the viewport', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const scroll = vi.fn();
    vi.stubGlobal('HTMLElement', HTMLElement);
    HTMLElement.prototype.scrollIntoView = scroll;
    const { container } = render(<Page />);
    const cards = container.querySelectorAll<HTMLElement>('.standard-card');
    let top = 500;
    vi.spyOn(cards[0], 'getBoundingClientRect').mockImplementation(() => ({ top: -100 } as DOMRect));
    vi.spyOn(cards[1], 'getBoundingClientRect').mockImplementation(() => ({ top } as DOMRect));
    const nav = container.querySelector('.page-topbar')!;
    expect(screen.queryByText('Transaction contents')).toBeNull();
    fireEvent.click(nav.querySelectorAll('button')[1]);
    expect(screen.getByText('Transaction contents')).toBeVisible();
    act(() => { frames.splice(0).forEach(callback => callback(0)); });
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    top = 5;
    fireEvent.scroll(window);
    act(() => { frames.splice(0).forEach(callback => callback(0)); });
    expect(nav.querySelectorAll('button')[1]).toHaveClass('active');
    top = 500;
    fireEvent.scroll(window);
    act(() => { frames.splice(0).forEach(callback => callback(0)); });
    expect(nav.querySelectorAll('button')[0]).toHaveClass('active');
  });
});
