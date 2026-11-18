import type { PlanLink } from '../../types/planLink';
import type { PlanReference } from './financePlanModel';

/** Account isolation comes from the owning workbook. */
export function planOccurrenceRecordId(reference: PlanReference, date: string): string {
  return `plan:${reference.module}:${encodeURIComponent(reference.id)}:${date}`;
}

export function pendingOccurrenceKey(source: string, planId: string, date: string) {
  return JSON.stringify([source, planId, date]);
}

export function pendingOccurrenceKeys<T extends { isPending?: boolean; planLink?: PlanLink }>(
  records: T[], module: 'cash' | 'bank', source: (record: T) => string,
) {
  return new Set(records.flatMap(record => {
    const link = record.planLink;
    return record.isPending && link?.module === module
      ? [pendingOccurrenceKey(source(record), link.planId, link.occurrenceDate)]
      : [];
  }));
}
