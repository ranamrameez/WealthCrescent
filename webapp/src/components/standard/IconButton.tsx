import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Tooltip } from '../Tooltip';

/** Shared icon-only action button with an accessible label and tooltip. */
export function StandardIconButton({ label, icon, align = 'left', className = 'btn secondary small', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  align?: 'left' | 'right';
}) {
  return <Tooltip text={label} align={align}><button {...props} className={className} aria-label={label} style={{ padding: '5px 9px', ...props.style }}>{icon}</button></Tooltip>;
}
