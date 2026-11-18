import { ref, runTransaction } from 'firebase/database';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { planOccurrenceRecordId } from '../../lib/calc/planOccurrenceIdentity';
import type { PendingPaymentPlan } from '../../lib/calc/pendingPayment';
import { auth, db, firebaseReady } from '../../lib/firebase/client';
import { workbookSyncEpoch, workbookSyncPaused } from '../../lib/firebase/workbookMaintenance';
import { fingerprint } from '../../lib/firebase/workbookFingerprint';
import { nextSerialNumberForEntity } from '../../lib/financeSerial';
import { createEmptyCashWorkbook } from '../../store/defaultCashWorkbook';
import type { BankWorkbook } from '../../types/bankWorkbook';
import type { CashWorkbook } from '../../types/cashWorkbook';
import type { PlannedBankWorkbook } from '../../types/plannedBank';
import type { PlannedCashWorkbook } from '../../types/plannedCash';

const PAYMENT_EXECUTIONS_PATH = 'paymentExecutions';

interface PendingExecution {
  id: string;
  module: PendingPaymentPlan['module'];
  planId: string;
  occurrenceDate: string;
  createdAt: string;
}

interface AccountWorkbooks {
  cash?: CashWorkbook;
  bank?: BankWorkbook;
  plannedCash?: PlannedCashWorkbook;
  plannedBank?: PlannedBankWorkbook;
  [PAYMENT_EXECUTIONS_PATH]?: PendingExecution[];
}

function rows<T>(value?: T[]): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Review the cloud workbook before creating a pending payment.');
  return value;
}

/** Persistence command for reviewed due occurrences. The plan stays open until
 * the pending record is explicitly settled. No payment provider is involved. */
export async function createPendingPayment(expectedUid: string, input: PendingPaymentPlan, occurrenceDate: string, now = new Date()) {
  const user = auth?.currentUser;
  if (!firebaseReady || !db || !user || user.uid !== expectedUid || !expectedUid || /[.#$\[\]/\u0000-\u001f\u007f]/.test(expectedUid)) {
    throw new Error('Your sign-in changed. Review the payment again.');
  }
  const epoch = workbookSyncEpoch();
  const active = () => auth?.currentUser === user && !workbookSyncPaused() && workbookSyncEpoch() === epoch;
  if (!active()) throw new Error('Another workbook operation is in progress.');
  const reviewed = structuredClone(input);
  const createdAt = now.toISOString();
  const today = createdAt.slice(0, 10);
  const id = planOccurrenceRecordId({ module: reviewed.module, id: reviewed.plan.id }, occurrenceDate);
  const reviewedKey = fingerprint(reviewed.plan);
  let rejection: Error | undefined;
  const result = await runTransaction(ref(db, 'users/' + expectedUid), (value: AccountWorkbooks | null) => {
    if (!active()) return undefined;
    // A cold client may first see null. Sending it unchanged lets Firebase
    // retry against the server without creating or replacing an account.
    if (value === null) return null;
    try {
      const history = rows(value[PAYMENT_EXECUTIONS_PATH]);
      const cash = value.cash ?? createEmptyCashWorkbook();
      const bank = value.bank;
      const cashEntries = reviewed.module === 'cash' ? rows(cash.entries) : [];
      const bankEntries = reviewed.module === 'bank' ? rows(bank?.transactions) : [];
      const matchesOccurrence = (record: (typeof cashEntries)[number] | (typeof bankEntries)[number]) => (
        record.planLink?.module === reviewed.module && record.planLink.planId === reviewed.plan.id &&
        record.planLink.occurrenceDate === occurrenceDate
      );
      const existing = [...cashEntries, ...bankEntries].find(record => record.id === id || matchesOccurrence(record));
      if (history.some(entry => entry.id === id)) {
        if (!existing || existing.id !== id || !matchesOccurrence(existing)) {
          throw new Error('This occurrence has execution history. Review its ledger before retrying.');
        }
        return value;
      }
      if (existing) throw new Error('This occurrence already has a ledger record.');

      const plans = reviewed.module === 'cash' ? rows(value.plannedCash?.entries) : rows(value.plannedBank?.entries);
      const matches = plans.filter(plan => plan.id === reviewed.plan.id);
      if (matches.length !== 1 || fingerprint(matches[0]) !== reviewedKey) throw new Error('The cloud plan changed. Review its current occurrence.');
      if (plans.some(plan => plan.executed && plan.seriesId === reviewed.plan.id && plan.date === occurrenceDate)) {
        throw new Error('This occurrence is already fulfilled.');
      }
      const prepared = CalculationEngine.pendingPayments.preparePendingPayment(reviewed, occurrenceDate, today);
      const next = {
        ...value,
        [PAYMENT_EXECUTIONS_PATH]: [...history, { id, module: reviewed.module, planId: reviewed.plan.id, occurrenceDate, createdAt }],
      };
      if (prepared.module === 'cash') {
        const { record } = prepared;
        const entry = JSON.parse(JSON.stringify({ ...record, serialNumber: nextSerialNumberForEntity(cashEntries, row => row.currencyCode, record.currencyCode) })) as typeof record;
        return { ...next, cash: { ...cash, entries: [...cashEntries, entry], _updated: createdAt } };
      }
      const { record } = prepared;
      if (!bank || !rows(bank.settings?.accounts).some(account => account.id === record.accountId && account.currencyCode && account.isActive !== false && !account.migratedToCreditCardId)) {
        throw new Error('Choose an active bank account.');
      }
      const entry = JSON.parse(JSON.stringify({ ...record, serialNumber: nextSerialNumberForEntity(bankEntries, row => row.accountId, record.accountId) })) as typeof record;
      return { ...next, bank: { ...bank, transactions: [...bankEntries, entry], _updated: createdAt } };
    } catch (error) {
      rejection = error instanceof Error ? error : new Error('Could not prepare the pending payment.');
      return undefined;
    }
  }, { applyLocally: false });
  if (!active()) throw new Error('The active account or workbook changed. Review the payment again.');
  const payload = result.snapshot.val() as AccountWorkbooks | null;
  if (!result.committed || !payload?.[PAYMENT_EXECUTIONS_PATH]?.some(entry => entry.id === id)) {
    throw rejection ?? new Error('No matching cloud plan was available for the pending payment.');
  }
  return { id, occurrenceDate };
}
