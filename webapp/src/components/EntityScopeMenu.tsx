import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** URL-backed multi-entity scope control for module homepages. */
export function EntityScopeMenu({ label = 'Entities', options, inline = false }: { label?: string; options: Array<{ value: string; label: string }>; inline?: boolean }) {
  const [params, setParams] = useSearchParams();
  const selected = useMemo(() => new Set((params.get('entities') ?? '').split(',').filter(Boolean)), [params]);
  const allSelected = selected.size === 0;
  const toggle = (value: string) => {
    const next = new Set(allSelected ? options.map((option) => option.value) : selected);
    next.has(value) ? next.delete(value) : next.add(value);
    const nextParams = new URLSearchParams(params);
    if (!next.size || next.size === options.length) nextParams.delete('entities');
    else nextParams.set('entities', [...next].join(','));
    setParams(nextParams);
  };
  const fields = <div className={inline ? 'filter-fields-grid' : 'topbar-entity-scope-menu'} role="group" aria-label={`${label} filter`}>
      <button type="button" className="btn secondary small" onClick={() => { const next = new URLSearchParams(params); next.delete('entities'); setParams(next); }}>All</button>
      {options.map((option) => <label key={option.value}><input type="checkbox" checked={allSelected || selected.has(option.value)} onChange={() => toggle(option.value)} /> {option.label}</label>)}
    </div>;
  return inline ? <div><h4>{label}</h4>{fields}</div> : <details className="topbar-entity-scope"><summary className="btn secondary small">{label}{allSelected ? '' : ` (${selected.size})`}</summary>{fields}</details>;
}

export function selectedEntityValues(params: URLSearchParams, options: string[]): string[] {
  const raw = (params.get('entities') ?? '').split(',').filter(Boolean);
  return raw.length ? options.filter((value) => raw.includes(value)) : options;
}
