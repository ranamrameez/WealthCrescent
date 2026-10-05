import { CheckIcon } from '../icons';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** A small chip-style toggle for any boolean choice — user-requested
 * (2026-09-14): "Use chips/switch for radio & checkboxes." Generalizes
 * `PendingToggle`'s own pattern (see that component's doc comment for the
 * real click-area bug a raw `<label><input type="checkbox">…</label>`
 * caused) so any OTHER boolean checkbox gets the same fix, not just
 * `isPending`. `PendingToggle` itself now wraps this rather than
 * duplicating it. */
export function ToggleChip({
  checked,
  onChange,
  label,
  title,
  ...props
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  title?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>) {
  return (
    <div className="chip-tabs" style={{ alignSelf: 'flex-start' }}>
      <button
        {...props}
        type="button"
        className={`chip${checked ? ' active' : ''}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        title={title}
      >
        {checked && <CheckIcon size={11} />}
        {label}
      </button>
    </div>
  );
}
