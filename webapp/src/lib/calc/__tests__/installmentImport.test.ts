import { expect, it } from 'vitest';
import { previewInstallmentTable, reconcileInstallments } from '../installmentLedger';
const header = ['Payment Desc', 'Due Month', 'Scheduled Amount', 'Payment Date', 'Paid Installment', 'Total Amount', 'Total Paid'];
it('keeps booking, regular and additional major events distinct and imports only positive actual receipts', () => {
  const data = previewInstallmentTable([header,
    ['Booking', '2024-03-23', '200', '2024-03-23', '200', '1000', '550'],
    ['Regular', '2024-04-10', '100', '', '0'],
    ['Major', '2024-04-10', '700', '2024-06-04', '350'],
    ['Sum', '', '1000', '', '550'],
  ], 'PKR');
  expect(data.obligations).toHaveLength(3); expect(data.payments).toHaveLength(2); expect(data.issues).toEqual([]);
  const result = reconcileInstallments(data.obligations, data.payments, 'PKR', '2024-07-01');
  expect(result.actualPaid).toBe(550); expect(result.actualRemaining).toBe(450); expect(result.overdue).toBe(450);
});
it('reads both Excel date systems and rejects the fictional 1900 leap day and ambiguous text dates', () => {
  const table = (date: string) => [['Paid Date', 'Payment Amount'], [date, '100']];
  expect(previewInstallmentTable(table('45374'), 'PKR').payments[0].date).toBe('2024-03-23');
  expect(previewInstallmentTable(table('0'), 'PKR', '1904').payments[0].date).toBe('1904-01-01');
  expect(() => previewInstallmentTable(table('60'), 'PKR')).toThrow('Excel date');
  expect(() => previewInstallmentTable(table('03/04/2025'), 'PKR')).toThrow('YYYY-MM-DD');
});
it('surfaces source summary disagreements and never invents missing payment dates', () => {
  expect(previewInstallmentTable([header, ['Contract', '2026-01-01', '100', '', '0', '200', '100']], 'PKR').issues).toHaveLength(2);
  expect(() => previewInstallmentTable([header, ['Contract', '2026-01-01', '100', '', '10']], 'PKR')).toThrow('Missing actual payment date');
  expect(() => previewInstallmentTable([header, ['Contract', '2026-01-01', '-100', '', '0']], 'PKR')).toThrow('Invalid amount');
});
