import type { CSSProperties, ReactNode } from 'react';

export interface StatCard2Props {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  keyColor?: CSSProperties['color'];
  valueColor?: CSSProperties['color'];
  descriptionColor?: CSSProperties['color'];
  className?: string;
}

/** Compact supporting metric; independent of the dashboard's larger StatCard. */
export function StatCard2({ label, value, description, keyColor, valueColor, descriptionColor, className = '' }: StatCard2Props) {
  return <div className={`stat-card-2 ${className}`.trim()}>
    <span className="stat-card-2-key" style={{ color: keyColor }}>{label}</span>
    <strong className="stat-card-2-value" style={{ color: valueColor }}>{value}</strong>
    {description != null && <small className="stat-card-2-description" style={{ color: descriptionColor }}>{description}</small>}
  </div>;
}
