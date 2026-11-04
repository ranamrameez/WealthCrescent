import { TopBarControls } from './TopBarControls';
import { DateRangeWidget } from './DateRangeWidget';
import { usePageTopBarRightSlot } from '../hooks/usePageTopBar';
import { useUrlTransactionFilters } from '../hooks/useUrlTransactionFilters';
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

  const { filters, setFilters, activeCount } = useUrlTransactionFilters('all');
  usePageTopBarRightSlot(<TopBarControls activeCount={activeCount + filter.tickers.length} onReset={() => onChange({tickers:[]})}>
    <DateRangeWidget value={filters} onChange={setFilters} />
    <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="text-muted">Tickers:</span>
        <button
          type="button"
          className={`chip${filter.tickers.length === 0 ? ' active' : ''}`}
          aria-pressed={filter.tickers.length === 0}
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
            aria-pressed={filter.tickers.includes(t)}
            onClick={() => toggleTicker(t)}
          >
            {filter.tickers.includes(t) && <CheckIcon size={11} />}{t}
          </button>
          </span>
        ))}
      </div>
      <p className="text-muted" style={{ margin: 0, width: '100%' }}>
        Ticker/month filters apply to per-ticker and monthly charts below. Whole-portfolio totals (realized vs
        unrealized P/L, cash vs stocks, fees breakdown, deposits vs invested) always reflect your full history —
        they can't be meaningfully filtered to a ticker or date window without changing what "current holdings" means.
      </p>
    </div>
  </TopBarControls>);
  return null;
}
