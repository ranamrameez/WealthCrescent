import { dateOnlyMs } from '../lib/datetime';
import type { AccountingEventKind, AccountingEventOrderPair, AccountingEventRef } from '../lib/seq';
import { ReorderButtons } from './ui/ReorderButtons';

/** Shared sequence indicator and arrow controls for every same-day event type.
 * The peer list is the complete accounting stream for that day, not the
 * current table's filtered rows, so a trade can move past a transfer/reward
 * and vice versa without changing either record's date. */
export function AccountingEventOrderControls({
  events,
  kind,
  id,
  date,
  onMove,
}: {
  events: AccountingEventRef[];
  kind: AccountingEventKind;
  id: string;
  date: string;
  onMove: (pair: AccountingEventOrderPair) => void;
}) {
  const dayEvents = events
    .filter(event => event.date === date)
    .sort((a, b) => a.accountingOrder - b.accountingOrder);
  const index = dayEvents.findIndex(event => event.kind === kind && event.id === id);
  const current = dayEvents[index];
  const decode = (value: string): { kind: AccountingEventKind; id: string } => {
    const separator = value.indexOf(':');
    return { kind: value.slice(0, separator) as AccountingEventKind, id: value.slice(separator + 1) };
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
      <span className="text-muted" style={{ fontSize: 11 }} title="Shared same-day accounting sequence. Arrows change order only; the event date is never changed.">
        Seq {current?.accountingOrder ?? '—'}
      </span>
      {current && (
        <ReorderButtons
          rows={dayEvents}
          index={index}
          instantOf={event => dateOnlyMs(event.date)}
          idOf={event => `${event.kind}:${event.id}`}
          orderOf={event => event.accountingOrder}
          onMove={pair => onMove(pair.map(item => {
            const target = decode(item.id);
            const current = dayEvents.find(event => event.kind === target.kind && event.id === target.id);
            // The store validates the pre-move order values, then swaps them.
            return { ...target, order: current?.accountingOrder ?? item.order };
          }) as AccountingEventOrderPair)}
        />
      )}
    </span>
  );
}
