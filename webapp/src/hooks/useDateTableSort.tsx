import { useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { TableSortContext, type DateSortSelection } from '../components/tableSortContext';
import { DateSortHeader } from '../components/DateSortHeader';
import { toInstantMs } from '../lib/datetime';

type DateValue = string | number | { date?: string | null; time?: string; timezone?: string; seq?: number; serialNumber?: number };
export function useDateTableSort() {
  const context = useContext(TableSortContext);
  const [local, setLocal] = useState<DateSortSelection>(null);
  const selection = context ? context.selection : local;
  const setSelection = context?.setSelection ?? setLocal;
  const id = useId();
  const unregister = context?.unregister;
  useEffect(() => () => unregister?.(id), [unregister, id]);
  function rows<T>(items: readonly T[], dates: Record<string, (row: T) => DateValue | null | undefined>): T[] {
    if (!selection) return [...items];
    const getter = dates[selection.column] ?? Object.values(dates)[0];
    const key = (row: T) => {
      const value = getter(row);
      const date = typeof value === 'object' && value ? value.date : value;
      const time = typeof value === 'object' && value ? value.time : undefined;
      const timezone = typeof value === 'object' && value ? value.timezone : undefined;
      const instant = typeof date === 'number' ? date : date ? toInstantMs(date.length === 7 ? `${date}-01` : date, time, timezone) : NaN;
      const sequence = typeof value === 'object' && value ? value.seq ?? value.serialNumber ?? 0 : 0;
      return { instant, sequence };
    };
    return [...items].sort((a, b) => {
      const av = key(a), bv = key(b);
      if (!Number.isFinite(av.instant)) return Number.isFinite(bv.instant) ? 1 : 0;
      if (!Number.isFinite(bv.instant)) return -1;
      return (selection.direction === 'asc' ? 1 : -1) * (av.instant - bv.instant || av.sequence - bv.sequence);
    });
  }
  function Th({ column = 'date', children, rows }: { column?: string; children: ReactNode; rows?: readonly unknown[] }) {
    return <DateSortHeader id={id} column={column} selection={selection} setSelection={setSelection} rows={rows}>{children}</DateSortHeader>;
  }
  return { rows, Th, selection, setSelection };
}
