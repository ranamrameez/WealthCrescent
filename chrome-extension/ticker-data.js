// Compact extrema summaries include sampled prices and reported daily ranges.
export function mergeBounds(previous, point) {
  const values = [point.price, point.dayHigh, point.dayLow].filter(value => Number.isFinite(value) && value > 0);
  if (!values.length) return previous || null;
  const low = Math.min(...values), high = Math.max(...values);
  return { low: Math.min(previous?.low ?? low, low), high: Math.max(previous?.high ?? high, high), updatedAt: point.time };
}
export function tickerProjection(history) {
  const allPrices = {}, dayToDayBounds = {};
  let allTimeBounds = null, latest = null;
  for (const [key, point] of Object.entries(history || {}).filter(([,p]) => p && Number.isFinite(p.price)).sort((a,b) => String(a[1].time || a[1].date).localeCompare(String(b[1].time || b[1].date)))) {
    allPrices[key] = point;
    let date = /^\d{4}-\d{2}-\d{2}$/.test(point.date || '') ? point.date : null;
    if (Number.isFinite(Date.parse(point.time))) {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date(point.time));
      const part = type => parts.find(value => value.type === type).value;
      date = part('year') + '-' + part('month') + '-' + part('day');
    }
    if (date) dayToDayBounds[date] = mergeBounds(dayToDayBounds[date], point);
    allTimeBounds = mergeBounds(allTimeBounds, point); latest = point;
  }
  return { allPrices, dayToDayBounds, allTimeBounds, latest };
}
