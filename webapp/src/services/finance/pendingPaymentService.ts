import { ref, runTransaction } from 'firebase/database';
import { PAYMENT_EXECUTIONS_PATH } from '../../lib/firebase/paymentPaths';
import { validBatchDate } from '../../lib/dateValidation';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { planOccurrenceRecordId } from '../../lib/calc/planOccurrenceIdentity';
import type { PendingPaymentPlan } from '../../lib/calc/pendingPayment';
import { auth, db, firebaseReady } from '../../lib/firebase/client';
import { workbookSyncEpoch, workbookSyncPaused } from '../../lib/firebase/workbookMaintenance';
import { fingerprint } from '../../lib/firebase/workbookFingerprint';
import { nextSerialNumberForEntity } from '../../lib/financeSerial';
import { createEmptyCashWorkbook } from '../../store/defaultCashWorkbook';
import type { BankTransaction, BankWorkbook } from '../../types/bankWorkbook';
import type { InterEntityWorkbook } from '../../types/interEntityTransfer';
import type { CashEntry, CashWorkbook } from '../../types/cashWorkbook';
import type { PlannedBankTransaction, PlannedBankWorkbook } from '../../types/plannedBank';
import type { PlannedCashEntry, PlannedCashWorkbook } from '../../types/plannedCash';

interface PendingExecution {
  id: string;
  module: PendingPaymentPlan['module'];
  planId: string;
  occurrenceDate: string;
  createdAt: string;
  settledOn?: string;
  voidedAt?: string;
}

interface AccountWorkbooks {
  cash?: CashWorkbook;
  bank?: BankWorkbook;
  plannedCash?: PlannedCashWorkbook;
  plannedBank?: PlannedBankWorkbook;
  interEntityTransfers?: InterEntityWorkbook;
  [PAYMENT_EXECUTIONS_PATH]?: PendingExecution[];
}

function rows<T>(value?: T[]): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Review the cloud workbook before creating a pending payment.');
  return value;
}

async function changeAccount(expectedUid: string, change: (account: AccountWorkbooks) => AccountWorkbooks) {
  const user = auth?.currentUser;
  if (!firebaseReady || !db || !user || user.uid !== expectedUid || !expectedUid || /[.#$\[\]/\u0000-\u001f\u007f]/.test(expectedUid)) {
    throw new Error('Your sign-in changed. Review the payment again.');
  }
  const epoch = workbookSyncEpoch();
  const active = () => auth?.currentUser === user && !workbookSyncPaused() && workbookSyncEpoch() === epoch;
  if (!active()) throw new Error('Another workbook operation is in progress.');
  let rejection: Error | undefined;
  const result = await runTransaction(ref(db, 'users/' + expectedUid), (value: AccountWorkbooks | null) => {
    if (!active()) return undefined;
    // A cold client may first see null. Sending it unchanged lets Firebase
    // retry against the server without creating or replacing an account.
    if (value === null) return null;
    try {
      return change(value);
    } catch (error) {
      rejection = error instanceof Error ? error : new Error('Could not prepare the pending payment.');
      return undefined;
    }
  }, { applyLocally: false });
  if (!active()) throw new Error('The active account or workbook changed. Review the payment again.');
  if (!result.committed) throw rejection ?? new Error('Could not save the payment.');
  return result.snapshot.val() as AccountWorkbooks | null;
}

/** Persistence command for reviewed due occurrences. The plan stays open until
 * the pending record is explicitly settled. No payment provider is involved. */
export async function createPendingPayment(expectedUid: string, input: PendingPaymentPlan, occurrenceDate: string, now = new Date()) {
  const reviewed = structuredClone(input);
  const createdAt = now.toISOString();
  const today = createdAt.slice(0, 10);
  const id = planOccurrenceRecordId({ module: reviewed.module, id: reviewed.plan.id }, occurrenceDate);
  const reviewedKey = fingerprint(reviewed.plan);
  const payload = await changeAccount(expectedUid, value => {
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
  });
  if (!payload?.[PAYMENT_EXECUTIONS_PATH]?.some(entry => entry.id === id)) {
    throw new Error('No matching cloud plan was available for the pending payment.');
  }
  return { id, occurrenceDate };
}

function reviewedRecord<T extends CashEntry | BankTransaction>(
  ledger: T[], history: PendingExecution, amount: number, sameSource: (record: T) => boolean,
) {
  const matches = ledger.filter(record => record.id === history.id);
  const record = matches[0];
  if (matches.length !== 1 || record.planLink?.module !== history.module || record.planLink.planId !== history.planId ||
      record.planLink.occurrenceDate !== history.occurrenceDate || !sameSource(record) ||
      record.isDeposit || record.amount !== amount) {
    throw new Error('The funded record changed. Review it before continuing.');
  }
  return record;
}

function reviewedExecution(account: AccountWorkbooks, reviewed: PendingPaymentPlan, id: string, occurrenceDate: string) {
  const history = rows(account[PAYMENT_EXECUTIONS_PATH]);
  const executions = history.filter(entry => entry.id === id);
  const execution = executions[0];
  if (executions.length !== 1 || execution.module !== reviewed.module || execution.planId !== reviewed.plan.id ||
      execution.occurrenceDate !== occurrenceDate) throw new Error('No matching payment execution is available.');
  return { history, execution };
}

function settleRows<T extends CashEntry | BankTransaction, P extends PlannedCashEntry | PlannedBankTransaction>(
  ledger: T[], plans: P[], expected: P, history: PendingExecution, settlementDate: string, sameSource: (record: T) => boolean,
) {
  const record = reviewedRecord(ledger, history, expected.amount, sameSource);
  if (history.settledOn) {
    if (history.settledOn === settlementDate && record.date === settlementDate && !record.isPending) return null;
    throw new Error('This occurrence already has a different settlement.');
  }
  if (!record.isPending || record.date !== history.occurrenceDate) {
    throw new Error('The funded record is no longer pending in its original ledger.');
  }

  const matchedPlans = plans.filter(plan => plan.id === history.planId);
  const current = matchedPlans[0];
  if (matchedPlans.length !== 1 || fingerprint(current) !== fingerprint(expected)) {
    throw new Error('The cloud plan changed. Review its current occurrence.');
  }
  const prepared = CalculationEngine.manualPayments.prepareManualPlanFulfillment(
    { module: history.module, id: history.planId }, current, history.occurrenceDate, settlementDate,
  );
  const updatedPlans = plans.map(plan => plan.id === current.id ? prepared.updated as P : plan);
  if (prepared.snapshot) {
    const snapshot = prepared.snapshot;
    if (plans.some(plan => plan.id === snapshot.id || (plan.seriesId === current.id && plan.date === history.occurrenceDate))) {
      throw new Error('This occurrence already has a completion record.');
    }
    updatedPlans.push(JSON.parse(JSON.stringify(snapshot)) as P);
  }
  return {
    ledger: ledger.map(row => row.id === record.id ? { ...row, date: settlementDate, isPending: false } : row),
    plans: updatedPlans,
  };
}

/** Confirm full settlement of an existing pending ledger record. */
export async function settlePendingPayment(
  expectedUid: string, input: PendingPaymentPlan, occurrenceDate: string, settlementDate: string, now = new Date(),
) {
  const reviewed = structuredClone(input);
  const updated = now.toISOString();
  const today = updated.slice(0, 10);
  if (!validBatchDate(settlementDate) || settlementDate > today) throw new Error('Choose a valid settlement date through today.');
  const prepared = CalculationEngine.pendingPayments.preparePendingPayment(reviewed, occurrenceDate, today);
  const id = prepared.record.id;
  const payload = await changeAccount(expectedUid, value => {
    const { history, execution } = reviewedExecution(value, reviewed, id, occurrenceDate);
    if (execution.voidedAt) throw new Error('This occurrence was voided.');
    const next = {
      ...value,
      [PAYMENT_EXECUTIONS_PATH]: history.map(entry => entry.id === id ? { ...entry, settledOn: settlementDate } : entry),
    };
    if (reviewed.module === 'cash') {
      const { cash, plannedCash } = value;
      if (!cash || !plannedCash) throw new Error('No matching Cash workbook is available to settle.');
      const settlement = settleRows(rows(cash.entries), rows(plannedCash.entries), reviewed.plan, execution, settlementDate,
        record => record.currencyCode === reviewed.plan.currencyCode);
      return settlement ? {
        ...next,
        cash: { ...cash, entries: settlement.ledger, _updated: updated },
        plannedCash: { ...plannedCash, entries: settlement.plans, _updated: updated },
      } : value;
    }
    const { bank, plannedBank } = value;
    if (!bank || !plannedBank) throw new Error('No matching Bank workbook is available to settle.');
    if (!rows(bank.settings?.accounts).some(account => account.id === reviewed.plan.accountId && account.currencyCode && !account.migratedToCreditCardId)) {
      throw new Error('The paying bank account is no longer available. Review the pending record.');
    }
    const settlement = settleRows(rows(bank.transactions), rows(plannedBank.entries), reviewed.plan, execution, settlementDate,
      record => record.accountId === reviewed.plan.accountId);
    return settlement ? {
      ...next,
      bank: { ...bank, transactions: settlement.ledger, _updated: updated },
      plannedBank: { ...plannedBank, entries: settlement.plans, _updated: updated },
    } : value;
  });
  if (!payload?.[PAYMENT_EXECUTIONS_PATH]?.some(entry => entry.id === id && entry.settledOn === settlementDate)) {
    throw new Error('No matching cloud payment was available for settlement.');
  }
  return { id, occurrenceDate, settlementDate };
}

/** Void an existing pending record while retaining its execution identity. */
export async function voidPendingPayment(
  expectedUid: string, input: PendingPaymentPlan, occurrenceDate: string, now = new Date(),
) {
  const reviewed = structuredClone(input);
  const voidedAt = now.toISOString();
  if (!validBatchDate(occurrenceDate)) throw new Error('Choose a valid occurrence to void.');
  const id = planOccurrenceRecordId({ module: reviewed.module, id: reviewed.plan.id }, occurrenceDate);
  const payload = await changeAccount(expectedUid, value => {
    const { history, execution } = reviewedExecution(value, reviewed, id, occurrenceDate);
    if (execution.settledOn) throw new Error('This occurrence has already settled.');
    const linked = rows(value.interEntityTransfers?.entries).some(link =>
      (link.from.module === reviewed.module && link.fromRecordId === id) ||
      (link.to.module === reviewed.module && link.toRecordId === id));
    if (linked) throw new Error('Review the linked transfer before voiding this pending record.');

    function removePending<T extends CashEntry | BankTransaction>(ledger: T[], sameSource: (record: T) => boolean) {
      if (execution.voidedAt && !ledger.some(record => record.id === id)) return null;
      const record = reviewedRecord(ledger, execution, reviewed.plan.amount, sameSource);
      if (execution.voidedAt || !record.isPending || record.date !== occurrenceDate) {
        throw new Error('The funded record is no longer pending in its original ledger.');
      }
      return ledger.filter(row => row.id !== id);
    }

    const next = {
      ...value,
      [PAYMENT_EXECUTIONS_PATH]: history.map(entry => entry.id === id ? { ...entry, voidedAt } : entry),
    };
    if (reviewed.module === 'cash') {
      const { cash } = value;
      if (!cash) throw new Error('No matching Cash workbook is available to void.');
      const entries = removePending(rows(cash.entries), record => record.currencyCode === reviewed.plan.currencyCode);
      return entries ? { ...next, cash: { ...cash, entries, _updated: voidedAt } } : value;
    }
    const { bank } = value;
    if (!bank) throw new Error('No matching Bank workbook is available to void.');
    const transactions = removePending(rows(bank.transactions), record => record.accountId === reviewed.plan.accountId);
    return transactions ? { ...next, bank: { ...bank, transactions, _updated: voidedAt } } : value;
  });
  const execution = payload?.[PAYMENT_EXECUTIONS_PATH]?.find(entry => entry.id === id);
  if (!execution?.voidedAt) throw new Error('No matching cloud payment was available to void.');
  return { id, occurrenceDate, voidedAt: execution.voidedAt };
}
