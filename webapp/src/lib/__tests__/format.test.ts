import { describe, expect, it } from 'vitest';
import { fmtCompact, fmtMoneyCompact, fmtPrice, fmtQSEPrice, fmtPSXPrice, qsePriceStep } from '../format';

describe('fmtCompact', () => {
  it('leaves numbers under 1000 unabbreviated', () => {
    expect(fmtCompact(842)).toBe('842');
    expect(fmtCompact(0)).toBe('0');
    expect(fmtCompact(-500)).toBe('-500');
  });

  it('abbreviates thousands', () => {
    expect(fmtCompact(10000)).toBe('10k');
    expect(fmtCompact(1500)).toBe('1.5k');
  });

  it('abbreviates millions and billions', () => {
    expect(fmtCompact(1234567)).toBe('1.23M');
    expect(fmtCompact(2_500_000_000)).toBe('2.5B');
  });

  it('preserves sign on negative large numbers', () => {
    expect(fmtCompact(-12345)).toBe('-12.35k');
  });

  it('returns em-dash for null/undefined/NaN', () => {
    expect(fmtCompact(null)).toBe('—');
    expect(fmtCompact(undefined)).toBe('—');
    expect(fmtCompact(NaN)).toBe('—');
  });
});

describe('fmtMoneyCompact', () => {
  it('appends the currency code', () => {
    expect(fmtMoneyCompact(12345678.9, 'PKR')).toBe('12.35M PKR');
    expect(fmtMoneyCompact(500, 'USD')).toBe('500 USD');
  });
});

describe('fmtPrice', () => {
  it('never drops below 2 decimals, even for a 3+ digit price', () => {
    // A plain 4-significant-figure rule alone would round these to 1 or 0
    // decimals, silently losing precision the user actually entered.
    expect(fmtPrice(123.456)).toBe('123.46');
    expect(fmtPrice(1234.5)).toBe('1,235');
  });

  it('keeps 3 decimals for prices under 10, matching typical entry precision', () => {
    expect(fmtPrice(1.2345)).toBe('1.235');
    expect(fmtPrice(2.155)).toBe('2.155');
  });

  it('adds extra decimals for very small (sub-1) prices to stay legible', () => {
    expect(fmtPrice(0.0025)).toBe('0.002500');
  });

  it('returns em-dash for null/undefined/NaN, and a fixed zero string for 0', () => {
    expect(fmtPrice(null)).toBe('—');
    expect(fmtPrice(undefined)).toBe('—');
    expect(fmtPrice(NaN)).toBe('—');
    expect(fmtPrice(0)).toBe('0.000');
  });
});


describe('exchange price precision', () => {
  it('formats QSE quotes to four total price digits', () => {
    expect(fmtQSEPrice(12.123)).toBe('12.12');
    expect(fmtQSEPrice(1.2124)).toBe('1.212');
    expect(fmtQSEPrice(123.456)).toBe('123.5');
  });

  it('caps PSX quotes at two decimal places', () => {
    expect(fmtPSXPrice(12.123)).toBe('12.12');
    expect(fmtPSXPrice(1.2)).toBe('1.2');
    expect(fmtPSXPrice(123.456)).toBe('123.46');
  });
});


describe('QSE four-digit price step', () => {
  it('changes step with price magnitude', () => {
    expect(qsePriceStep(1.212)).toBe(0.001);
    expect(qsePriceStep(12.00)).toBe(0.01);
    expect(qsePriceStep(123.5)).toBe(0.1);
  });
});
