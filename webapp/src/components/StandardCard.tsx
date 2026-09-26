import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArchiveIcon, CheckIcon, EditIcon, ExportIcon, FlaskIcon, MenuIcon, PlanningIcon, PlusIcon, SaveIcon, TrashIcon, XIcon } from './icons';
import { StandardIconButton } from './standard';

export interface StandardCardAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

export function SummaryChip({ label, value }: { label?: string; value: ReactNode }) {
  return <span className="summary-chip">{label && <span className="summary-chip-label">{label}</span>}<span className="summary-chip-value">{value}</span></span>;
}

function CardActionMenu({ actions }: { actions: StandardCardAction[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!actions.length) return null;
  const actionIcon = (label: string) => {
    const name = label.toLowerCase();
    if (name.includes('delete')) return <TrashIcon size={14} />;
    if (name.includes('edit')) return <EditIcon size={14} />;
    if (name.includes('plan')) return <PlanningIcon size={14} />;
    if (name.includes('import')) return <PlusIcon size={14} />;
    if (name.includes('export')) return <ExportIcon size={14} />;
    if (name.includes('filter')) return <FlaskIcon size={14} />;
    if (name.includes('save')) return <SaveIcon size={14} />;
    if (name.includes('done') || name.includes('complete')) return <CheckIcon size={14} />;
    if (name.includes('cancel')) return <XIcon size={14} />;
    if (name.includes('close') || name.includes('archive')) return <ArchiveIcon size={14} />;
    return null;
  };
  return <div className="standard-card-menu" ref={rootRef}>
    <StandardIconButton type="button" className="standard-card-menu-trigger" label="Card options" icon={<MenuIcon size={16}/>} aria-expanded={open} onClick={(e)=>{e.stopPropagation();setOpen(v=>!v);}} />
    {open && <div className="standard-card-menu-popover" role="menu">{actions.map(a=><button key={a.label} type="button" className={`standard-card-menu-item${a.tone==='danger'?' danger':''}`} disabled={a.disabled} onClick={()=>{setOpen(false);a.onClick();}}>{a.icon ?? actionIcon(a.label)}<span>{a.label}</span></button>)}</div>}
  </div>;
}

export function StandardCard({ title, summary, actions=[], headerEnd, defaultOpen=true, open:controlledOpen, onToggle, children, className='' }: {
  title:string; summary?:ReactNode; actions?:StandardCardAction[]; headerEnd?:ReactNode; defaultOpen?:boolean; open?:boolean; onToggle?:(open:boolean)=>void; children:ReactNode; className?:string;
}) {
  const [internalOpen,setInternalOpen]=useState(defaultOpen);
  const open=controlledOpen??internalOpen;
  const toggle=()=>{const next=!open; if(onToggle)onToggle(next); else setInternalOpen(next);};
  return <section className={`card standard-card ${className}`.trim()}>
    <header className="standard-card-header">
      <button type="button" className="standard-card-toggle" aria-expanded={open} onClick={toggle}><span className={`standard-card-arrow${open?' open':''}`} aria-hidden>▸</span><span className="standard-card-title">{title}</span></button>
      <div className="standard-card-summary">{summary}</div>
      <div className="standard-card-actions" onClick={e=>e.stopPropagation()}>{headerEnd}<CardActionMenu actions={actions}/></div>
    </header>
    {open && <div className="standard-card-body">{children}</div>}
  </section>;
}
