tradingToolReady.then(() => {
const healthTiers = [
  { label: '1. Superb', zone: 'green', rule: 'Price growth, manageable debt, and recurring dividends.' },
  { label: '2. Price Grower / Low Dividend', zone: 'green', rule: 'Healthy balance sheet and earnings, with annual or semiannual payouts.' },
  { label: '3. Cyclical / Event Dividend', zone: 'watch', rule: 'Irregular dividends and catalyst-driven trades.' },
  { label: '4. Non-Dividend Liquid', zone: 'grey', rule: 'Liquid short swings or intraday trades with no dividend cushion.' },
  { label: '5. Caution Daily Only', zone: 'caution', rule: 'High leverage, same-day exit, and a hard stop-loss.' },
  { label: 'Red Zone / Exit-Only', zone: 'red', rule: 'Avoid new positions in heavily indebted, declining, or illiquid stocks.' },
];
const tradeGroups = ['Long Hold', 'Hybrid Swing', 'Intraday / Short Swing', 'Exit-Only'];
const commissionPerLeg = price => Math.max(0.03, price * 0.0015);
const feeRates = { intraday: [1, 0.0003, 0.0004], multiDay: [2, 0.0006, 0.001] };

const stocks = [
  ['GHGL', 'Ghani Glass Limited', 40.35, 27.10, 43.80, 0, 1, true, '38.00–44.50', '3–4×/yr (~9.9% yield)', 'Low debt', 'Glass producer with +57% Q1 FY27 profit in the supplied snapshot.'],
  ['DCR', 'Dolmen City REIT', 39.37, 24.50, 41.98, 0, 0, true, '37.50–42.50', 'Quarterly (~6.8% yield)', 'Very low · debt-free REIT', 'Jan, Apr, Jul and Oct payout cycle.'],
  ['OGDC', 'Oil & Gas Development Co.', 312.73, 243.90, 352.00, 0, 1, true, 'Buy 305–315 · Sell 330–345', 'Quarterly (PKR 18.50)', 'Low · cash rich', 'Swing tranches accumulated at PKR 305–319, with Oct and Nov 2026 dividend eligibility in the supplied notes.', true],
  ['MARI', 'Mari Energies Limited', 730, 510, 795, 0, 0, true, '705–775', 'Semiannual (Feb / Aug)', 'Low · virtually debt-free', '11 shares at PKR 730. Position notes target an E&P swing bounce above PKR 740–755.', true],
  ['FCCL', 'Fauji Cement Company Ltd.', 59.22, 41.20, 64.50, 1, 1, true, '56.50–63.00', 'Annual (Sep / Oct)', 'Low to moderate · early debt repayment', 'Cement swing candidate with a supplied intraday range of PKR 0.80–1.50.'],
  ['ILP', 'Interloop Limited', 101.58, 68, 108.90, 1, 1, true, '96.00–108.00', 'Semiannual (~3.9% yield)', 'Low to moderate', 'Textile exporter with +33% one-year price growth in the supplied snapshot.'],
  ['LOTCHEM', 'Noventra Limited (Lotte Chem)', 24.65, 18.41, 34.30, 2, 2, true, '23.40–27.50', 'Irregular (PKR 6.50 in CY26)', 'Moderate to high', 'Watch EPCL acquisition and ex-dividend announcements.'],
  ['PRL', 'Pakistan Refinery Limited', 82.36, 52, 91.40, 3, 2, true, '78.50–86.00', 'None / rare', 'Moderate · capex cycle', 'High-volume refinery with wide intraday swings.'],
  ['SEARL', 'The Searle Company Ltd.', 79.18, 58.20, 88.50, 3, 2, true, '76.50–82.50', 'None / bonus-focused', 'Moderate · deleveraging', 'Watch technical ranges for short swings.'],
  ['TREET', 'Treet Corporation Limited', 26.13, 19.55, 37, 4, 2, true, '25.20–27.40', 'None', 'High short-term debt', 'Same-day exit with a hard stop-loss.'],
  ['PAEL', 'Pak Elektron Limited', 34.88, 31.50, 64.60, 4, 2, false, 'Support 33.50 · Resistance 36.50', 'None', 'High working-capital debt', 'Same-day trade framework.'],
  ['HUMNL', 'Hum Network Limited', 7.99, 7.91, 17.10, 5, 3, false, 'GTC exit 8.55–8.65', 'At risk · Q1 FY27 loss', 'Severe · earnings decline', '3,700 shares at PKR 8.58. The supplied profile estimates PKR 8.15 net breakeven after a PKR 0.50/share dividend.', true],
  ['SSGC', 'Sui Southern Gas Co.', 23.51, 18.20, 39.80, 5, 3, true, 'Avoid new allocation', 'None', 'Extreme · PKR 935.7B liabilities in the supplied profile', 'Red zone due to liabilities and declining earnings.'],
].map(([ticker, name, price, low, high, health, trade, shariah, fair, dividends, risk, note, held = false]) =>
  ({ ticker, name, price, low, high, health, trade, shariah, fair, dividends, risk, note, held }));

// These pairs are ending share value and gross cash dividends in PKR.
const returns = {
  fiveYears: [
    ['OGDC', 372741, 72944], ['LOTCHEM', 234762, 152381], ['GHGL', 215000, 84500],
    ['DCR', 242000, 68200], ['FCCL', 296000, 22500], ['ILP', 248000, 34000],
  ],
  sinceJuly: [
    ['OGDC', 237150, 31129], ['LOTCHEM', 140857, 37143], ['GHGL', 146500, 18000],
    ['DCR', 154400, 16800], ['FCCL', 152000, 6000], ['ILP', 139000, 7500],
  ],
};
const money = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
const priceText = price => price.toFixed(2);
function breakEven(price, [legs, minOther, maxOther]) {
  const commission = legs * commissionPerLeg(price);
  const roundUp = cost => Math.ceil(cost * 100 - 1e-8) / 100;
  return [roundUp(commission + price * minOther), roundUp(commission + price * maxOther)];
}
const rangeText = ([low, high]) => low === high ? priceText(low) : `${priceText(low)}–${priceText(high)}`;
const moveText = (price, rates) => `+PKR ${rangeText(breakEven(price, rates))}`;
const exitText = (price, rates) => `PKR ${rangeText(breakEven(price, rates).map(move => price + move))} (${moveText(price, rates)})`;
// Band limits are in paisa so adjacent bands cover every PKR 0.01 step exactly once.
const feeBandEnds = [5000, ...Array.from({ length: 15 }, (_, index) => (index + 1) * 10000)];

function intradayBreakpoints(start, end) {
  const points = [];
  let [previousLow, previousHigh] = breakEven((start - 1) / 100, feeRates.intraday);
  for (let cents = start; cents <= end; cents++) {
    const [low, high] = breakEven(cents / 100, feeRates.intraday);
    if (cents === 1 || low !== previousLow || high !== previousHigh) points.push(cents);
    previousLow = low;
    previousHigh = high;
  }
  return points;
}

function createFeeBand(start, end) {
  const band = document.createElement('section');
  band.className = 'fee-band';
  const name = `PKR ${priceText(start / 100)}–${priceText(end / 100)}`;
  const points = intradayBreakpoints(start, end);
  band.innerHTML = `
    <h3>${name}</h3>
    <label>Entry price (PKR)
      <input type="number" min="${start / 100}" max="${end / 100}" step="0.01" value="${priceText(start / 100)}">
    </label>
    <input type="range" min="${start}" max="${end}" step="1" value="${start}" aria-label="Entry price, ${name}">
    <span class="fee-ticks" aria-hidden="true">${points.map(cents =>
      `<i style="left:${(cents - start) / (end - start) * 100}%"></i>`).join('')}</span>
    <div class="fee-endpoints"><small>${priceText(start / 100)}</small><small>${priceText(end / 100)}</small></div>
    <output class="fee-result"></output>
    <details>
      <summary>Intraday tick labels (${points.length})</summary>
      <ul class="fee-breakpoints">${points.map(cents => `
        <li><button type="button" data-price="${cents}">PKR ${priceText(cents / 100)} · ${moveText(cents / 100, feeRates.intraday)}</button></li>`).join('')}
      </ul>
    </details>`;
  const slider = band.querySelector('input[type="range"]');
  const entry = band.querySelector('input[type="number"]');
  const result = band.querySelector('output');

  function update(cents, syncEntry = true) {
    const price = cents / 100;
    slider.value = cents;
    slider.setAttribute('aria-valuetext', `PKR ${priceText(price)}`);
    if (syncEntry) entry.value = priceText(price);
    result.innerHTML = `<span>Intraday sell price · <strong>${exitText(price, feeRates.intraday)}</strong></span>
      <span>Multi-day sell price · <strong>${exitText(price, feeRates.multiDay)}</strong></span>`;
  }

  slider.addEventListener('input', () => update(Number(slider.value)));
  entry.addEventListener('input', () => {
    if (entry.value && entry.validity.valid) update(Math.round(entry.valueAsNumber * 100), false);
  });
  entry.addEventListener('change', () => {
    const value = entry.valueAsNumber;
    update(Number.isFinite(value) ? Math.min(end, Math.max(start, Math.round(value * 100))) : Number(slider.value));
  });
  band.querySelector('.fee-breakpoints').addEventListener('click', event => {
    const point = event.target.closest('button[data-price]');
    if (point) update(Number(point.dataset.price));
  });
  update(start);
  return band;
}

const feeBars = document.querySelector('#fee-bars');
feeBars.append(...feeBandEnds.map((end, index) => createFeeBand((feeBandEnds[index - 1] ?? 0) + 1, end)));

const priceTier = price => {
  if (price < 35) return 'Sub-PKR 35';
  if (price <= 105) return 'PKR 35–105';
  if (price < 300) return 'Above PKR 105 to under PKR 300';
  return 'PKR 300+';
};

const watchlist = document.querySelector('#watchlist');
const groupSelect = document.querySelector('#group');
const zoneButtons = [...document.querySelectorAll('[data-zone]')];
let zone = 'all';
let pinned = null;

function showProfile(tile, visible) {
  tile.querySelector('.stock-profile').hidden = !visible;
  tile.querySelector('button').setAttribute('aria-expanded', String(visible));
}

function renderWatchlist() {
  pinned = null;
  const groups = new Map();
  const groupBy = {
    health: stock => healthTiers[stock.health].label,
    trade: stock => tradeGroups[stock.trade],
    price: stock => priceTier(stock.price),
  }[groupSelect.value];
  for (const stock of stocks) {
    if (zone !== 'all' && zone !== healthTiers[stock.health].zone) continue;
    const label = groupBy(stock);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(stock);
  }
  watchlist.replaceChildren();
  for (const [label, entries] of groups) {
    const section = document.createElement('section');
    section.className = 'watch-group';
    const heading = document.createElement('h2');
    heading.textContent = label;
    const grid = document.createElement('div');
    grid.className = 'tile-grid';
    grid.append(...entries.map(createTile));
    section.append(heading, grid);
    watchlist.append(section);
  }
}

function createTile(stock) {
  const tier = healthTiers[stock.health];
  const range = Math.min(100, Math.max(0, (stock.price - stock.low) / (stock.high - stock.low) * 100));
  const tile = document.createElement('article');
  tile.className = 'tile';
  tile.dataset.tone = tier.zone;
  // Stock content comes from the fixed November 2026 snapshot above.
  tile.innerHTML = `
    <button class="tile-button" type="button" aria-expanded="false" aria-controls="stock-${stock.ticker}">
      <span class="tile-line"><strong class="ticker">${stock.ticker}</strong><strong>PKR ${priceText(stock.price)}</strong></span>
      <small>${stock.name}${stock.shariah ? ' · Shariah' : ''}${stock.held ? ' · Held' : ''}</small>
      <span class="tile-line"><small>52W ${priceText(stock.low)}–${priceText(stock.high)}</small></span>
      <span class="tile-line"><small>Intraday ${moveText(stock.price, feeRates.intraday)}</small><small>Multi-day ${moveText(stock.price, feeRates.multiDay)}</small></span>
      <progress class="range" value="${range}" max="100" aria-label="Position in 52-week range"></progress>
      <span class="tile-line"><small class="health">${tier.label}</small><small>${tradeGroups[stock.trade]}</small></span>
    </button>
    <div class="stock-profile" id="stock-${stock.ticker}" hidden>
      <dl>
        <dt>Intraday break-even sell price</dt><dd>${exitText(stock.price, feeRates.intraday)}</dd>
        <dt>Multi-day break-even sell price</dt><dd>${exitText(stock.price, feeRates.multiDay)}</dd>
        <dt>Fair buy / sell range (PKR)</dt><dd>${stock.fair}</dd>
        <dt>Dividend cycle</dt><dd>${stock.dividends}</dd>
        <dt>Debt and risk</dt><dd>${stock.risk}</dd>
      </dl>
      <p>${stock.note}</p>
    </div>`;
  tile.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' && !pinned) showProfile(tile, true);
  });
  tile.addEventListener('pointerleave', () => {
    if (pinned !== tile) showProfile(tile, false);
  });
  tile.querySelector('button').addEventListener('click', () => {
    if (pinned) showProfile(pinned, false);
    pinned = pinned === tile ? null : tile;
    showProfile(tile, pinned === tile);
  });
  return tile;
}

document.addEventListener('click', event => {
  if (pinned && !pinned.contains(event.target)) {
    showProfile(pinned, false);
    pinned = null;
  }
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  watchlist.querySelectorAll('.tile').forEach(tile => showProfile(tile, false));
  pinned = null;
});
groupSelect.addEventListener('change', renderWatchlist);
zoneButtons.forEach(button => button.addEventListener('click', () => {
  zone = button.dataset.zone;
  zoneButtons.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  renderWatchlist();
}));

const period = document.querySelector('#period');
const chart = document.querySelector('#chart');
const initialInvestment = 100000;
const chartScale = Math.max(...Object.values(returns).flat().map(([, share, div]) => share + div));

function renderChart() {
  chart.innerHTML = returns[period.value].map(([ticker, share, div]) => {
    const total = share + div;
    const gain = (total / initialInvestment - 1) * 100;
    const shareWidth = share / chartScale * 100;
    const divWidth = div / chartScale * 100;
    return `
      <div class="chart-row">
        <strong>${ticker}</strong>
        <svg viewBox="0 0 100 24" preserveAspectRatio="none" role="img" tabindex="0"
          aria-label="${ticker}, ending share value PKR ${money.format(share)}, gross dividends PKR ${money.format(div)}">
          <title>Share value PKR ${money.format(share)} · Gross dividends PKR ${money.format(div)}</title>
          <rect width="100" height="24" fill="#1b2941"></rect>
          <rect width="${shareWidth}" height="24" fill="#38bdf8"></rect>
          <rect x="${shareWidth}" width="${divWidth}" height="24" fill="#34d399"></rect>
        </svg>
        <span class="chart-total">PKR ${money.format(total)}<small>${gain.toFixed(1)}% total gain</small></span>
      </div>`;
  }).join('');
}
period.addEventListener('change', renderChart);

const profile = document.querySelector('#profile');
const profileText = document.querySelector('#profile-text');
const copyStatus = document.querySelector('#copy-status');
profileText.value = [
  'MY PSX MASTER TRADING PROFILE, HEALTH SCALE & WATCHLIST (November 2026 snapshot)',
  'Broker and fees: AL Habib Capital Markets. Brokerage per charged leg is the greater of 0.15% and PKR 0.03/share. One leg intraday and two legs multi-day. Estimated total at PKR 20 and above: 0.18–0.19% intraday and 0.36–0.40% multi-day. Verify the current broker tariff and tax treatment. Profile assumption: active filer, 15% dividend withholding and 15% CGT.',
  'Trading approach: Prefer sub-PKR 105 stocks for intraday setups where the expected move exceeds costs.',
  'Health tiers:',
  ...healthTiers.map(tier => `${tier.label}: ${tier.rule}`),
  'Watchlist and positions:',
  ...stocks.map(stock => `${stock.ticker} · ${healthTiers[stock.health].label} · ${tradeGroups[stock.trade]} · PKR ${priceText(stock.price)} · Break-even move intraday ${moveText(stock.price, feeRates.intraday)} and multi-day ${moveText(stock.price, feeRates.multiDay)}. Range: ${stock.fair}. Dividends: ${stock.dividends}. Risk: ${stock.risk}. ${stock.note}`),
  'Additional red-zone names: BIPL and EPQL.',
  'Dividend watch: OGDC and LOTCHEM. Track dividend announcements, ex-dividend dates, and 10-day advance purchase reminders.',
  'Research directive: Refresh the watchlist and surface new research on healthy Shariah PSX stocks.',
].join('\n\n');
document.querySelector('#open-profile').addEventListener('click', () => {
  copyStatus.textContent = '';
  profile.showModal();
});
document.querySelector('#copy-profile').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(profileText.value);
    copyStatus.textContent = 'Profile copied.';
  } catch {
    profileText.focus();
    profileText.select();
    copyStatus.textContent = document.execCommand('copy') ? 'Profile copied.' : 'Text selected. Copy it with your keyboard or browser menu.';
  }
});

renderWatchlist();
renderChart();

});
