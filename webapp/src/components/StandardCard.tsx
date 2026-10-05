import { Children, isValidElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArchiveIcon, CheckIcon, CollapseIcon, EditIcon, ExpandIcon, ExportIcon, FlaskIcon, MenuIcon, PlanningIcon, PlusIcon, SaveIcon, TrashIcon, XIcon } from './icons';
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

export function CardActionMenu({ actions, onAction }: { actions: StandardCardAction[]; onAction?: () => void }) {
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
    {open && <div className="standard-card-menu-popover" role="menu">{actions.map(a=><button key={a.label} type="button" className={`standard-card-menu-item${a.tone==='danger'?' danger':''}`} disabled={a.disabled} onClick={()=>{setOpen(false);onAction?.();a.onClick();}}>{a.icon ?? actionIcon(a.label)}<span>{a.label}</span></button>)}</div>}
  </div>;
}

export function StandardCard({ title, summary, actions=[], headerEnd, defaultOpen=true, open:controlledOpen, onToggle, children, className='', hue }: {
  title:ReactNode; summary?:ReactNode; actions?:StandardCardAction[]; headerEnd?:ReactNode; defaultOpen?:boolean; open?:boolean; onToggle?:(open:boolean)=>void; children:ReactNode; className?:string; hue?:string;
}) {
  const content = Children.toArray(children);
  const onlyChild = content.length === 1 && isValidElement(content[0]) ? content[0] : undefined;
  const redundantWrapper = onlyChild && (onlyChild.type === StandardCard || (typeof onlyChild.type === 'function' && 'cardContainer' in onlyChild.type && onlyChild.type.cardContainer === true));
  const [internalOpen,setInternalOpen]=useState(defaultOpen);
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    if (!fullScreen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullScreen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullScreen]);
  const open=controlledOpen??internalOpen;
  const toggle=()=>{const next=!open; if(onToggle)onToggle(next); else setInternalOpen(next);};
  const enterFullScreen = () => { setFullScreen(true); if (!open) { if (onToggle) onToggle(true); else setInternalOpen(true); } };
  return <>{fullScreen && <div className="standard-card-backdrop" onClick={() => setFullScreen(false)} />}
  <section
    className={`${redundantWrapper && !fullScreen ? 'standard-section' : 'card'} standard-card${hue ? ' standard-card-hued' : ''}${fullScreen ? ' standard-card-fullscreen' : ''} ${className}`.trim()}
    style={hue ? ({ '--card-hue': hue } as CSSProperties) : undefined}
  >
    <header className="standard-card-header">
      <button type="button" className="standard-card-toggle" aria-expanded={open} onClick={toggle}><span className={`standard-card-arrow${open?' open':''}`} aria-hidden>▸</span><span className="standard-card-title">{title}</span></button>
      <div className="standard-card-summary">{summary}</div>
      <div className="standard-card-actions" onClick={e=>e.stopPropagation()}>
        {headerEnd}
        <StandardIconButton
          label={fullScreen ? 'Exit full screen' : 'Full screen'}
          icon={fullScreen ? <CollapseIcon size={15} /> : <ExpandIcon size={15} />}
          className="standard-card-menu-trigger standard-card-fullscreen-trigger"
          onClick={() => fullScreen ? setFullScreen(false) : enterFullScreen()}
        />
        <CardActionMenu actions={actions} onAction={()=>{if(!open){if(onToggle)onToggle(true);else setInternalOpen(true);}}}/>
      </div>
    </header>
    {open && <div className="standard-card-body">{children}</div>}
  </section></>;
}
