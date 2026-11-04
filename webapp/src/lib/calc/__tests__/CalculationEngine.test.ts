import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../CalculationEngine';
import { calculatePortfolio } from '../portfolioCalculationEngine';
import { calculateStockPortfolio } from '../stockCalculationEngine';
import { collectBudgetActivities } from '../budgetPlanner';
import { collectUpcomingItems } from '../upcoming';

describe('CalculationEngine public boundary', () => {
  it('delegates stock and portfolio calculations to the existing stock accounting implementation', () => {
    expect(CalculationEngine.stock.calculateStockPortfolio).toBe(calculateStockPortfolio);
    expect(CalculationEngine.portfolio.calculatePortfolio).toBe(calculatePortfolio);
  });

  it('exposes the existing unified planning and upcoming calculations without cloning their logic', () => {
    expect(CalculationEngine.budgets.collectBudgetActivities).toBe(collectBudgetActivities);
    expect(CalculationEngine.upcoming.collectUpcomingItems).toBe(collectUpcomingItems);
  });
});
