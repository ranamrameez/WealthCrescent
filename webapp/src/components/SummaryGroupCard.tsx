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

export function SummaryGroupCard({ title, tooltip, children, className = '', hue }: {
  title: ReactNode; tooltip?: string; children: ReactNode; className?: string; hue?: string;
}) {
  return <div className={`stat-card card account-summary-card ${className}`.trim()} style={hue ? hueStyle(hue) : undefined}>
    {tooltip ? <Tooltip text={tooltip}><h4 className="clickable">{title}</h4></Tooltip> : <h4>{title}</h4>}
    <div className="account-summary-card-metrics">{children}</div>
  </div>;
}
