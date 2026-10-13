export function renderPriceChart(container, rows, ticker, options = {}) {
  const document = container.ownerDocument;
  container.replaceChildren();
  if (!ticker) {
    const tickers = [...new Set(rows.filter(row => Number.isFinite(row.price) && Number.isFinite(row.capturedAt)).map(row => row.ticker))].sort();
    if (!tickers.length) { container.textContent = 'No dated prices in the current filters.'; return; }
    const grid = document.createElement('div'); grid.className = 'chart-grid';
    let shown = 0;
    const more = document.createElement('button'); more.textContent = 'Show more ticker charts';
    const status = document.createElement('p'); status.className = 'muted';
    const appendNext = () => {
    for (const symbol of tickers.slice(shown, shown + 6)) {
      const card = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = symbol;
      const chart = document.createElement('div'); card.append(chart); grid.append(card);
      renderPriceChart(chart, rows, symbol, options);
    }
    shown = Math.min(tickers.length, shown + 6); status.textContent = `Showing ${shown} of ${tickers.length} ticker charts. Choose a chart ticker to focus on one.`; more.hidden = shown >= tickers.length;
    };
    more.onclick = appendNext; appendNext(); container.append(status, grid, more);
    return;
  }
  const toolbar = document.createElement('div'); toolbar.className = 'chart-toolbar'; const chartTitle = document.createElement('h3'); chartTitle.textContent = ticker; toolbar.append(chartTitle);
  if (options.onFavourite) {
    const favourite = document.createElement('button');
    const active = options.favourites?.has(ticker) || false;
    favourite.className = 'chart-favourite'; favourite.textContent = active ? '\u2605' : '\u2606';
    favourite.setAttribute('aria-pressed', String(active)); favourite.setAttribute('aria-label', `${active ? 'Unfavourite' : 'Favourite'} ${ticker}`);
    favourite.onclick = async () => {
      favourite.disabled = true;
      try { await options.onFavourite(ticker); favourite.setAttribute('aria-pressed', String(options.favourites?.has(ticker) || false)); favourite.textContent = options.favourites?.has(ticker) ? '\u2605' : '\u2606'; favourite.setAttribute('aria-label', (options.favourites?.has(ticker) ? 'Unfavourite' : 'Favourite') + ' ' + ticker); }
      catch (error) { favourite.textContent = error.message; }
      finally { favourite.disabled = false; }
    };
    toolbar.append(favourite);
  }
  const fullscreen = document.createElement('button'); fullscreen.className = 'chart-fullscreen'; fullscreen.textContent = '\u26f6';
  fullscreen.setAttribute('aria-label', `View ${ticker} full screen`);
  fullscreen.onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (container.requestFullscreen) await container.requestFullscreen();
      else throw new Error('Use expanded chart');
      fullscreen.textContent = document.fullscreenElement ? '\u2715' : '\u26f6';
    } catch {
      const dialog = document.createElement('dialog'); dialog.className = 'chart-dialog';
      const close = document.createElement('button'); close.textContent = 'Close'; close.onclick = () => dialog.close();
      const heading = document.createElement('h2'); heading.textContent = ticker;
      const chart = document.createElement('div'); dialog.append(close, heading, chart); document.body.append(dialog);
      renderPriceChart(chart, rows, ticker);
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      dialog.showModal();
    }
  };
  toolbar.append(fullscreen); container.append(toolbar);
  const allPoints = rows.filter(row => row.ticker === ticker && Number.isFinite(row.price) && Number.isFinite(row.capturedAt)).sort((a, b) => a.capturedAt - b.capturedAt);
  const dailyLast = new Map(); for (const point of allPoints) if (Number.isFinite(point.dayHigh) && Number.isFinite(point.dayLow)) dailyLast.set(new Date(point.capturedAt + 3 * 60 * 60 * 1000).toISOString().slice(0,10), point);
  const points = [...new Set([...sampleChartPoints(allPoints), ...dailyLast.values()])].sort((a,b) => a.capturedAt - b.capturedAt);
  if (allPoints.length > points.length) { const note = document.createElement('p'); note.className = 'muted'; note.textContent = `Showing ${points.length} of ${allPoints.length} samples. The records table retains all observations.`; container.append(note); }
  if (!points.length) { const message = document.createElement('p'); message.textContent = 'No dated prices for this ticker in the current filters.'; container.append(message); return; }
  const ns = 'http://www.w3.org/2000/svg';
  const node = (name, attrs, text) => {
    const el = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (text != null) el.textContent = text;
    return el;
  };
  const svg = node('svg', { viewBox: '0 0 640 320', role: 'img', 'aria-label': `${ticker} price history in Qatar time`, width: '100%' });
  svg.append(node('title', {}, `${ticker}: ${points.length} prices; red markers indicate changes beyond ±10%.`));
  const prices = points.flatMap(point => [point.price, point.dayHigh, point.dayLow].filter(Number.isFinite));
  const min = prices.reduce((value, price) => Math.min(value, price), Infinity), max = prices.reduce((value, price) => Math.max(value, price), -Infinity);
  const padding = (max - min) * .1 || Math.max(max * .02, .01);
  const low = min - padding, high = max + padding;
  const start = points[0].capturedAt, end = points.at(-1).capturedAt;
  const x = point => end === start ? 345 : 70 + (point.capturedAt - start) / (end - start) * 550;
  const y = point => 260 - (point.price - low) / (high - low) * 235;
  for (let index = 0; index <= 4; index++) {
    const value = low + (high - low) * index / 4;
    const height = 260 - index / 4 * 235;
    svg.append(node('line', { x1: 70, y1: height, x2: 620, y2: height, stroke: '#b0bfd0' }));
    svg.append(node('text', { x: 60, y: height + 4, 'text-anchor': 'end', fill: '#17283c', 'font-size': 13 }, value.toFixed(3)));
  }
  svg.append(node('polyline', { points: points.map(point => `${x(point)},${y(point)}`).join(' '), fill: 'none', stroke: '#1d4ed8', 'stroke-width': 2.5 }));
  const date = value => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' });
  const ranges = new Set(dailyLast.values());
  for (const point of points) {
    if (ranges.has(point)) {
      const range = node('g', { 'data-role': 'daily-range', tabindex: 0 });
      range.append(node('title', {}, `Reported day high: ${point.dayHigh}; day low: ${point.dayLow}; captured ${date(point.capturedAt)}. Extrema time unknown.`));
      range.append(node('line', { x1: x(point), x2: x(point), y1: y({ price: point.dayHigh }), y2: y({ price: point.dayLow }), stroke: '#047857', 'stroke-width': 2, opacity: .65 }));
      for (const value of [point.dayHigh, point.dayLow]) range.append(node('line', { x1: x(point) - 5, x2: x(point) + 5, y1: y({ price: value }), y2: y({ price: value }), stroke: '#047857', 'stroke-width': 2 }));
      svg.append(range);
    }
    const circle = node('circle', { cx: x(point), cy: y(point), r: point.outlier ? 5 : 3, fill: point.outlier ? '#b91c1c' : '#1d4ed8', tabindex: 0 });
    circle.append(node('title', {}, `${ticker} · ${date(point.capturedAt)} · ${point.price}${point.outlier ? ` · Flag: ${point.outlierDeltaPct?.toFixed(2)}% from reference median ${point.referencePrice} (${point.referenceCount} prices)` : ''}`));
    svg.append(circle);
  }
  svg.append(node('text', { x: 70, y: 290, fill: '#17283c', 'font-size': 13 }, date(start)));
  if (end !== start) svg.append(node('text', { x: 620, y: 290, 'text-anchor': 'end', fill: '#17283c', 'font-size': 13 }, date(end)));
  container.append(svg);
  if (points.some(point => Number.isFinite(point.dayHigh) && Number.isFinite(point.dayLow))) {
    const legend = document.createElement('div'); legend.className = 'chart-legend';
    for (const [kind,label,tip] of [['price','Sampled price','Prices observed at the plotted timestamps'],['range','Reported daily range','Latest reported daily high and low for each day; the times of the extrema are unknown'],['outlier','Flagged price','Price flagged by consensus outlier detection']]) { const item = document.createElement('span'); item.className = 'legend-item legend-' + kind; item.textContent = label; item.title = tip; legend.append(item); }
    container.append(legend);
  }
}

export function sampleChartPoints(points, limit = 500) {
  if (points.length <= limit) return points;
  const selected = new Set([points[0], points.at(-1)]);
  const buckets = Math.floor((limit - 2) / 3);
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = Math.floor(bucket * points.length / buckets), end = Math.floor((bucket + 1) * points.length / buckets);
    let low = points[start], high = low, flagged = null;
    for (let index = start; index < end; index++) { const point = points[index]; if (point.price < low.price) low = point; if (point.price > high.price) high = point; if (point.outlier && !flagged) flagged = point; }
    selected.add(low); selected.add(high); if (flagged) selected.add(flagged);
  }
  return [...selected].sort((a, b) => a.capturedAt - b.capturedAt);
}
