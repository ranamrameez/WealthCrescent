import type { ReactNode } from 'react';
import { AnalyticsChartCard } from './AnalyticsChartCard';

export function StockAnalyticsCard({ title, titleTooltip, empty, unfiltered, children }: {
  title: string; titleTooltip?: string; empty?: boolean; unfiltered?: boolean; children: ReactNode;
}) {
  return <div>
    <AnalyticsChartCard title={title} tooltip={titleTooltip ?? title}>
      {empty ? <p className="text-muted">Not enough data yet.</p> : children}
    </AnalyticsChartCard>
    {unfiltered && <p className="text-muted">Whole portfolio; ticker and date filters do not apply.</p>}
  </div>;
}
