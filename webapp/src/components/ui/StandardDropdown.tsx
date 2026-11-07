import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { StarIcon } from '../icons';

export interface DropdownItem {
  value: string;
  label: string;
  icon?: ReactNode;
  isFavorite?: boolean;
  disabled?: boolean;
  keywords?: string;
}
export interface DropdownSection { title: string; items: DropdownItem[] }
export interface StandardDropdownProps {
  label: string;
  value: string;
  sections: DropdownSection[];
  onChange: (value: string) => void;
  onFavoriteToggle?: (value: string) => void | Promise<void>;
  isTypeable?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/** Controlled entity picker. Favorites belong to the owning feature, not this component. */
export function StandardDropdown({ label, value, sections, onChange, onFavoriteToggle, isTypeable = false,
  disabled = false, placeholder, className = '' }: StandardDropdownProps) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [active, setActive] = useState(0);
  const [pending, setPending] = useState<string | null>(null), [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const restoringFocus = useRef(false);
  const id = useId();
  const [position, setPosition] = useState({ left: 8, top: 0, width: 320, maxHeight: 360 });
  const query = isTypeable ? search.trim().toLocaleLowerCase() : '';
  const filtered = useMemo(() => sections.map((section, sectionIndex) => ({ ...section, sectionIndex,
    items: section.items.filter(item => `${item.label} ${item.keywords ?? ''} ${section.title}`.toLocaleLowerCase().includes(query)),
  })), [sections, query]);
  const rows = filtered.flatMap(section => section.items.map(item => ({ item, sectionIndex: section.sectionIndex })));
  const selected = sections.flatMap(section => section.items).find(item => item.value === value);
  const activeRow = rows[active];
  const close = () => { setOpen(false); setSearch(''); setError(''); };
  const show = (last = false) => {
    if (disabled) return;
    setSearch(''); setError(''); setOpen(true);
    const all = sections.flatMap(section => section.items);
    const selectedIndex = all.findIndex(item => item.value === value && !item.disabled);
    setActive(last ? Math.max(0, all.findLastIndex(item => !item.disabled)) : selectedIndex >= 0 ? selectedIndex : Math.max(0, all.findIndex(item => !item.disabled)));
  };
  const restoreFocus = () => { restoringFocus.current = true; input.current?.focus(); restoringFocus.current = false; };
  const choose = (item: DropdownItem) => { if (item.disabled) return; onChange(item.value); close(); restoreFocus(); };
  const toggleFavorite = async (item: DropdownItem) => {
    if (!onFavoriteToggle || pending || item.disabled) return;
    restoreFocus();
    setPending(item.value); setError('');
    try { await onFavoriteToggle(item.value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the favorite. Try again.'); }
    finally { setPending(null); }
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  useEffect(() => { if (disabled) { setOpen(false); setSearch(''); } }, [disabled]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = root.current?.getBoundingClientRect(); if (!rect) return;
      const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 14, above = rect.top - 14;
      const down = below >= 180 || below >= above;
      const maxHeight = Math.min(420, Math.max(80, down ? below : above));
      setPosition({ width, maxHeight, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, down ? rect.bottom + 6 : rect.top - maxHeight - 6) });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (active >= rows.length) setActive(Math.max(0, rows.length - 1));
    if (open) menu.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, rows.length]);
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); restoreFocus(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return show(event.key === 'ArrowUp');
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      let next = active;
      for (let count = 0; count < rows.length; count++) { next = (next + direction + rows.length) % rows.length; if (!rows[next].item.disabled) break; }
      setActive(next); return;
    }
    if (open && (event.key === 'Home' || event.key === 'End') && (!isTypeable || event.ctrlKey)) {
      event.preventDefault(); setActive(event.key === 'Home' ? Math.max(0, rows.findIndex(row => !row.item.disabled)) : Math.max(0, rows.findLastIndex(row => !row.item.disabled))); return;
    }
    if (event.key === 'Enter' || (!isTypeable && event.key === ' ')) {
      event.preventDefault(); if (!open) show(); else if (activeRow) choose(activeRow.item); return;
    }
    if (event.key === 'F2' && open) { event.preventDefault(); menu.current?.querySelector<HTMLButtonElement>('[data-active="true"] [data-favorite]')?.focus(); }
  };
  const blur = (target: EventTarget | null) => { if (!root.current?.contains(target as Node) && !menu.current?.contains(target as Node)) close(); };
  let rowIndex = 0;
  return <div ref={root} className={`standard-dropdown ${className}`.trim()}>
    <label className="standard-dropdown-label" htmlFor={`${id}-input`}>{label}</label>
    <div className={`standard-dropdown-trigger${disabled ? ' is-disabled' : ''}`}>
      {selected?.icon && <span className="standard-dropdown-icon" aria-hidden="true">{selected.icon}</span>}
      <input ref={input} id={`${id}-input`} role="combobox" aria-label={label} aria-haspopup="grid" aria-expanded={open}
        aria-controls={open ? `${id}-options` : undefined} aria-activedescendant={open && activeRow ? `${id}-option-${active}` : undefined}
        aria-autocomplete={isTypeable ? 'list' : 'none'} aria-readonly={!isTypeable} aria-describedby={`${id}-help`}
        readOnly={!isTypeable} disabled={disabled} autoComplete="off" spellCheck={false}
        value={open && isTypeable ? search : selected?.label ?? value}
        placeholder={placeholder ?? (isTypeable ? 'Type to search…' : 'Choose an item…')}
        onFocus={() => { if (isTypeable && !open && !restoringFocus.current) show(); }} onBlur={event => blur(event.relatedTarget)}
        onClick={() => { if (!open) show(); else if (!isTypeable) close(); }}
        onChange={event => { if (isTypeable) { setSearch(event.target.value); setActive(0); setOpen(true); } }} onKeyDown={keyDown} />
      <svg className="standard-dropdown-chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </div>
    <span id={`${id}-help`} className="sr-only">Use arrow keys to browse and Enter to select. Escape closes.{onFavoriteToggle ? ' Press F2 to focus the favorite control.' : ''}</span>
    {open && createPortal(<div ref={menu} style={{ ...position, position: 'fixed' }} className="standard-dropdown-popup" onBlur={event => blur(event.relatedTarget)}>
      <div id={`${id}-options`} role="grid" aria-colcount={2} aria-label={`${label} options`} onKeyDown={event => { if (event.key === 'Escape') keyDown(event); }}>
        {filtered.map(section => <div key={section.sectionIndex} role="rowgroup" aria-label={section.title || label}>
          {section.title && <div role="row" className="standard-dropdown-heading"><span role="columnheader" aria-colspan={2}>{section.title}</span></div>}
          {section.items.map(item => {
            const index = rowIndex++;
            return <div key={`${section.sectionIndex}:${item.value}`} role="row" aria-selected={item.value === value} aria-disabled={item.disabled || undefined}
              className="standard-dropdown-row" data-active={index === active}>
              <div role="gridcell" id={`${id}-option-${index}`}>
                <button type="button" className="standard-dropdown-option" tabIndex={-1} disabled={item.disabled}
                  onMouseDown={event => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => choose(item)}>
                  <span className="standard-dropdown-icon" aria-hidden="true">{item.icon ?? <span className="standard-dropdown-initial">{item.label.slice(0, 2)}</span>}</span>
                  <span className="standard-dropdown-text">{item.label}</span>
                  {item.value === value && <span className="standard-dropdown-check" aria-hidden="true">✓</span>}
                </button>
              </div>
              {(onFavoriteToggle || item.isFavorite !== undefined) && <div role="gridcell">
                <button type="button" data-favorite className="standard-dropdown-favorite" aria-pressed={!!item.isFavorite}
                  tabIndex={index === active ? 0 : -1}
                  aria-label={`${item.isFavorite ? 'Unfavorite' : 'Favorite'} ${item.label}`} disabled={!onFavoriteToggle || item.disabled || pending !== null}
                  onMouseDown={event => event.preventDefault()} onClick={() => void toggleFavorite(item)}><StarIcon filled={item.isFavorite} /></button>
              </div>}
            </div>;
          })}
        </div>)}
      </div>
      {!rows.length && <p className="standard-dropdown-empty" role="status">No matching items.</p>}
      {error && <p className="standard-dropdown-error" role="alert">{error}</p>}
    </div>, document.fullscreenElement?.contains(root.current) ? document.fullscreenElement : document.body)}
  </div>;
}
