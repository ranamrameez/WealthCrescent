import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

export function BackButton({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate();
  return <ChevronBack onBack={() => navigate(to)} label={children} />;
}

export function ChevronBack({ onBack, label }: { onBack: () => void; label: ReactNode }) {
  return <button type="button" className="page-back-chevron" onClick={onBack} title={typeof label === 'string' ? label.replace(/^←\s*/, '') : 'Back'}>
    <svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden="true"><path d="m13 4-8 8 8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <span className="sr-only">{label}</span>
  </button>;
}
