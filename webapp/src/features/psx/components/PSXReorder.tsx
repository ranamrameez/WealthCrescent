import { AccountingEventOrderControls } from '../../../components/AccountingEventOrderControls';
import { toast } from '../../../components/Toast';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { getAccountingEventRefs, type AccountingEventKind } from '../../../lib/seq';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';

export function PSXReorder({ kind, id, date }: { kind: AccountingEventKind; id: string; date: string }) {
  const workbook = usePSXWorkbookStore(state => state.workbook);
  const ensureSignedIn = useEnsureSignedIn();
  const events = getAccountingEventRefs(workbook);

  return (
    <AccountingEventOrderControls
      events={events}
      kind={kind}
      id={id}
      date={date}
      onMove={async pair => {
        if (!(await ensureSignedIn('Sign in to reorder accounting events.'))) return;
        usePSXWorkbookStore.getState().reorderAccountingEvents(pair);
        toast('Same-day accounting sequence updated.');
      }}
    />
  );
}
