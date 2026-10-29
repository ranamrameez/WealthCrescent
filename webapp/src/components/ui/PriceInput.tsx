import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { fmtQSEPrice, fmtPSXPrice, qsePriceStep } from '../../lib/format';

/** Keep the user's draft intact while editing; format exchange prices at rest. */
export function PriceInput({ exchange, value, defaultValue, onChange, onFocus, onBlur, width, ...props }:
  InputHTMLAttributes<HTMLInputElement> & { exchange: 'qse' | 'psx'; width?: number }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(defaultValue);
  // Sync only when the supplied default changes. Including `focused` here
  // resets an uncontrolled input to its original default on blur, discarding
  // the value the user just edited.
  useEffect(() => { if (value === undefined) setDraft(defaultValue); }, [defaultValue, value]);
  const current = value === undefined ? draft : value;
  const empty = current === '' || current === undefined || current === null;
  const numeric = Number(current);
  const formatted = empty ? '' : (exchange === 'qse' ? fmtQSEPrice(numeric) : fmtPSXPrice(numeric)).replaceAll(',', '');
  return <input {...props} type="number" step={exchange === 'qse' ? qsePriceStep(numeric) : 0.01}
    style={width ? { ...props.style, width } : props.style}
    value={focused ? current ?? '' : formatted}
    onChange={event => { if (value === undefined) setDraft(event.target.value); onChange?.(event); }}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onBlur={event => { setFocused(false); onBlur?.(event); }} />;
}
