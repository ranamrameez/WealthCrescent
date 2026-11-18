import type { PlanReference } from './financePlanModel';

/** Account isolation comes from the owning workbook. */
export function planOccurrenceRecordId(reference: PlanReference, date: string): string {
  return `plan:${reference.module}:${encodeURIComponent(reference.id)}:${date}`;
}
