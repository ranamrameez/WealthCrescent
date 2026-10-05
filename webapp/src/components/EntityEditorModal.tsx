import type { ComponentProps, ReactNode } from 'react';
import { Modal } from './Modal';
import type { StandardCardAction } from './StandardCard';
import { FabPanel } from './ui/Fab';
import { PlusIcon } from './icons';

/** Shared create/edit shell; each entity supplies its complete form fields. */
export function EntityEditorModal({ children, ...props }: ComponentProps<typeof Modal>) {
  return <Modal {...props}><div className="entity-editor-fields">{children}</div></Modal>;
}

/** Page-level actions remain available when every section is collapsed. */
export function EntityActions({ actions, children }: { actions: StandardCardAction[]; children?: ReactNode }) {
  return <><FabPanel actions={actions.map(action => ({ label: action.label, icon: action.icon ?? <PlusIcon />, onClick: action.onClick }))} />{children}</>;
}
