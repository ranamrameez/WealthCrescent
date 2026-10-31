import { useCallback, useMemo, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { StandardCard, SummaryChip, type StandardCardAction } from './StandardCard';
import { ExportIcon, SortIcon } from './icons';
import { TableSortContext, type TableCardDateSort, type DateSortSelection } from './tableSortContext';
import { toCSV } from '../lib/csv';

type Props = Omit<ComponentProps<typeof StandardCard>, 'title' | 'children'> & {
  title?: ReactNode; children: ReactNode; headerExtra?: ReactNode; style?: CSSProperties;
  rows?: readonly unknown[]; allRows?: readonly unknown[]; exportFilename?: string;
  onImport?: () => void; onExportFiltered?: () => void; onExportAll?: () => void;
  onBatchEdit?: () => void; onModify?: () => void; modifying?: boolean;
  dateSort?: TableCardDateSort;
};
function exportRows(name: string, rows: readonly unknown[]) {
  const records = rows.map(row => row && typeof row === 'object' ? row as Record<string, unknown> : { value: row });
  const keys = [...new Set(records.flatMap(row => Object.keys(row)))];
  const csv = toCSV([keys, ...records.map(row => keys.map(key => { const value = row[key]; return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); }))]);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${name}.csv`; anchor.click(); URL.revokeObjectURL(url);
}
/** Table-specific child of StandardCard. Existing handlers override the default menu entries. */
export function TableCard({ title = 'Records', children, actions = [], rows, allRows, onImport, onExportFiltered, onExportAll, onBatchEdit, onModify, modifying, dateSort, exportFilename = 'records', headerExtra, style, ...props }: Props) {
  const [selection, setSelection] = useState<DateSortSelection>(null);
  const [datasets, setDatasets] = useState<Record<string, { rows: readonly unknown[]; hasDate: boolean; signature: string }>>({});
  const register = useCallback((id: string, values: readonly unknown[], hasDate: boolean) => {
    const signature = JSON.stringify(values);
    setDatasets(previous => previous[id]?.signature === signature && previous[id]?.hasDate === hasDate ? previous : { ...previous, [id]: { rows: values, hasDate, signature } });
  }, []);
  const unregister = useCallback((id: string) => setDatasets(previous => { if (!(id in previous)) return previous; const next = { ...previous }; delete next[id]; return next; }), []);
  const controller = useMemo(() => ({ selection: dateSort?.selection ?? selection, setSelection: dateSort?.setSelection ?? setSelection, register, unregister }), [dateSort?.selection, dateSort?.setSelection, selection, register, unregister]);
  const data = rows ?? Object.values(datasets)[0]?.rows;
  const hasDate = !!dateSort || Object.values(datasets).some(dataset => dataset.hasDate);
  const remaining = [...actions];
  const take = (matches: (label: string) => boolean) => {
    const index = remaining.findIndex(action => matches(action.label.toLowerCase()));
    return index < 0 ? undefined : remaining.splice(index, 1)[0];
  };
  const menu: StandardCardAction[] = [];
  const importAction = take(label => label.includes('import'));
  if (importAction || onImport) menu.push(importAction ?? { label: 'Import', icon: <ExportIcon />, onClick: onImport! });

  const filteredExport = take(label => label.includes('export') && !label.includes('all') && !label.includes('backup'));
  if (filteredExport || onExportFiltered || data?.length) {
    menu.push(filteredExport ?? {
      label: 'Export filtered',
      icon: <ExportIcon />,
      onClick: onExportFiltered ?? (() => exportRows(`${exportFilename}-filtered`, data ?? [])),
    });
  }

  const allExport = take(label => label.includes('export') && label.includes('all'));
  if (allExport || onExportAll || allRows?.length) {
    menu.push(allExport ?? {
      label: 'Export all',
      icon: <ExportIcon />,
      onClick: onExportAll ?? (() => exportRows(`${exportFilename}-all`, allRows ?? [])),
    });
  }

  const batchEdit = take(label => label.includes('batch'));
  if (batchEdit || onBatchEdit) menu.push(batchEdit ?? { label: 'Batch edit', onClick: onBatchEdit! });

  const modifyAction = take(label => label.includes('modify'));
  if (modifyAction || onModify) {
    menu.push(modifyAction ?? { label: modifying ? 'Done modifying' : 'Modify', onClick: onModify! });
  }

  menu.push(...remaining);
  if (hasDate) menu.push(
    { label: 'Date: newest first', icon: <SortIcon direction="desc" />, onClick: () => controller.setSelection({ column: 'date', direction: 'desc' }) },
    { label: 'Date: oldest first', icon: <SortIcon direction="asc" />, onClick: () => controller.setSelection({ column: 'date', direction: 'asc' }) },
  );
  const card = <TableSortContext.Provider value={controller}><StandardCard {...props} className={`table-card ${props.className ?? ''}`} title={title} actions={menu} headerEnd={props.headerEnd ?? headerExtra} summary={props.summary ?? (data ? <SummaryChip label="Filtered" value={data.length} /> : undefined)}>{children}</StandardCard></TableSortContext.Provider>;
  return style ? <div style={style}>{card}</div> : card;
}
TableCard.cardContainer = true;
