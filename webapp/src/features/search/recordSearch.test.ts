import { expect, it } from 'vitest';
import { collectSearchRecords } from './recordSearch';
it('preserves native signed amounts and types, and leaves invalid amounts absent', () => {
  const rows = collectSearchRecords({ module: 'Banking', kind: 'Transaction', records: [
    { id: 'out', amount: -50, isDeposit: false },
    { id: 'in', amount: 12, isDeposit: true },
    { id: 'unknown', amount: NaN },
    { id: 'zero', amount: 0, kind: 'payment' },
  ], context: () => ({ id: 'account', label: 'Account', url: '/bank', currencyCode: 'QAR' }) });
  expect(rows[0]).toMatchObject({ amount: -50, nativeKind: 'Withdrawal', currencyCode: 'QAR' });
  expect(rows[1]).toMatchObject({ amount: 12, nativeKind: 'Deposit' });
  expect(rows[2].amount).toBeUndefined();
  expect(rows[3]).toMatchObject({ amount: 0, nativeKind: 'payment' });
});
