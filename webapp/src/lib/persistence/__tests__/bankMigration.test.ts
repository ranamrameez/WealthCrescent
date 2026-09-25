import { describe, expect, it } from 'vitest';
import { migrateBankWorkbook } from '../bankMigration';
import { createIndexedDbRepository } from '../indexedDbRepository';

describe('bank persistence migration', () => {
  it('is idempotent and preserves record counts', async () => {
    const repo = createIndexedDbRepository();
    const workbook = { settings: { accounts: [{ id: 'a1', name: 'Main', currencyCode: 'USD', openingBalance: 0 }], banks: [{ id: 'b1', name: 'Bank' }] }, transactions: [{ id: 't1', accountId: 'a1', date: '2026-01-01', amount: 10, description: 'Deposit', source: 'manual' }] } as never;
    const first = await migrateBankWorkbook(workbook, repo);
    const second = await migrateBankWorkbook(workbook, repo);
    expect(first).toEqual(second);
    expect(await repo.query('bank-banks')).toHaveLength(1);
    expect(await repo.query('bank-accounts')).toHaveLength(1);
    expect(await repo.query('bank-transactions')).toHaveLength(1);
  });
});
