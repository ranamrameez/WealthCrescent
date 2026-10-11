import { describe, expect, it } from 'vitest';
import { combinedQsePrices, qatarDay } from '../qsePrices';
describe('Shared QSE and manual observations', () => {
  it('retains both sources and reported bounds without mutating private history', () => {
    const manual=[{date:'2026-10-11',time:'2026-10-11T09:00:00Z',price:11}];
    const shared={key:{date:'2026-10-11',time:'2026-10-11T09:00:00Z',price:11,dayHigh:13,dayLow:9}};
    const rows=combinedQsePrices(shared,manual,'2026-10-11','2026-10-11');
    expect(rows).toHaveLength(2);expect(new Set(rows.map(p=>p.source))).toEqual(new Set(['manual','shared']));
    expect(rows.find(p=>p.source==='shared')?.dayHigh).toBe(13);
    expect(manual[0]).not.toHaveProperty('source');expect(shared.key).not.toHaveProperty('source');
  });
  it('uses Qatar dates at midnight and excludes invalid prices and other days', () => {
    expect(qatarDay('2026-10-10T21:00:00Z')).toBe('2026-10-11');
    const rows=combinedQsePrices({key:{date:'2026-10-10',time:'2026-10-10T21:00:00Z',price:12}},[{date:'2026-10-10',price:5},{date:'2026-10-11',price:0}],'2026-10-11','2026-10-11');
    expect(rows).toHaveLength(1);expect(rows[0].date).toBe('2026-10-11');
  });
});
