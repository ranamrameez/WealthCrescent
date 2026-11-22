import { expect, it } from 'vitest';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { exportLocalWorkbookBackup } from './localWorkbookBackupService';
import { APP_DATA_MODULE_LABELS, CLOUD_PATH_SUFFIX } from './workbookRegistry';
it('exports every registered native workbook and isolates recovery data from subsequent edits', () => {
  const original = useCashWorkbookStore.getState().workbook;
  try {
    useCashWorkbookStore.setState({ workbook: { ...original, entries: [{ id: 'unsynced', date: '2026-11-19', amount: 123.45, isDeposit: false, currencyCode: 'QAR', source: 'manual', isPending: true, planLink: { module: 'cash', planId: 'plan', occurrenceDate: '2026-11-19' } }] } });
    const backup = exportLocalWorkbookBackup();
    expect(Object.keys(backup).filter(key => key !== '_backup').sort()).toEqual(Object.keys(CLOUD_PATH_SUFFIX).sort());
    expect(Object.keys(APP_DATA_MODULE_LABELS).sort()).toEqual(Object.keys(CLOUD_PATH_SUFFIX).sort());
    expect(backup.cash).toMatchObject({ entries: [{ id: 'unsynced', amount: 123.45, isPending: true, planLink: { planId: 'plan' } }] });
    expect(backup._backup).toMatchObject({ version: 2, scope: 'local-workbooks' });
    expect(backup).not.toHaveProperty('paymentExecutions');
    (backup.cash as { entries: { amount: number }[] }).entries[0].amount = 999;
    expect(useCashWorkbookStore.getState().workbook.entries[0].amount).toBe(123.45);
  } finally { useCashWorkbookStore.setState({ workbook: original }); }
});
