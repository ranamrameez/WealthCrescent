import type { Bank, BankAccount, BankTransaction, BankWorkbook } from '../../types/bankWorkbook';
import { repository } from './indexedDbRepository';
import type { Repository } from './repository';

const MODULE = 'bank-v1';
const JOURNAL = 'migration-journal';

type MigrationJournal = { id: string; status: 'complete'; counts: Record<string, number>; checksum: string; completedAt: string };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Deterministic lightweight checksum used to verify migration identity. */
export function bankMigrationChecksum(workbook: BankWorkbook): string {
  const payload = {
    banks: workbook.settings.banks ?? [],
    accounts: workbook.settings.accounts,
    transactions: workbook.transactions,
  };
  let hash = 2166136261;
  for (const char of stable(payload)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

export async function migrateBankWorkbook(workbook: BankWorkbook, target: Repository = repository): Promise<MigrationJournal> {
  const banks = workbook.settings.banks ?? [];
  const accounts = workbook.settings.accounts;
  const transactions = workbook.transactions;
  const checksum = bankMigrationChecksum(workbook);
  const existing = await target.get<MigrationJournal>(JOURNAL, MODULE);
  if (existing?.status === 'complete' && existing.checksum === checksum) return existing;

  await target.transaction(async (tx) => {
    await tx.bulkPut('bank-banks', banks as (Bank & { id: string })[]);
    await tx.bulkPut('bank-accounts', accounts as (BankAccount & { id: string })[]);
    await tx.bulkPut('bank-transactions', transactions as (BankTransaction & { id: string })[]);
    const counts = { banks: banks.length, accounts: accounts.length, transactions: transactions.length };
    await tx.update(JOURNAL, { id: MODULE, status: 'complete', counts, checksum, completedAt: new Date().toISOString() });
  });
  return (await target.get<MigrationJournal>(JOURNAL, MODULE))!;
}
