import type { ComponentProps } from 'react';
import { EntityEditorModal } from './EntityEditorModal';

/** Plans share popup layout while modules supply their relevant fields. */
export function PlanEditorModal(props: ComponentProps<typeof EntityEditorModal>) {
  return <EntityEditorModal {...props} />;
}
