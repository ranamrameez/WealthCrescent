import { DateValue } from './DateValue';
import type { ReactNode } from 'react';
import { hueStyle } from '../lib/statCardHues';
import { Tooltip } from './Tooltip';

export function SummaryMetric({ label, value, tone = 'pill-info', large = false, suffix, tooltip }: {
  label: string; value: ReactNode; tone?: string; large?: boolean; suffix?: ReactNode; tooltip?: string;
}) {
  return <div className={`summary-metric${large ? ' summary-metric-large' : ''}`}>
    {tooltip ? <Tooltip text={tooltip}><span className="summary-metric-label clickable">{label}</span></Tooltip> : <span className="summary-metric-label">{label}</span>}
    <strong className={`pill ${tone}`}>{typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? <DateValue value={value} /> : value}{suffix}</strong>
  </div>;
}

/** Shared light-border summary layout used by Portfolio Item: related metrics
 * sit together in flexible inline subsections instead of nested cards. */
export function SummarySections({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`current-position-sections ${className}`.trim()}>{children}</div>;
}

export function SummarySection({ title, children, className = '' }: { title: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`current-position-section ${className}`.trim()}>
    <h4>{title}</h4>
    <div className="current-position-metrics">{children}</div>
  </section>;
}

export function SummaryValue({ label, value, detail, primary = false, tone, className = '' }: {
  label: ReactNode; value: ReactNode; detail?: ReactNode; primary?: boolean;
  tone?: 'positive' | 'negative' | 'neutral'; className?: string;
}) {
  const toneClass = tone === 'positive' ? 'text-profit' : tone === 'negative' ? 'text-loss' : '';
  return <div className={`current-position-metric${primary ? ' current-position-primary' : ''} ${className}`.trim()}>
    <span>{label}</span>
    <strong className={toneClass || undefined}>{value}</strong>
    {detail != null && <small>{detail}</small>}
  </div>;
}

export function SummaryGroupCard({ title, tooltip, children, className = '', hue }: {
  title: ReactNode; tooltip?: string; children: ReactNode; className?: string; hue?: string;
}) {
  return <div className={`stat-card card account-summary-card ${className}`.trim()} style={hue ? hueStyle(hue) : undefined}>
    {tooltip ? <Tooltip text={tooltip}><h4 className="clickable">{title}</h4></Tooltip> : <h4>{title}</h4>}
    <div className="account-summary-card-metrics">{children}</div>
  </div>;
}
