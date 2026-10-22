import { useState } from 'react';
import { CollapsibleContent } from '../../../components/CollapsibleContent';
import { Pagination } from '../../../components/Pagination';
import { StandardButton } from '../../../components/standard';
import { useSearchParams } from 'react-router-dom';
import { usePsxApi } from '../hooks/usePsxApi';

const label = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
function Cell({ value }: { value: unknown }) {
  if (value == null) return <>—</>;
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  if (typeof value === 'number') return <>{value.toLocaleString('en-GB', { maximumFractionDigits: 4 })}</>;
  if (typeof value === 'string' && /^https:\/\//.test(value)) return <a href={value} target="_blank" rel="noopener noreferrer">View document</a>;
  return <>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</>;
}

/** Bounded rendering for every API table, including provider-defined instrument tables. */
export function PsxDataTable({ data }: { data: unknown }) {
  const [page, setPage] = useState(0);
  if (data && !Array.isArray(data) && typeof data === 'object' && Object.values(data).some(Array.isArray)) {
    return <>{Object.entries(data).map(([key, value]) => <CollapsibleContent key={key} title={label(key)}><PsxDataTable data={value}/></CollapsibleContent>)}</>;
  }
  const items = Array.isArray(data) ? data : data == null ? [] : [data];
  const rows: Record<string, unknown>[] = items.map(item => item && typeof item === 'object' ? item as Record<string, unknown> : { value: item });
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const last = Math.max(0, Math.ceil(rows.length / 50) - 1), current = Math.min(page, last);
  if (!rows.length) return <p className="text-muted">No data returned for this selection.</p>;
  return <><div className="table-scroll"><table><thead><tr>{columns.map(key => <th key={key} scope="col">{label(key)}</th>)}</tr></thead><tbody>{rows.slice(current * 50, (current + 1) * 50).map((row, index) => <tr key={index}>{columns.map(key => <td key={key}><Cell value={row[key]}/></td>)}</tr>)}</tbody></table></div><Pagination page={current} pageCount={last+1} total={rows.length} onChange={setPage}/></>;
}

export function PsxApiPanel({ path }: { path: string }) {
  const { response, error, retry } = usePsxApi(path);
  if (error) return <div role="alert">{error} <StandardButton tone="secondary" size="small" onClick={retry}>Retry</StandardButton></div>;
  if (!response) return <p role="status">Loading PSX data…</p>;
  return <>{response.stale && <p role="alert">Cached data: the service could not provide a fresh response.</p>}<p className="text-muted">Source: psxdata · Response generated {new Date(response.meta.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })} PKT (not trade time)</p><PsxDataTable key={path} data={response.data}/></>;
}

export function PsxIndicesPanel() {
  const { response, error, retry } = usePsxApi<string[]>('/indices');
  const [params,setParams] = useSearchParams();
  const selected=params.get('index')||'';
  if (error) return <p role="alert">{error} <StandardButton tone="secondary" size="small" onClick={retry}>Retry</StandardButton></p>;
  if (!response) return <p role="status">Loading indices…</p>;
  const names = Array.isArray(response.data) ? response.data : [];
  const index = names.includes(selected) ? selected : names[0];
  return <>{response.stale && <p role="alert">Showing cached index names.</p>}<label>Index <select value={index || ''} onChange={event => {const next=new URLSearchParams(params);next.set('index',event.target.value);setParams(next);}}>{names.map(name => <option key={name}>{name}</option>)}</select></label>{index && <><PsxApiPanel path={'/indices/' + encodeURIComponent(index)}/><CollapsibleContent title="Index tickers"><PsxApiPanel path={'/stocks?index=' + encodeURIComponent(index)}/></CollapsibleContent></>}</>;
}
