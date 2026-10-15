import type { ComponentProps } from 'react';
import { TransactionEntryModal } from './TransactionEntryModal';

/** Loaded on demand so generic rows do not initialize the transfer form's page imports. */
export default function RecordTransferEditor(props: ComponentProps<typeof TransactionEntryModal>) {
  return <TransactionEntryModal {...props} />;
}
