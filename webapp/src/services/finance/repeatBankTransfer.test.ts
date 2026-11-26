import { describe, expect, it } from 'vitest';
import type { InterEntityTransfer } from '../../types/interEntityTransfer';
import { suggestRepeatBankTransfer } from './repeatBankTransfer';

function transfer(date: string, to = 'ubl'): InterEntityTransfer {
  return { id: date, date, from: { module: 'bank', ref: 'qib' }, to: { module: 'bank', ref: to },
    fromRecordId: 'from', toRecordId: 'to', fromAmount: 100, toAmount: 7590, categoryID: 'transfer', rateSource: 'Doha Exchange' };
}

describe('repeat bank transfer', () => {
  it('suggests the frequent direction and latest source without carrying financial amounts', () => {
    const links = [transfer('2026-10-01'), transfer('2026-11-01'), transfer('2026-11-26', 'other')];
    expect(suggestRepeatBankTransfer(links, 'qib', new Set(['qib', 'ubl', 'other']))).toEqual({
      direction: 'out', otherAccountId: 'ubl', categoryID: 'transfer', rateSource: 'Doha Exchange',
    });
  });
  it('skips disabled accounts and one-off routes', () => {
    const links = [transfer('2026-10-01'), transfer('2026-11-01'), transfer('2026-11-26', 'other')];
    expect(suggestRepeatBankTransfer(links, 'qib', new Set(['qib', 'other']))).toBeUndefined();
  });
});
