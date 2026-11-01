import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { fmtQSEPrice, fmtPSXPrice, qsePriceStep } from '../../lib/format';

/** Keep the user's draft intact while editing; format exchange prices at rest. */
export function PriceInput({ exchange, value, defaultValue, onChange, onFocus, onBlur, width, ...props }:
  InputHTMLAttributes<HTMLInputElement> & { exchange: 'qse' | 'psx'; width?: number }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(defaultValue);
  const previousDefault = useRef(defaultValue);
  const pendingDefault = useRef<{ value: InputHTMLAttributes<HTMLInputElement>['defaultValue'] } | null>(null);
  // Sync external defaults when they change at rest. If they change while the
  // user is editing, defer that external update until blur so the draft stays
  // stable while focused but still respects the latest quote after editing.
  useEffect(() => {
    if (Object.is(previousDefault.current, defaultValue)) return;
    previousDefault.current = defaultValue;
    if (value !== undefined) return;
    if (focused) pendingDefault.current = { value: defaultValue };
    else setDraft(defaultValue);
  }, [defaultValue, focused, value]);
  const current = value === undefined ? draft : value;
  const empty = current === '' || current === undefined || current === null;
  const numeric = Number(current);
  const formatted = empty ? '' : (exchange === 'qse' ? fmtQSEPrice(numeric) : fmtPSXPrice(numeric)).replaceAll(',', '');
  return <input {...props} type="number" step={exchange === 'qse' ? qsePriceStep(numeric) : 0.01}
    style={width ? { ...props.style, width } : props.style}
    value={focused ? current ?? '' : formatted}
    onChange={event => { if (value === undefined) setDraft(event.target.value); onChange?.(event); }}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onBlur={event => { setFocused(false); if (value === undefined && pendingDefault.current) { setDraft(pendingDefault.current.value); pendingDefault.current = null; } onBlur?.(event); }} />;
}
