import { TableCard } from './TableCard';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { orderedPageSections } from '../lib/pageSectionOrder';
import { useSearchParams } from 'react-router-dom';
import { usePageTopBarChips } from '../hooks/usePageTopBar';
import type { TopBarChip } from '../store/pageTopBarStore';
import { StandardCard, type StandardCardAction } from './StandardCard';

export interface SectionCardProps { open: boolean; onToggle: (open: boolean) => void }

export interface StandardPageSection { table?: boolean; render?: (props: SectionCardProps) => ReactNode; key:string; label:string; content:ReactNode; summary?:ReactNode; actions?:StandardCardAction[]; headerEnd?:ReactNode; defaultOpen?:boolean; hue?:string; unframed?:boolean; }

export function StandardPageSections({sections: suppliedSections,defaultKey,preserveOrder = false}:{sections:StandardPageSection[];defaultKey?:string;preserveOrder?:boolean}) {
  const sections = preserveOrder ? suppliedSections : orderedPageSections(suppliedSections);
  const sectionId = useId();
  const [params,setParams]=useSearchParams();
  const firstKey=defaultKey||sections[0]?.key||'';
  const requested=params.get('section');
  const activeKey=requested&&sections.some(s=>s.key===requested)?requested:firstKey;
  const [openKeys,setOpenKeys]=useState<Record<string,boolean>>(()=>Object.fromEntries(sections.map(s=>[s.key,s.defaultOpen??(s.key===activeKey||s.key==='summary'||s.key==='funds'||s.key==='brokers')])));
  const refs=useRef<Record<string,HTMLElement|null>>({});
  // Clearing the selected section must not reopen the default section.
  // Initial defaults are handled by the state initializer; only explicit URL
  // selections should open a section after that (including browser history).
  const requestedKey = requested && sections.some(s => s.key === requested) ? requested : null;
  useEffect(()=>{if(requestedKey)setOpenKeys(p=>p[requestedKey]?p:({...p,[requestedKey]:true}));},[requestedKey]);
  const setSection=(key:string|null)=>{const next=new URLSearchParams(params); if(key)next.set('section',key); else next.delete('section'); setParams(next);};
  const jump=(key:string)=>{setOpenKeys(p=>({...p,[key]:true}));setSection(key);requestAnimationFrame(()=>refs.current[key]?.scrollIntoView({behavior:'smooth',block:'start'}));};
  const allOpen=sections.length>0&&sections.every(s=>openKeys[s.key]);
  const chips=useMemo<TopBarChip[]>(()=>[
    {key:'__all__',label:'All',active:allOpen,onClick:()=>{setOpenKeys(Object.fromEntries(sections.map(s=>[s.key,true])));setSection('all');}},
    ...sections.map(s=>({key:s.key,label:s.label,active:!allOpen&&activeKey===s.key,onClick:()=>jump(s.key)}))
  ],[sections,openKeys,activeKey,requested]);
  usePageTopBarChips(chips);
  return <div className="standard-section-stack">{sections.map(s=><div key={s.key} id={`${sectionId}-${s.key}`} data-page-section={s.key} data-section-label={s.label} className="standard-section-anchor" ref={el=>{refs.current[s.key]=el;}}>
    {s.render ? s.render({ open: !!openKeys[s.key], onToggle: open => { setOpenKeys(p => ({ ...p, [s.key]: open })); if (open) setSection(s.key); else if (requested === 'all' || activeKey === s.key) setSection(null); } }) : s.unframed
      ? (!!openKeys[s.key] && s.content)
      : s.table ? <TableCard title={s.label} summary={s.summary} actions={s.actions} headerEnd={s.headerEnd} hue={s.hue} open={!!openKeys[s.key]} onToggle={open=>{setOpenKeys(p=>({...p,[s.key]:open})); if(open)setSection(s.key); else if(requested==='all'||activeKey===s.key)setSection(null);}}>{s.content}</TableCard>
      : <StandardCard title={s.label} summary={s.summary} actions={s.actions} headerEnd={s.headerEnd} hue={s.hue} open={!!openKeys[s.key]} onToggle={open=>{setOpenKeys(p=>({...p,[s.key]:open})); if(open)setSection(s.key); else if(requested==='all'||activeKey===s.key)setSection(null);}}>{s.content}</StandardCard>}
  </div>)}</div>;
}
