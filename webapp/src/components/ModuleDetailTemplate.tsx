import type { CSSProperties, ReactNode } from 'react';
import { StandardPageSections, type StandardPageSection } from './StandardPageSections';
import { usePageTopBarRightSlot } from '../hooks/usePageTopBar';

export interface ModuleDetailTemplateProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  backLabel: string;
  onBack: () => void;
  sections: StandardPageSection[];
  defaultKey?: string;
  hue?: string;
  topBarRight?: ReactNode | null;
  children?: ReactNode;
}

/** Canonical detail-page shell shared by Banking and the other finance modules. */
export function ModuleDetailTemplate({
  title,
  subtitle,
  backLabel,
  onBack,
  sections,
  defaultKey = 'summary',
  hue,
  topBarRight = null,
  children,
}: ModuleDetailTemplateProps) {
  usePageTopBarRightSlot(topBarRight);
  return (
    <div className="standard-page module-detail-template" style={hue ? { '--module-hue': hue } as CSSProperties : undefined}>
      <button className="btn secondary small mb-12" onClick={onBack}>← {backLabel}</button>
      {title && <div className="module-detail-heading"><h1>{title}</h1>{subtitle && <div className="muted">{subtitle}</div>}</div>}
      <StandardPageSections sections={sections} defaultKey={defaultKey} />
      {children}
    </div>
  );
}
