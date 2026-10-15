import type { ReactNode, MouseEventHandler } from 'react';
import { Fragment } from 'react';
import { Modal } from './Modal';
import { DateValue } from './DateValue';
import { EditIcon } from './icons';

export interface DetailField {
  label: string;
  value: ReactNode;
}

/** User-reported (2026-09-09): "We should also show a transaction record in
 * a popup when clicked since we are cutting the text; users can never read
 * the full data." A table row necessarily narrows/truncates its cells to
 * fit a column, and several real fields (Time, Timezone, a linked-transfer
 * tag, why a fee came out the way it did) aren't shown in the row at all —
 * this is a generic, reusable read-only detail popup any module's own
 * transaction/record list can open on row click, each building its own
 * field list (since what's worth showing differs per record type) rather
 * than this component guessing at a shape. Values are read-only; the optional Edit action delegates to the source record's form. */
export function RecordDetailModal({ title, fields, onClose, onEdit, onOpen }: { title: string; fields: DetailField[]; onClose: () => void; onEdit?: MouseEventHandler<HTMLButtonElement>; onOpen?: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', alignItems: 'start' }}>
        {fields.map((f, i) => (
          <Fragment key={i}>
            <div className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{f.label}</div>
            <div style={{ wordBreak: 'break-word' }}>{typeof f.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.value) ? <DateValue value={f.value} /> : f.value}</div>
          </Fragment>
        ))}
      </div>
      {onEdit && <div className="d-flex justify-end mt-md"><button type="button" className="btn" onClick={onEdit}><EditIcon size={14} />Edit</button></div>}
      {onOpen && <div className="d-flex justify-end mt-md"><button type="button" className="btn secondary" onClick={onOpen}>Open</button></div>}
    </Modal>
  );
}
