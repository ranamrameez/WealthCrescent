import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type StandardButtonTone = 'primary' | 'secondary' | 'danger';

/** Shared visible-label button for standard pages and reusable forms. */
export function StandardButton({ tone = 'primary', size = 'normal', icon, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: StandardButtonTone;
  size?: 'small' | 'normal';
  icon?: ReactNode;
}) {
  const classes = ['btn', tone === 'primary' ? '' : tone, size === 'small' ? 'small' : '', className].filter(Boolean).join(' ');
  return <button {...props} className={classes}><span className="standard-button-content">{icon}{children}</span></button>;
}
