import { useId, useLayoutEffect, useMemo, useRef, type ComponentProps, type ReactNode } from 'react';
import { Modal } from './Modal';
import type { StandardCardAction } from './StandardCard';
import { usePageFabActions } from '../hooks/usePageFabActions';
import { PlusIcon } from './icons';

/** Shared create/edit shell; each entity supplies its complete form fields. */
export function EntityEditorModal({ children, ...props }: ComponentProps<typeof Modal>) {
  return <Modal {...props}><div className="entity-editor-fields">{children}</div></Modal>;
}

/** Page-level actions remain available when every section is collapsed. */
export function EntityActions({ actions, children }: { actions: StandardCardAction[]; children?: ReactNode }) {
  const id = useId();
  const latest = useRef(actions);
  useLayoutEffect(() => { latest.current = actions; }, [actions]);
  const signature = JSON.stringify(actions.filter(action => !action.disabled).map(action => action.label));
  // Keep registration stable when parents rebuild callback arrays; clicks use
  // the latest fields and handlers rather than the registration snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const registered = useMemo(() => actions.filter(action => !action.disabled).map(action => ({ label: action.label, icon: action.icon ?? <PlusIcon />, onClick: () => latest.current.find(item => item.label === action.label)?.onClick() })), [signature]);
  usePageFabActions(`entity-actions-${id}`, registered);
  return <>{children}</>;
}
