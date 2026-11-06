/** Explicit provenance for a native actual record; never inferred from date/amount. */
export interface PlanLink {
  module: 'cash' | 'bank' | 'creditCard' | 'rentals';
  planId: string;
  occurrenceDate: string;
  groupId?: string;
}
