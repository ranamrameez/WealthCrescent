type CashCurrencyRecord = { currencyCode: string };

export function listCashCurrencies(defaultCurrency: string, entries: CashCurrencyRecord[], plans: CashCurrencyRecord[]) {
  return [...new Set([defaultCurrency, ...entries.map(row => row.currencyCode), ...plans.map(row => row.currencyCode)])]
    .filter(Boolean)
    .sort();
}

export function cashCurrencyLocation(currency: string, search = '') {
  const params = new URLSearchParams(search);
  params.delete('entities');
  return { pathname: '/cash/' + encodeURIComponent(currency), search: params.toString() };
}
