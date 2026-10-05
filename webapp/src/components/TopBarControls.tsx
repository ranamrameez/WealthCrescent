import { Children, cloneElement, isValidElement, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { PageFilterModal } from './PageFilterModal';
import { TransactionFilterMenu } from './TransactionFilterMenu';
import { FilterIcon } from './icons';
import { EntityScopeMenu } from './EntityScopeMenu';
export function TopBarControls({children}:{children:ReactNode}){
  const [open, setOpen] = useState(false);
  const controls = Children.toArray(children);
  const switches=controls.filter(child=>isValidElement<{className?:string;label?:string}>(child) && (child.type===QuickEntitySwitch || (child.type===TopBarSelect && (child.props.className?.includes('account-switch-select') || /^Switch /.test(child.props.label ?? '') || ['Stock exchange','Stock','Switch card','Bank','Account','Currency'].includes(child.props.label ?? '')))));
  const filterControls=controls.filter(child=>!switches.includes(child));
  const transaction = controls.find((child) => isValidElement(child) && child.type === TransactionFilterMenu);
  // Render transaction fields directly in the same popup as entity selectors.
  const fields = filterControls.map((child) => isValidElement<{ inline?: boolean }>(child) && (child.type === TransactionFilterMenu || child.type === EntityScopeMenu) ? cloneElement(child, { inline: true }) : child);
  const props = isValidElement<{ activeCount: number; onClear: () => void }>(transaction) ? transaction.props : undefined;
  // Existing page-owned modal triggers already provide their own popup.
  if (controls.length === 1 && isValidElement(controls[0]) && controls[0].type === 'button') return <div className="topbar-controls">{children}</div>;
  return <div className="topbar-controls">{switches}{fields.length>0 && <button type="button" className="btn secondary small topbar-filter-btn" onClick={() => setOpen(true)}><FilterIcon size={14} /> Filters{props?.activeCount ? ` (${props.activeCount})` : ''}</button>}{open && <PageFilterModal onClose={() => setOpen(false)} onReset={props?.onClear}><div className="stack-lg">{fields}</div></PageFilterModal>}</div>;
}
export function QuickEntitySwitch({label,value,options,onChange}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void}) {
  return <TopBarSelect label={label} className="account-switch-select" value={value} options={options} onChange={event=>onChange(event.target.value)} />;
}
export function TopBarSelect({label,options,className='',...rest}:{label:string;options:Array<{value:string;label:string;disabled?:boolean}>}&Omit<SelectHTMLAttributes<HTMLSelectElement>,'children'>){
  return <label className="topbar-select-wrap"><span>{label}</span><select className={`topbar-select ${className}`.trim()} aria-label={label} title={label} {...rest}>{options.map(o=><option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select></label>;
}
