// Shared by the scheduled worker and the web app. No Firebase dependencies.
export const PSX_API_ORIGIN = 'https://psxdata-api.fastapicloud.dev';
export const PSX_CACHE_MS = 15 * 60_000;
export const PSX_BASE_PATHS = ['/health', '/stocks', '/sectors', '/screener', '/indices', '/debt-market', '/eligible-scrips'];

export function validPsxPath(path) {
  if (typeof path !== 'string' || path.length > 190) return false;
  try {
    const url = new URL(path, PSX_API_ORIGIN);
    if (url.origin !== PSX_API_ORIGIN || url.hash || !path.startsWith('/')) return false;
    const parts = path.split('?')[0].split('/').slice(1).map(decodeURIComponent);
    if (parts.some(part => !part || part === '.' || part === '..')) return false;
    const symbol = /^[A-Z0-9][A-Z0-9-]{0,15}$/;
    const detail = parts.length === 3 && parts[0] === 'stocks' && symbol.test(parts[1]) && ['quote', 'historical', 'fundamentals'].includes(parts[2]);
    const index = parts.length === 2 && parts[0] === 'indices';
    const sector = parts.length === 3 && parts[0] === 'sectors' && parts[2] === 'stocks';
    if (!(PSX_BASE_PATHS.includes(url.pathname) || detail || index || sector)) return false;
    for (const [key, value] of url.searchParams) {
      if (url.pathname === '/stocks' && key === 'index' && value.length <= 100) continue;
      if (detail && parts[2] === 'historical' && ['start', 'end'].includes(key) && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value) continue;
      return false;
    }
    return true;
  } catch { return false; }
}

export function psxCacheKey(path) {
  if (!validPsxPath(path)) throw new Error('Unsupported PSX dataset.');
  // Firebase-safe, collision-free keys, including sector names containing slashes.
  return Array.from(path).map(char => char.codePointAt(0).toString(16).padStart(4, '0')).join('');
}

export function buildPsxReference(sectors, stocks, screener, updatedAt) {
  if (!Array.isArray(sectors) || !sectors.length || !Array.isArray(stocks) || !stocks.length || !Array.isArray(screener) || !screener.length) throw new Error('Incomplete PSX reference data; existing database values were retained.');
  const result = { sectors: {}, tickerGroups: {}, tickerSectors: {}, symbols: [], updatedAt, source: 'psxdata' };
  for (const sector of sectors) {
    const code = String(Number(sector.sector_code));
    if (!/^\d+$/.test(code) || !sector.sector_name) continue;
    result.sectors[code] = sector;
    result.tickerGroups[code] = [];
  }
  const validSymbol = symbol => typeof symbol === 'string' && /^[A-Z0-9][A-Z0-9-]{0,15}$/.test(symbol);
  result.symbols = [...new Set(stocks.filter(validSymbol))].sort();
  for (const row of screener) {
    const code = row.sector == null ? 'unknown' : String(Number(row.sector));
    if (!validSymbol(row.symbol)) continue;
    const group = result.sectors[code] ? code : 'unknown';
    (result.tickerGroups[group] ??= []).push(row.symbol);
    result.tickerSectors[row.symbol] = group;
  }
  for (const symbol of result.symbols) if (!result.tickerSectors[symbol]) {
    (result.tickerGroups.unknown ??= []).push(symbol);
    result.tickerSectors[symbol] = 'unknown';
  }
  for (const code of Object.keys(result.tickerGroups)) result.tickerGroups[code] = [...new Set(result.tickerGroups[code])].sort();
  if (!Object.keys(result.sectors).length) throw new Error('No valid PSX sectors returned.');
  return result;
}
