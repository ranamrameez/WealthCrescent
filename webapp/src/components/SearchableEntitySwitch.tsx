import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
export interface EntitySwitchOption {value:string;label:string;group?:string;}
export function SearchableEntitySwitch({label,value,options,onChange}:{label:string;value:string;options:EntitySwitchOption[];onChange:(value:string)=>void}) {
  const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[active,setActive]=useState(0);
  const root=useRef<HTMLDivElement>(null),menu=useRef<HTMLDivElement>(null), id=useId();
  const [position,setPosition]=useState({left:12,top:0,width:340,maxHeight:420});
  const filtered=options.filter(option=>(option.label+' '+(option.group || '')).toLowerCase().includes(search.toLowerCase()));
  const groups=[...new Set(filtered.map(option=>option.group || 'Tickers'))];
  const selected=options.find(option=>option.value===value);
  useEffect(()=>{
    const close=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node)){setOpen(false);setSearch('');}};
    document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);
  },[]);
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{const rect=root.current?.getBoundingClientRect();if(!rect)return;const width=Math.min(340,window.innerWidth-24);const top=Math.min(rect.bottom+4,window.innerHeight-140);setPosition({left:Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12)),top,width,maxHeight:Math.max(120,Math.min(420,window.innerHeight-top-12))});};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open]);
  useEffect(()=>{if(open)menu.current?.querySelector<HTMLElement>('button.active')?.scrollIntoView?.({block:'nearest'});},[open,active,search]);
  const choose=(option:EntitySwitchOption)=>{onChange(option.value);setOpen(false);setSearch('');setActive(0);};
  return <div ref={root} className="searchable-entity-switch topbar-select-wrap">
    <label htmlFor={id+'-input'}>{label}</label>
    <input id={id+'-input'} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-options'} aria-activedescendant={open&&filtered[active]?id+'-'+active:undefined}
      value={open?search:selected?.label || value} placeholder="Type symbol or name" autoComplete="off"
      onClick={()=>{if(!open){setOpen(true);setSearch('');setActive(0);}}}
      onFocus={()=>{setOpen(true);setSearch('');setActive(0);}} onChange={event=>{setSearch(event.target.value);setActive(0);setOpen(true);}}
      onBlur={event=>{if(!root.current?.contains(event.relatedTarget as Node)&&!menu.current?.contains(event.relatedTarget as Node)){setOpen(false);setSearch('');}}}
      onKeyDown={event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(index=>open?Math.max(0,Math.min(filtered.length-1,index+(event.key==='ArrowDown'?1:-1))):0);}
        if(event.key==='Enter'&&open){event.preventDefault();if(filtered[active])choose(filtered[active]);}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);setSearch('');}
      }}/>
    {open&&createPortal(<div ref={menu} style={{...position,position:'fixed'}} id={id+'-options'} role="listbox" aria-label={label+' options'} className="searchable-entity-options">
      {groups.map(group=><div key={group} role="group" aria-label={group}><div className="searchable-entity-group">{group}</div>{filtered.map((option,index)=>option.group===group||!option.group&&group==='Tickers'?<button key={group+'-'+option.value} id={id+'-'+index} type="button" role="option" aria-selected={option.value===value} className={index===active?'active':''} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(option)}>{option.label}</button>:null)}</div>)}
      {!filtered.length&&<p className="text-muted">No matching tickers.</p>}
    </div>,document.body)}
  </div>;
}
