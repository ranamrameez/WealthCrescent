export function renderPriceChart(container, rows, ticker, options = {}) {
  const document = container.ownerDocument;
  container.replaceChildren();
  if (!ticker) {
    const tickers = [...new Set(rows.filter(row => Number.isFinite(row.price) && row.capturedAt != null).map(row => row.ticker))].sort();
    if (!tickers.length) { container.textContent = 'No dated prices in the current filters.'; return; }
    const grid = document.createElement('div'); grid.className = 'chart-grid';
    for (const symbol of tickers) {
      const card = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = symbol;
      const chart = document.createElement('div'); card.append(heading, chart); grid.append(card);
      renderPriceChart(chart, rows, symbol, options);
    }
    container.append(grid);
    return;
  }
  const toolbar = document.createElement('div'); toolbar.className = 'chart-toolbar';
  if (options.onFavourite) {
    const favourite = document.createElement('button');
    const active = options.favourites?.has(ticker) || false;
    favourite.className = 'chart-favourite'; favourite.textContent = active ? '★ Favourited' : '☆ Favourite';
    favourite.setAttribute('aria-pressed', String(active)); favourite.setAttribute('aria-label', `${active ? 'Unfavourite' : 'Favourite'} ${ticker}`);
    favourite.onclick = async () => {
      favourite.disabled = true;
      try { await options.onFavourite(ticker); favourite.setAttribute('aria-pressed', String(options.favourites?.has(ticker) || false)); favourite.textContent = options.favourites?.has(ticker) ? '? Favourited' : '? Favourite'; }
      catch (error) { favourite.textContent = error.message; }
      finally { favourite.disabled = false; }
    };
    toolbar.append(favourite);
  }
  const fullscreen = document.createElement('button'); fullscreen.className = 'chart-fullscreen'; fullscreen.textContent = 'Full screen';
  fullscreen.setAttribute('aria-label', `View ${ticker} full screen`);
  fullscreen.onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (container.requestFullscreen) await container.requestFullscreen();
      else throw new Error('Use expanded chart');
      fullscreen.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
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
  const points = rows.filter(row => row.ticker === ticker && Number.isFinite(row.price) && row.capturedAt != null).sort((a, b) => a.capturedAt - b.capturedAt);
  if (!points.length) { const message = document.createElement('p'); message.textContent = 'No dated prices for this ticker in the current filters.'; container.append(message); return; }
  const ns = 'http://www.w3.org/2000/svg';
  const node = (name, attrs, text) => {
    const el = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (text != null) el.textContent = text;
    return el;
  };
  const svg = node('svg', { viewBox: '0 0 1000 320', role: 'img', 'aria-label': `${ticker} price history in Qatar time`, width: '100%' });
  svg.append(node('title', {}, `${ticker}: ${points.length} prices; red markers indicate changes beyond ±10%.`));
  const prices = points.map(point => point.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const padding = (max - min) * .1 || Math.max(max * .02, .01);
  const low = min - padding, high = max + padding;
  const start = points[0].capturedAt, end = points.at(-1).capturedAt;
  const x = point => end === start ? 530 : 80 + (point.capturedAt - start) / (end - start) * 900;
  const y = point => 260 - (point.price - low) / (high - low) * 235;
  for (let index = 0; index <= 4; index++) {
    const value = low + (high - low) * index / 4;
    const height = 260 - index / 4 * 235;
    svg.append(node('line', { x1: 80, y1: height, x2: 980, y2: height, stroke: '#b0bfd0' }));
    svg.append(node('text', { x: 70, y: height + 4, 'text-anchor': 'end', fill: '#17283c', 'font-size': 13 }, value.toFixed(3)));
  }
  svg.append(node('polyline', { points: points.map(point => `${x(point)},${y(point)}`).join(' '), fill: 'none', stroke: '#1d4ed8', 'stroke-width': 2.5 }));
  const date = value => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' });
  for (const point of points) {
    const circle = node('circle', { cx: x(point), cy: y(point), r: point.outlier ? 5 : 3, fill: point.outlier ? '#b91c1c' : '#1d4ed8', tabindex: 0 });
    circle.append(node('title', {}, `${ticker} · ${date(point.capturedAt)} · ${point.price}${point.outlier ? ` · Flag: ${point.deltaPct?.toFixed(2)}%` : ''}`));
    svg.append(circle);
  }
  svg.append(node('text', { x: 80, y: 290, fill: '#17283c', 'font-size': 13 }, date(start)));
  if (end !== start) svg.append(node('text', { x: 980, y: 290, 'text-anchor': 'end', fill: '#17283c', 'font-size': 13 }, date(end)));
  container.append(svg);
}
