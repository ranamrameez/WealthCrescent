import type { Subscription } from '../../types/subscriptionsWorkbook';
import { UNCATEGORIZED_ID } from '../categories';
import { generateRenewalOccurrences } from './subscriptionsModule';

export interface SubscriptionPaymentCandidate {
  module: 'cash' | 'bank' | 'creditCard';
  sourceId: string;
  recordId: string;
  description: string;
  date: string;
  amount: number;
  currencyCode: string;
  categoryId?: string;
  categoryName?: string;
  linkedSubscriptionId?: string;
  isPending?: boolean;
}

const DAY = 86400000;
const WINDOW_DAYS = 3;
const GENERIC_WORDS = new Set(['card', 'mobile', 'payment', 'phone', 'recharge', 'renewal', 'sim', 'subscription', 'topup']);
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().trim();
const words = (value: string) => normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [];

function identifiers(value: string) {
  const text = normalize(value);
  return {
    masked: [...text.matchAll(/(?:[x*•]{2,}\s*(\d{4,8})\b|\[\s*(\d{4,8})\s*\])/gu)].map(match => match[1] ?? match[2]),
    full: text.match(/\b\d{7,15}\b/g) ?? [],
  };
}

function sharedIdentifier(left: ReturnType<typeof identifiers>, right: ReturnType<typeof identifiers>) {
  return left.masked.some(mask => right.masked.includes(mask) || right.full.some(full => full.endsWith(mask))) ||
    right.masked.some(mask => left.full.some(full => full.endsWith(mask))) ||
    left.full.some(full => right.full.includes(full));
}

/** Ranks review candidates only. Callers own native transaction validation and any approved writes. */
export function suggestSubscriptionLinks(payment: SubscriptionPaymentCandidate, subscriptions: Subscription[]) {
  const instant = Date.parse(payment.date + 'T00:00:00Z');
  if (payment.isPending || payment.linkedSubscriptionId || !Number.isFinite(instant) ||
      new Date(instant).toISOString().slice(0, 10) !== payment.date ||
      !Number.isFinite(payment.amount) || payment.amount <= 0) return [];
  const paymentWords = new Set(words(payment.description));
  const paymentIds = identifiers(payment.description);
  const windowStart = new Date(instant - WINDOW_DAYS * DAY);
  const windowEnd = new Date(instant + WINDOW_DAYS * DAY).toISOString().slice(0, 10);

  return subscriptions.flatMap(subscription => {
    if (!subscription.active || subscription.currencyCode !== payment.currencyCode ||
        !Number.isFinite(subscription.amount) || subscription.amount <= 0) return [];
    const due = generateRenewalOccurrences(subscription, windowStart)
      .filter(occurrence => occurrence.date <= windowEnd)
      .map(occurrence => ({ ...occurrence, distance: Math.abs(Date.parse(occurrence.date) - instant) / DAY }))
      .sort((a, b) => a.distance - b.distance || a.date.localeCompare(b.date))[0];
    if (!due) return [];

    const sameIdentifier = sharedIdentifier(paymentIds, identifiers(subscription.name));
    const nameWords = words(subscription.name).filter(word => /^\p{L}[\p{L}\p{N}]{3,}$/u.test(word) && !GENERIC_WORDS.has(word));
    const nameMatch = nameWords.length > 0 && nameWords.every(word => paymentWords.has(word));
    const sameCategory = payment.categoryId && subscription.categoryID
      ? payment.categoryId !== UNCATEGORIZED_ID && payment.categoryId === subscription.categoryID
      : !!payment.categoryName && !!subscription.category && normalize(payment.categoryName) !== 'uncategorized' &&
        normalize(payment.categoryName) === normalize(subscription.category);
    const sameAmount = Math.round(payment.amount * 100) === Math.round(due.amount * 100);
    if (!sameIdentifier && !(sameAmount && (nameMatch || sameCategory))) return [];

    const reasons = [
      sameIdentifier && 'Matching identifier', nameMatch && 'Subscription name in description',
      sameCategory && 'Same category', sameAmount && 'Same amount',
    ].filter((reason): reason is string => typeof reason === 'string');
    return [{
      id: JSON.stringify([payment.module, payment.sourceId, payment.recordId, subscription.id, due.date]),
      subscriptionId: subscription.id, occurrenceDate: due.date, reasons,
      score: (sameIdentifier ? 8 : 0) + (nameMatch ? 4 : 0) + (sameCategory ? 2 : 0) + (sameAmount ? 2 : 0) - due.distance,
    }];
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
