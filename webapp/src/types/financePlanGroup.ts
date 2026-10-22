/** A named financial goal holding independently dated payments across finance modules. */
export interface FinancePlanGroup {
  id: string;
  name: string;
  notes?: string;
  createdAt: string;
}
