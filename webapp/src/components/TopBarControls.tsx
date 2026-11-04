import { SearchableEntitySwitch, type EntitySwitchOption } from './SearchableEntitySwitch';
import { Children, cloneElement, isValidElement, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { PageFilterModal } from './PageFilterModal';
import { TransactionFilterMenu } from './TransactionFilterMenu';
import { DateRangeWidget } from './DateRangeWidget';
import type { TransactionPageFilters } from '../hooks/useUrlTransactionFilters';
import { FilterIcon } from './icons';
import { EntityScopeMenu } from './EntityScopeMenu';

export function TopBarControls({ children, activeCount, onReset }: { children: ReactNode; activeCount?: number; onReset?: () => void }) {
  const [open, setOpen] = useState(false);
  const controls = Children.toArray(children);
  const switches = controls.filter(child => isValidElement<{ className?: string; label?: string }>(child)
    && (child.type === QuickEntitySwitch || (child.type === TopBarSelect && (
      child.props.className?.includes('account-switch-select')
      || /^Switch /.test(child.props.label ?? '')
      || ['Stock exchange', 'Stock', 'Switch card', 'Bank', 'Account', 'Currency'].includes(child.props.label ?? '')
    ))));
  const explicitDate = controls.find(child => isValidElement(child) && child.type === DateRangeWidget);
  const transaction = controls.find(child => isValidElement(child) && child.type === TransactionFilterMenu);
  const transactionProps = isValidElement<{ value: TransactionPageFilters; onChange: (patch: Partial<TransactionPageFilters>) => void; activeCount: number; onClear: () => void }>(transaction)
    ? transaction.props : undefined;
  const dateWidget = explicitDate ?? (transactionProps
    ? <DateRangeWidget value={transactionProps.value} onChange={transactionProps.onChange} />
    : null);

  // Buttons are actual top-bar actions (not modal fields). Entity and
  // transaction filter fields continue to share the app's one filter modal.
  const customActions = controls.filter(child => isValidElement(child) && child.type === 'button');
  const filterControls = controls.filter(child =>
    !switches.includes(child)
    && child !== explicitDate
    && !(isValidElement(child) && child.type === 'button'),
  );
  const fields = filterControls.map(child => isValidElement<{ inline?: boolean }>(child)
    && (child.type === TransactionFilterMenu || child.type === EntityScopeMenu) ? cloneElement(child, { inline: true }) : child);
  const count = activeCount ?? transactionProps?.activeCount ?? 0;
  const reset = onReset ?? transactionProps?.onClear;

  return (
    <div className="topbar-controls">
      {switches}
      {dateWidget}
      {customActions}
      {fields.length > 0 && (
        <button type="button" className="btn secondary small topbar-filter-btn" onClick={() => setOpen(true)}>
          <FilterIcon size={14} /> Filters{count ? ` (${count})` : ''}
        </button>
      )}
      {open && <PageFilterModal onClose={() => setOpen(false)} onReset={reset}><div className="stack-lg">{fields}</div></PageFilterModal>}
    </div>
  );
}

export function QuickEntitySwitch({ label, value, options, onChange, searchable = false }: {
  label: string; value: string; options: EntitySwitchOption[]; onChange: (value: string) => void; searchable?: boolean;
}) {
  if (searchable) return <SearchableEntitySwitch label={label} value={value} options={options} onChange={onChange} />;
  return <TopBarSelect label={label} className="account-switch-select" value={value} options={options} onChange={event => onChange(event.target.value)} />;
}

export function TopBarSelect({ label, options, className = '', ...rest }: {
  label: string; options: Array<{ value: string; label: string; disabled?: boolean }>;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'>) {
  return <label className="topbar-select-wrap"><span>{label}</span><select className={`topbar-select ${className}`.trim()} aria-label={label} title={label} {...rest}>{options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></label>;
}
