import { SortIcon } from '../../../components/icons';
import { Modal } from '../../../components/Modal';
import { useQseTablePagination } from './useQseTablePagination';
import type { SectionCardProps } from '../../../components/StandardPageSections';
import { BatchEditGrid } from '../../../components/BatchEditGrid';
import { getCurrentUser } from '../../../lib/firebase/useAuthState';
import { useQseFilters, matchesQseFilters } from './qseFilterModel';
import { QseRecordCard, QseExportActions, QseReorder } from './QseTableActions';
import { DateValue } from '../../../components/DateValue';
import { PriceInput } from "../../../components/ui/PriceInput";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QSE_TICKER_DATALIST_ID } from '../../../components/TickerDatalist';
import { TickerLogo } from '../../../components/TickerLogo';
import { EditIcon, SaveIcon, TrashIcon, XIcon } from '../../../components/icons';
import { toast } from '../../../components/Toast';
import { Field } from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { TimeZoneFields } from '../../../components/ui/TimeZoneFields';
import { fmt, fmtMoney, fmtQSEPrice } from '../../../lib/format';
import { toInstantMs, defaultTimeForDate, defaultTimezoneForCurrency, nowTime } from '../../../lib/datetime';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { useSortableRows } from '../../../hooks/useSortableRows';
import { useWorkbookStore } from '../../../store/workbookStore';
import type { Dividend } from '../../../types/workbook';
import { useQSEDerived } from '../hooks/useQSEDerived';

const today = () => new Date().toISOString().slice(0, 10);

function AddDividendForm() {
  const addDividend = useWorkbookStore((s) => s.addDividend);
  const currency = useWorkbookStore((s) => s.workbook.settings.currency);
  const ensureSignedIn = useEnsureSignedIn();
  const { positions } = useQSEDerived();
  const [date, setDate] = useState(today());
  const [ticker, setTicker] = useState('');
  const [perShare, setPerShare] = useState(0);
  const [shares, setShares] = useState(0);
  const [amount, setAmount] = useState(0);
  const [sharesTouched, setSharesTouched] = useState(false);
  const [time, setTime] = useState<string | undefined>(() => nowTime(defaultTimezoneForCurrency(currency)));
  const [timeTouched, setTimeTouched] = useState(false);
  const [timezone, setTimezone] = useState<string | undefined>(() => defaultTimezoneForCurrency(currency));

  const onTickerChange = (v: string) => {
    const up = v.toUpperCase();
    setTicker(up);
    if (!sharesTouched) {
      const held = positions.find((p) => p.ticker === up && p.shares > 0);
      if (held) setShares(held.shares);
    }
  };

  const preview = perShare > 0 && shares > 0 ? perShare * shares : 0;

  const submit = async () => {
    const finalAmount = amount || preview;
    if (!ticker || !finalAmount) return toast('Enter a ticker and an amount (or per-share + shares).');
    if (!(await ensureSignedIn('Sign in to save dividends.'))) return;
    addDividend({ date, ticker, perShare: perShare || 0, shares: shares || 0, amount: finalAmount, time, timezone });
    toast(`Dividend logged for ${ticker}.`);
    setTicker('');
    setPerShare(0);
    setShares(0);
    setAmount(0);
    setSharesTouched(false);
    setTime(undefined);
  };

  return (
    <div className="row gap-sm">
      <Field label="Date">
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            if (!timeTouched) setTime(defaultTimeForDate(e.target.value, timezone));
          }}
        />
      </Field>
      <Field label="Ticker">
        <input placeholder="Ticker" value={ticker} onChange={(e) => onTickerChange(e.target.value)} list={QSE_TICKER_DATALIST_ID} className="w-90" />
      </Field>
      <Field label="Per share">
        <PriceInput exchange="qse" type="number" step="0.001" placeholder="Per share" value={perShare || ''} onChange={(e) => setPerShare(Number(e.target.value))} className="w-90" />
      </Field>
      <Field label="Shares">
        <input
          type="number"
          placeholder="Shares"
          value={shares || ''}
          onChange={(e) => {
            setShares(Number(e.target.value));
            setSharesTouched(true);
          }}
          className="w-90"
        />
      </Field>
      <Field label="Total received">
        <input type="number" step="0.01" placeholder={preview ? preview.toFixed(2) : 'Total received'} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} className="w-100" />
      </Field>
      <TimeZoneFields
        time={time}
        timezone={timezone}
        onTimeChange={(t) => { setTime(t); setTimeTouched(true); }}
        onTimezoneChange={setTimezone}
      />
      <button className="btn" onClick={submit}>Add</button>
      {preview > 0 && !amount && <span className="text-muted">{fmt(shares, 0)} shares × {fmtQSEPrice(perShare)} = {preview.toFixed(2)}</span>}
    </div>
  );
}

export function DividendsSection({ sectionProps }: { sectionProps?: SectionCardProps } = {}) {
  const pageFilters = useQseFilters();
  const ensureSignedIn = useEnsureSignedIn();
  const [modifying, setModifying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [projectionEdit, setProjectionEdit] = useState<{ rows: Array<{ id: string; ticker: string; shares: number; perShare: number }>; owner?: string } | null>(null);
  const { workbook, positions } = useQSEDerived();
  const removeDividend = useWorkbookStore((s) => s.removeDividend);
  const updateDividend = useWorkbookStore((s) => s.updateDividend);
  const setDividendEstimate = useWorkbookStore((s) => s.setDividendEstimate);
  const currency = workbook.settings.currency;
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<Dividend | null>(null);
  // User-requested (2026-09-03): "add filters to other tables as well."
  const tickerFilter = pageFilters.ticker || 'ALL';

  const startEdit = (i: number, d: Dividend) => { setEditIndex(i); setEditRow({ ...d }); };
  const saveEdit = async () => {
    if (editIndex === null || !editRow) return;
    if (!(await ensureSignedIn('Sign in to save changes.'))) return;
    updateDividend(editIndex, editRow);
    toast('Dividend updated.');
    setEditIndex(null);
    setEditRow(null);
  };

  const sortValue = (d: (typeof workbook.dividends)[number], col: string) => {
    switch (col) {
      case 'ticker': return d.ticker;
      case 'perShare': return d.perShare;
      case 'shares': return d.shares;
      case 'amount': return d.amount;
      default: return `${toInstantMs(d.date, d.time, d.timezone)} ${String(d.seq ?? 0).padStart(12, '0')}`;
    }
  };
  const { sorted: rows, sort, toggleSort, dateSort } = useSortableRows([...workbook.dividends.map((d, i) => ({ ...d, i }))]
    .filter((d) => (tickerFilter === 'ALL' || d.ticker === tickerFilter) && matchesQseFilters(d, pageFilters)), sortValue, 'date');
  const arrow = (col: string) => <SortIcon direction={sort.col === col ? sort.dir : undefined} />;
  // Reflects the ticker filter above, so "Total collected" always matches
  // what's actually shown in the table above it.
  const total = rows.reduce((s, d) => s + d.amount, 0);

  const held = positions.filter((p) => p.shares > 0);
  const estimates = workbook.dividendEstimates || {};


  type HeldCol = 'ticker' | 'shares' | 'estPerShare' | 'projected';
  const heldSortValue = (p: (typeof held)[number], col: HeldCol): number | string => {
    switch (col) {
      case 'ticker': return p.ticker;
      case 'shares': return p.shares;
      case 'estPerShare': return estimates[p.ticker] || 0;
      case 'projected': return (estimates[p.ticker] || 0) * p.shares;
    }
  };
  const { sorted: sortedHeld, Th: HeldTh } = useSortableRows(held.filter(row => (!pageFilters.ticker || row.ticker === pageFilters.ticker) && (!pageFilters.search || row.ticker.toLowerCase().includes(pageFilters.search.toLowerCase()))), heldSortValue, 'ticker', 'asc');

  const page = useQseTablePagination(rows);
  const projectionPage = useQseTablePagination(sortedHeld);
  const totalProjected = sortedHeld.reduce((sum, row) => sum + (estimates[row.ticker] || 0) * row.shares, 0);
  return (
    <QseRecordCard dateSort={dateSort} title="Dividends" extraActions={[{ label: 'Add dividend', onClick: () => setAdding(true) }]} sectionProps={sectionProps} kind="dividends" rows={rows.map(d => { const { i: _index, ...row } = d; return row; })} modifying={modifying} onModify={() => setModifying(value => !value)}>
      {adding && <Modal title="Add dividend" onClose={() => setAdding(false)}><AddDividendForm /></Modal>}
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort('date')} className="clickable">Date{arrow('date')}</th>
              <th onClick={() => toggleSort('ticker')} className="clickable">Ticker{arrow('ticker')}</th>
              <th onClick={() => toggleSort('perShare')} className="clickable">Per share{arrow('perShare')}</th>
              <th onClick={() => toggleSort('shares')} className="clickable">Shares{arrow('shares')}</th>
              <th onClick={() => toggleSort('amount')} className="clickable">Amount{arrow('amount')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((d) =>
              editIndex === d.i && editRow ? (
                <tr key={d.i}>
                  <td><input type="date" value={editRow.date} onChange={(e) => setEditRow({ ...editRow, date: e.target.value })} className="w-130" /></td>
                  <td><input value={editRow.ticker} onChange={(e) => setEditRow({ ...editRow, ticker: e.target.value.toUpperCase() })} className="w-80" /></td>
                  <td><PriceInput exchange="qse" type="number" step="0.001" value={editRow.perShare} onChange={(e) => setEditRow({ ...editRow, perShare: Number(e.target.value) })} className="w-80" /></td>
                  <td><input type="number" value={editRow.shares} onChange={(e) => setEditRow({ ...editRow, shares: Number(e.target.value) })} className="w-80" /></td>
                  <td><input type="number" step="0.01" value={editRow.amount} onChange={(e) => setEditRow({ ...editRow, amount: Number(e.target.value) })} className="w-90" /></td>
                  <td>
                    <IconButton label="Save" icon={<SaveIcon size={13} />} align="right" onClick={saveEdit} />{' '}
                    <IconButton label="Cancel" icon={<XIcon size={13} />} align="right" onClick={() => setEditIndex(null)} />
                  </td>
                </tr>
              ) : (
                <tr key={d.i}>
                  <td><DateValue value={d.date} />{modifying && <QseReorder kind="dividends" row={d} rows={rows} />}</td>
                  <td><TickerLogo ticker={d.ticker} size="sm" exchange="qse" /><Link to={`/stock/${d.ticker}`}>{d.ticker}</Link></td>
                  <td>{fmtQSEPrice(d.perShare)}</td>
                  <td>{d.shares || '—'}</td>
                  <td className="pill-positive">{fmtMoney(d.amount, currency)}</td>
                  <td>
                    {modifying && <><IconButton label="Edit" icon={<EditIcon size={13} />} align="right" onClick={() => startEdit(d.i, d)} />{' '}
                    <IconButton label="Delete" icon={<TrashIcon size={13} />} align="right" onClick={() => removeDividend(d.i)} /></>}
                  </td>
                </tr>
              ),
            )}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="text-muted">
                  {workbook.dividends.length ? 'No dividends match this filter.' : 'No dividends logged yet.'}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr><td colSpan={4}>Total collected</td><td className="pill-positive">{fmtMoney(total, currency)}</td><td></td></tr>
          </tfoot>
        </table>
      </div>

      {page.controls}
      {held.length > 0 && (
        <>
          <p className="text-muted">Enter an estimated annual per-share dividend rate for each held ticker; projection = rate × shares held.</p>
          <QseExportActions title="Yearly projection" actions={[
            { label: 'Batch edit', onClick: () => setProjectionEdit({ rows: sortedHeld.map(p => ({ id: p.ticker, ticker: p.ticker, shares: p.shares, perShare: estimates[p.ticker] || 0 })), owner: getCurrentUser()?.uid }) },
            { label: modifying ? 'Done modifying' : 'Modify', onClick: () => setModifying(value => !value) },
          ]} name="dividend-projections" rows={sortedHeld.map(p => ({ ticker: p.ticker, shares: p.shares, perShare: estimates[p.ticker] || 0, projected: (estimates[p.ticker] || 0) * p.shares }))} allRows={held.map(p => ({ ticker: p.ticker, shares: p.shares, perShare: estimates[p.ticker] || 0, projected: (estimates[p.ticker] || 0) * p.shares }))}>
          <div className="table-scroll">
            <table>
              <thead><tr><HeldTh col="ticker">Ticker</HeldTh><HeldTh col="shares">Shares</HeldTh><HeldTh col="estPerShare">Est. annual/share</HeldTh><HeldTh col="projected">Projected annual</HeldTh></tr></thead>
              <tbody>
                {projectionPage.rows.map((p) => (
                  <tr key={p.ticker}>
                    <td><TickerLogo ticker={p.ticker} size="sm" exchange="qse" /><Link to={`/stock/${p.ticker}`}>{p.ticker}</Link></td>
                    <td>{fmt(p.shares, 0)}</td>
                    <td>
                      {modifying ? <input
                        type="number"
                        step="0.001"
                        value={estimates[p.ticker] || ''}
                        onChange={async (e) => { const value = Number(e.target.value); if (!Number.isFinite(value) || value < 0) return; if (await ensureSignedIn('Sign in to save estimates.')) setDividendEstimate(p.ticker, value); }}
                        className="w-80"
                      /> : fmtQSEPrice(estimates[p.ticker] || 0)}
                    </td>
                    <td>{fmtMoney((estimates[p.ticker] || 0) * p.shares, currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={3}>Total projected</td><td className="pill-positive">{fmtMoney(totalProjected, currency)}</td></tr>
              </tfoot>
            </table>
          </div>
          {projectionPage.controls}
          </QseExportActions>
        </>
      )}
      {projectionEdit && <BatchEditGrid title="Batch edit dividend estimates" rows={projectionEdit.rows} columns={[
        { key: 'ticker', label: 'Ticker', editable: false }, { key: 'shares', label: 'Shares', type: 'number', editable: false }, { key: 'perShare', label: 'Annual per share', type: 'number' },
      ]} getRowId={row => row.id} validateRow={row => !Number.isFinite(row.perShare) || row.perShare < 0 ? { perShare: 'Enter a nonnegative estimate.' } : {}} onClose={() => setProjectionEdit(null)} onSave={async changes => {
        if (!(await ensureSignedIn('Sign in to save estimates.'))) throw new Error('Sign in is required.');
        if (projectionEdit.owner && projectionEdit.owner !== getCurrentUser()?.uid) throw new Error('Signed-in account changed. Reopen the editor.');
        const state = useWorkbookStore.getState();
        const next = { ...state.workbook.dividendEstimates };
        for (const { before, after } of changes) {
          if ((next[before.ticker] || 0) !== before.perShare) throw new Error('An estimate changed. Reopen the editor.');
          next[before.ticker] = after.perShare;
        }
        state.setWorkbook({ ...state.workbook, dividendEstimates: next });
        toast('Estimates saved.');
      }} />}
    </QseRecordCard>
  );
}
