export async function getChartFavourites() {
  const { chartFavourites } = await chrome.storage.local.get('chartFavourites');
  return [...new Set((Array.isArray(chartFavourites) ? chartFavourites : []).filter(ticker => /^[A-Z][A-Z0-9]{1,5}$/.test(ticker)))].sort();
}

export async function setChartFavourites(tickers) {
  await chrome.storage.local.set({ chartFavourites: [...new Set(tickers)].sort() });
}
