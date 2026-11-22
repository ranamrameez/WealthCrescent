import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

const NOTICE_ICON: Record<NoticeTone, string> = { info: 'ℹ', warning: '⚠', danger: '⛔', success: '✓' };

/** A visually distinct callout for warnings/notices — user-reported (item
 * 11) that ad hoc `borderLeft: '3px solid var(--warn, orange)'` boxes on a
 * plain `.card` (13 near-identical call sites app-wide before this) didn't
 * read as meaningfully different from a regular card, and (item 10) that a
 * thin left-border accent looks bad on its own. Uses a full tinted
 * background + matching border instead of a left bar, plus a leading icon,
 * so a notice is unmistakably not just another card. */
export function Notice({ tone = 'info', className, children, style, dismissible = true, onDismiss }: { tone?: NoticeTone; className?: string; children: ReactNode; style?: CSSProperties; dismissible?: boolean; onDismiss?: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [children, tone]);
  if (dismissed) return null;
  return (
    <div className={`notice notice-${tone}${className ? ` ${className}` : ''}`} style={style}>
      <span className="notice-icon" aria-hidden="true">{NOTICE_ICON[tone]}</span>
      <div className="notice-body">{children}</div>
      {dismissible && <button type="button" className="notice-dismiss" aria-label="Dismiss notice" onClick={() => { setDismissed(true); onDismiss?.(); }}>×</button>}
    </div>
  );
}
