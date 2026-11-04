/**
 * WealthCrescent's single public calculation boundary.
 *
 * UI/features must call application query/command services; those services
 * call this engine. UI code must never import the underlying modules in
 * lib/calc directly. The namespaces below intentionally delegate to the
 * existing tested domain calculators: centralization must not change their
 * accounting semantics or create parallel implementations.
 *
 * This facade is the first migration step. Existing direct imports remain
 * temporarily for compatibility and must be migrated incrementally.
 */
import * as stock from './stockCalculationEngine';
import * as funds from './fundsModule';
import * as portfolio from './portfolioCalculationEngine';
import * as cash from './cashModule';
import * as bank from './bankModule';
import * as creditCards from './creditCardModule';
import * as budgets from './budgetPlanner';
import * as plannedBalances from './plannedBalance';
import * as occurrences from './planOccurrences';
import * as upcoming from './upcoming';
import * as netWorth from './netWorth';
import * as netWorthAsOf from './netWorthAsOf';
import * as netWorthTrend from './netWorthTrend';
import * as emi from './emiModule';
import * as rentals from './rentalPlanning';
import * as subscriptions from './subscriptionsModule';
import * as recurrence from './recurrence';
import * as planning from './planningReadModel';

/**
 * Stable domain-oriented API. Keep all financial calculation entry points
 * discoverable here; implementation files are private details and may be
 * reorganized without changing consumers of the engine contract.
 */
export const CalculationEngine = Object.freeze({
  stock,
  portfolio,
  funds,
  cash,
  bank,
  creditCards,
  budgets,
  plannedBalances,
  occurrences,
  upcoming,
  netWorth,
  netWorthAsOf,
  netWorthTrend,
  emi,
  rentals,
  subscriptions,
  recurrence,
  planning,
});

export type CalculationEngineApi = typeof CalculationEngine;
