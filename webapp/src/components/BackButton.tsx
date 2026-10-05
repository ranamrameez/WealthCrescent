import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

export function BackButton({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate();
  return <button type="button" className="btn secondary small mb-12" onClick={() => navigate(to)}>{children}</button>;
}
