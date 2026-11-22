export interface FxRates {
  /** All rates are expressed as 1 unit of `base` = rates[code] units of
   * that currency. */
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
  source: 'api' | 'manual';
}


export function convertAmount(amount: number, from: string, to: string, rates: FxRates | null): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  if (!rates) return null;
  const fromRate = from === rates.base ? 1 : rates.rates[from];
  const toRate = to === rates.base ? 1 : rates.rates[to];
  if (typeof fromRate !== 'number' || typeof toRate !== 'number' || !Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return null;
  const amountInBase = amount / fromRate;
  const converted = amountInBase * toRate;
  return Number.isFinite(converted) ? converted : null;
}

export function effectiveRate(from: string, to: string, rates: FxRates | null): number | null {
  if (from === to) return 1;
  if (!rates) return null;
  const fromRate = from === rates.base ? 1 : rates.rates[from];
  const toRate = to === rates.base ? 1 : rates.rates[to];
  if (typeof fromRate !== 'number' || typeof toRate !== 'number' || !Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return null;
  const value = toRate / fromRate;
  return Number.isFinite(value) && value > 0 ? value : null;
}
