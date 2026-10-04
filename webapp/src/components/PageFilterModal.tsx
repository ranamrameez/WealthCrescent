import type { ReactNode } from 'react';
import { Modal } from './Modal';

/** Shared popup shell for page-wide filters, matching Banking. */
export function PageFilterModal({ children, onClose, onReset }: {
  children: ReactNode;
  onClose: () => void;
  onReset?: () => void;
}) {
  return <Modal title="Page filters" onClose={onClose} widthClass="50">
    {children}
    <div className="modal-footer-actions">
      {onReset && <button type="button" className="btn secondary small" onClick={onReset}>Reset</button>}
      <button type="button" className="btn small" onClick={onClose}>Done</button>
    </div>
  </Modal>;
}
