import { expect, it } from 'vitest';
import { readPsxCashStatement } from '../psxCashStatement';

it('treats table-like text inside a quoted CSV description as data', async () => {
  const csv = 'Date,Description,Debit,Credit,Balance\n2026-11-13,"Fund transfer <table> reference",0,100,100';
  const rows = await readPsxCashStatement(new File([csv], 'Cash statement.CSV'));

  expect(rows).toMatchObject([{ date: '2026-11-13', description: 'Fund transfer <table> reference', type: 'DEPOSIT', gross: 100 }]);
});
