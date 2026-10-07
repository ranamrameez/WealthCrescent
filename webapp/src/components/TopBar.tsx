import { useWorkbookStore } from '../store/workbookStore';
import { usePSXWorkbookStore } from '../store/psxWorkbookStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { categoryForPath } from './CategoryNav';
import { TopBarSelect } from './TopBarControls';
import { usePageTopBarStore } from '../store/pageTopBarStore';
import { useRef } from 'react';
import { useTopBarPageSections } from '../hooks/useTopBarPageSections';

/** App-wide fixed top bar — user-requested (2026-09-11, design reference:
 * `wealth_tracker_template/` in this repo): the page's own sections
 * (Transactions/Analytics/Settings/...) should be visible immediately on
 * page load, not only once scrolled to. `Tabs.tsx` used to render this
 * same chip row inline, itself already `position: sticky` — correct once
 * scrolled past, but rendered *after* the page's own `<h1>`/intro
 * paragraph, so on load it sat below that content, not pinned at the very
 * top. The fix is where it renders, not the sticky mechanism itself:
 * `AppShell.tsx` renders this as `.main`'s very FIRST child, ahead of
 * every page's own content — on load (scrollTop 0) that already puts it
 * at the top of the visible page with nothing above it to scroll past,
 * and `position: sticky` (see `.page-topbar` in `main.css`, reusing the
 * old `.chip-tabs.subnav` rule's own tuned padding/shadow) keeps it
 * pinned from there on. Living inside `.main` also means it automatically
 * tracks the sidebar's collapsed/expanded width and the mobile drawer
 * breakpoint for free, via `.main`'s own existing `margin-left` rules —
 * no separate CSS needed to duplicate that tracking.
 *
 * Reads from `pageTopBarStore` — the exact same "page registers, one
 * globally-mounted component renders" shape `FabPanel`/`fabActionsStore`
 * already established for the floating action button. The sidebar owns module navigation; this bar keeps page sections, sibling switchers and filters. */
export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const category = categoryForPath(location.pathname);
  const qse=useWorkbookStore(s=>s.workbook);
  const psx=usePSXWorkbookStore(s=>s.workbook);
  const exchange=location.pathname.startsWith('/psx')?'psx':'qse';
  const stockWorkbook=exchange==='psx'?psx:qse;
  const stockOptions=[...new Set([...stockWorkbook.transactions.map(tx=>tx.ticker),...Object.keys(stockWorkbook.marketPrices)])].sort();
  const stockDetail=/\/stock\//.test(location.pathname);
  const registered = usePageTopBarStore((s) => s.chips);
  const bar = useRef<HTMLDivElement>(null);
  const chips = useTopBarPageSections(bar, registered, location.pathname + location.search);
  const rightSlot = usePageTopBarStore((s) => s.rightSlot);

  return (
    <div ref={bar} className="page-topbar">
      <div className="chip-tabs page-topbar-sections">
        {chips.map((c) => (
          <button key={c.key} type="button" className={`chip${c.active ? ' active' : ''}`} aria-current={c.active ? 'location' : undefined} onClick={c.onClick}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="page-topbar-right">{category==='stocks' && !stockDetail && <TopBarSelect label="Stock" className="account-switch-select" value="" options={[{value:'',label:'All stocks'},...stockOptions.map(ticker=>({value:ticker,label:ticker}))]} onChange={event=>{if(event.target.value)navigate(`${exchange==='psx'?'/psx':''}/stock/${event.target.value}`);}} />}{rightSlot}</div>
    </div>
  );
}
