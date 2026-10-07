import type { FeeCalculator, Transaction } from '../../types/workbook';
import { computeFIFOPositions } from './fifoPositions';

const results = new WeakMap<Transaction[], WeakMap<FeeCalculator, ReturnType<typeof computeFIFOPositions>>>();

/** All strategy cards share the same immutable history and fee calculator. */
export function strategyPositions(transactions: Transaction[], calcFee: FeeCalculator) {
  let byFee = results.get(transactions);
  if (!byFee) { byFee = new WeakMap(); results.set(transactions, byFee); }
  let result = byFee.get(calcFee);
  if (!result) {
    result = computeFIFOPositions(transactions, calcFee, 'lowestCostFirst');
    byFee.set(calcFee, result);
  }
  return result;
}
