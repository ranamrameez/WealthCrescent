import { PageFilters } from './PageFilters';
import type { ChartFilter } from '../lib/calc/chartFilters';
import { CheckIcon } from './icons';

/** README item 17: shared ticker + month-range filter controls for the
 * Analytics pages — exchange-agnostic (QSE and PSX each pass their own
 * ticker list and filter state; the component has no store access of its
 * own). See lib/calc/chartFilters.ts for why this only filters per-ticker
 * and per-month chart data rather than re-deriving portfolio state. */
export function ChartFilterBar({
  tickers,
  openTickers,
  filter,
  onChange,
}: {
  tickers: string[];
  openTickers?: string[];
  filter: ChartFilter;
  onChange: (filter: ChartFilter) => void;
}) {
  const toggleTicker = (t: string) => {
    const has = filter.tickers.includes(t);
    onChange({ ...filter, tickers: has ? filter.tickers.filter((x) => x !== t) : [...filter.tickers, t] });
  };

  return (
    <PageFilters><div className="card" style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="text-muted">Tickers:</span>
        <button
          type="button"
          className={`chip${filter.tickers.length === 0 ? ' active' : ''}`}
          onClick={() => onChange({ ...filter, tickers: [] })}
        >
          {filter.tickers.length === 0 && <CheckIcon size={11} />}All
        </button>
        {(openTickers ? [...tickers.filter(t => openTickers.includes(t)), ...tickers.filter(t => !openTickers.includes(t))] : tickers).map((t, index, ordered) => (
          <span key={t} style={{ display: 'contents' }}>
          {openTickers && !openTickers.includes(t) && (index === 0 || openTickers.includes(ordered[index - 1])) && <span className="text-muted" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 10, marginLeft: 4 }}>Closed positions</span>}
          <button
            key={t}
            type="button"
            className={`chip${filter.tickers.includes(t) ? ' active' : ''}`}
            onClick={() => toggleTicker(t)}
          >
            {filter.tickers.includes(t) && <CheckIcon size={11} />}{t}
          </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="text-muted">Months:</span>
        <input
          type="month"
          value={filter.fromMonth ?? ''}
          onChange={(e) => onChange({ ...filter, fromMonth: e.target.value || undefined })}
          aria-label="From month"
        />
        <span className="text-muted">to</span>
        <input
          type="month"
          value={filter.toMonth ?? ''}
          onChange={(e) => onChange({ ...filter, toMonth: e.target.value || undefined })}
          aria-label="To month"
        />
        {(filter.fromMonth || filter.toMonth) && (
          <button type="button" className="btn secondary small" onClick={() => onChange({ ...filter, fromMonth: undefined, toMonth: undefined })}>
            Clear
          </button>
        )}
      </div>
      <p className="text-muted" style={{ margin: 0, width: '100%' }}>
        Ticker/month filters apply to per-ticker and monthly charts below. Whole-portfolio totals (realized vs
        unrealized P/L, cash vs stocks, fees breakdown, deposits vs invested) always reflect your full history —
        they can't be meaningfully filtered to a ticker or date window without changing what "current holdings" means.
      </p>
    </div></PageFilters>
  );
}
