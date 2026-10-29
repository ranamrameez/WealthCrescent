import { ArrowDownIcon, ArrowUpIcon } from '../icons';
import { IconButton } from './IconButton';
import { canMoveInTie, moveInTie } from '../../hooks/useTieGroupReorder';

/** Reorder adjacent rows either within a same-instant tie (default) or within an
 * explicitly ordered ledger. Cross-instant movement is opt-in and must be used
 * only when the caller passes the complete canonical ledger, not a filtered view. */
export function ReorderButtons<T>({ rows, index, instantOf, idOf, orderOf, onMove, allowAcrossInstants = false }: {
  rows: T[];
  index: number;
  instantOf: (r: T) => number;
  idOf: (r: T) => string;
  orderOf: (r: T) => number | undefined;
  onMove: (pairs: [{ id: string; order: number }, { id: string; order: number }]) => void;
  allowAcrossInstants?: boolean;
}) {
  const up = allowAcrossInstants ? index > 0 : canMoveInTie(rows, index, 'up', instantOf);
  const down = allowAcrossInstants ? index >= 0 && index < rows.length - 1 : canMoveInTie(rows, index, 'down', instantOf);
  if (!up && !down) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      <IconButton
        label={allowAcrossInstants ? 'Move earlier in accounting order. Trade dates remain unchanged.' : "Move up — shares the same date as the row above; this only changes their relative order, not either one's real date."}
        icon={<ArrowUpIcon size={12} />}
        disabled={!up}
        onClick={() => {
          const pair = allowAcrossInstants
            ? (index > 0 ? [
                { id: idOf(rows[index]), order: orderOf(rows[index]) ?? index },
                { id: idOf(rows[index - 1]), order: orderOf(rows[index - 1]) ?? index - 1 },
              ] as [{ id: string; order: number }, { id: string; order: number }] : null)
            : moveInTie(rows, index, 'up', instantOf, idOf, orderOf);
          if (pair) onMove(pair);
        }}
      />
      <IconButton
        label={allowAcrossInstants ? 'Move later in accounting order. Trade dates remain unchanged.' : "Move down — shares the same date as the row below; this only changes their relative order, not either one's real date."}
        icon={<ArrowDownIcon size={12} />}
        disabled={!down}
        onClick={() => {
          const pair = allowAcrossInstants
            ? (index >= 0 && index < rows.length - 1 ? [
                { id: idOf(rows[index]), order: orderOf(rows[index]) ?? index },
                { id: idOf(rows[index + 1]), order: orderOf(rows[index + 1]) ?? index + 1 },
              ] as [{ id: string; order: number }, { id: string; order: number }] : null)
            : moveInTie(rows, index, 'down', instantOf, idOf, orderOf);
          if (pair) onMove(pair);
        }}
      />
    </span>
  );
}
