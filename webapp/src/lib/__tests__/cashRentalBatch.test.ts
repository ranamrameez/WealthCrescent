import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCashBatch, saveRentalBatch } from '../financeBatchEdit';
import { useCashWorkbookStore as cash } from '../../store/cashWorkbookStore';
import { useRentalsWorkbookStore as rentals } from '../../store/rentalsWorkbookStore';
import { useInterEntityTransfersStore as links } from '../../store/interEntityTransfersStore';

const property = { id: 'property', name: 'Apartment', currencyCode: 'QAR' };
beforeEach(() => {
  cash.getState().setWorkbook({ settings: { defaultCurrency: 'QAR' }, entries: [
    { id: 'a', date: '2026-09-01', amount: 20, isDeposit: false, currencyCode: 'QAR', source: 'manual' },
    { id: 'b', date: '2026-09-02', amount: 30, isDeposit: true, currencyCode: 'QAR', source: 'manual' },
  ] });
  rentals.getState().setWorkbook({ settings: { properties: [property] }, entries: [
    { id: 'r', propertyId: property.id, date: '2026-09-01', amount: 100, isDeposit: true },
  ] });
  links.getState().setWorkbook({ settings: {}, entries: [] });
});
describe('Cash and Rentals batch saves', () => {
  it('commits cash once and preserves currency, source and sequence', () => {
    const before = cash.getState().workbook.entries[0];
    const listener = vi.fn();
    const stop = cash.subscribe(listener);
    saveCashBatch('QAR', [{ before, after: { ...before, amount: 42, currencyCode: 'USD', serialNumber: 900 } }]);
    stop();
    expect(listener).toHaveBeenCalledOnce();
    expect(cash.getState().workbook.entries[0]).toEqual({ ...before, amount: 42 });
  });
  it('rejects the entire cash batch when one amount is invalid', () => {
    const [a, b] = cash.getState().workbook.entries;
    const original = cash.getState().workbook;
    expect(() => saveCashBatch('QAR', [{ before: a, after: { ...a, amount: 50 } }, { before: b, after: { ...b, amount: -1 } }])).toThrow();
    expect(cash.getState().workbook).toBe(original);
  });
  it('rejects stale cash drafts', () => {
    const before = cash.getState().workbook.entries[0];
    cash.getState().updateEntry(before.id, { note: 'Changed remotely' });
    expect(() => saveCashBatch('QAR', [{ before, after: { ...before, amount: 90 } }])).toThrow('changed or was removed');
  });
  it('preserves rental ownership while changing income direction', () => {
    const before = rentals.getState().workbook.entries[0];
    saveRentalBatch(property, [{ before, after: { ...before, isDeposit: false, amount: 80, propertyId: 'other' } }]);
    expect(rentals.getState().workbook.entries[0]).toEqual({ ...before, isDeposit: false, amount: 80 });
  });
  it('rejects property currency changes and newly linked records', () => {
    const before = rentals.getState().workbook.entries[0];
    links.getState().addEntry({ id: 'link', from: { module: 'cash' }, to: { module: 'rentals', ref: property.id }, fromRecordId: 'a', toRecordId: 'r', fromAmount: 100, toAmount: 100, date: before.date });
    expect(() => saveRentalBatch(property, [{ before, after: { ...before, amount: 80 } }])).toThrow('Linked transfer');
    rentals.getState().setWorkbook({ ...rentals.getState().workbook, settings: { properties: [{ ...property, currencyCode: 'USD' }] } });
    expect(() => saveRentalBatch(property, [{ before, after: { ...before, amount: 80 } }])).toThrow('Property changed');
  });
});
