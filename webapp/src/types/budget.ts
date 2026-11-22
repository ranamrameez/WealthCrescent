export interface BudgetDefinition {
  id: string; name: string; currencyCode: string; monthlyLimit: number;
  startMonth: string; endMonth?: string;
  monthlyLimits?: Record<string,number>;
  categoryIds?: string[]; planGroupId?: string;
  rollover: 'none' | 'surplus' | 'balance';
}
export interface BudgetAllocation {
  id: string; budgetId: string; recordKey: string;
  /** Positive allocates an outflow; negative explicitly identifies a refund. */
  amount: number;
}
