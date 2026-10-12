import { getChartFavourites, setChartFavourites } from './chart-favourites.js';
import { dateRange } from './date-ranges.js';
import { qatarDate } from './activity.js';
import { mountStats } from './stats-ui.js';
import { renderPriceChart } from './price-chart.js';
import './account.js';
import { saveAudit } from './audit.js';
import { sendWorkerMessage } from './common.js';
import { mountConfig, mountControls } from './config-ui.js';
import { queryAudit, mutateAudit } from './audit.js';
const $ = id => document.getElementById(id);
await sendWorkerMessage({ type:'LOAD_EXTENSION_CONFIGS' }).catch(error => { $('dataMessage').textContent = error.message; });
const favourites = new Set(await getChartFavourites());
const savedConfig = await chrome.storage.local?.get(['favouriteTimeframes','viewPreferences']) || {};
let favouriteTimeframes = savedConfig.favouriteTimeframes || {};
function applyViewPreferences(preferences) {
for (const [id,value] of Object.entries(preferences || {})) {
  if (['dataView','pageSize','outlierFilter','autoSelectOutliers'].includes(id) && $(id)) {
    if (id === 'autoSelectOutliers') $(id).checked = !!value; else $(id).value = value;
  }
}
}
applyViewPreferences(savedConfig.viewPreferences);
$('fromDate').value = $('toDate').value = qatarDate();
await mountConfig($('configCard'));
await mountControls($('scrapingControls'), { manualActions: true });
await mountStats($('activityStats'));

$('testBtn').onclick = async () => {
  $('testBtn').disabled = true;
  $('testOutput').textContent = 'Scraping…';
  try {
    const form = $('configCard').querySelector('form');
    const config = Object.fromEntries(['targetUrl'].map(key => [key, form.elements[key].value.trim()]));
    const result = await sendWorkerMessage({ type: 'TEST_SCRAPE', targetUrl: config.targetUrl, config });
    if (!result?.ok) throw new Error(result?.error || 'No response');
    $('dataView').value = 'local';
    if (!result.auditSaved) await saveAudit(result, config.targetUrl, 'test');
    for (const id of ['tickerFilter', 'strategyFilter', 'acceptedFilter', 'sourceFilter']) $(id).value = '';
    $('testStrategy').textContent = `Strategy: ${result.strategy}`;
    $('testOutput').textContent = JSON.stringify(result, null, 2);
    selected.clear(); page = 1; await renderData();
  } catch (error) { $('testOutput').textContent = error.message; }
  finally { $('testBtn').disabled = false; }
};
let page = 1;
const selected = new Map();
const deselectedOutliers = new Set();
const autoSelectedOutliers = new Set();
let chartRows = [];
let favouriteRows = [];
const favouriteChartRows = new Map();
let visibleRows = [];
let flaggedOutlierRows = [];
let batchBusy = false;
function updateSelection() {
  $('selectionInfo').textContent = `${selected.size} selected`;
  $('editSelected').disabled = $('deleteSelected').disabled = batchBusy || !selected.size;
  $('deleteOutliers').disabled = batchBusy || !flaggedOutlierRows.length;
  $('outlierCount').textContent = `${flaggedOutlierRows.length} flagged (up to 100 per removal)`;
  $('selectAll').checked = visibleRows.length > 0 && visibleRows.every(row => selected.has(row.id));
  $('selectAll').indeterminate = visibleRows.some(row => selected.has(row.id)) && !$('selectAll').checked;
}
let requestVersion = 0;
async function renderData(refresh = false) {
  if (document.fullscreenElement || batchBusy) return;
  const version = ++requestVersion;
  try {
    if ($('fromDate').value && $('toDate').value && $('fromDate').value > $('toDate').value) throw new Error('From date must be before or equal to To date.');
    const pageSize = Number($('pageSize').value);
    const firebase = $('dataView').value === 'firebase';
    const combined = $('dataView').value === 'all';
    for (const id of ['strategyFilter', 'acceptedFilter', 'sourceFilter']) $(id).disabled = firebase;
    $('dataMessage').textContent = firebase ? 'Loading pushed data from Firebase...' : combined ? 'Loading synced and local audit data...' : 'Loading local audit...';
    const filters = { from: $('fromDate').value, to: $('toDate').value, ticker: $('tickerFilter').value.trim(), strategy: firebase ? '' : $('strategyFilter').value, accepted: firebase ? '' : $('acceptedFilter').value, source: firebase ? '' : $('sourceFilter').value, outliers: $('outlierFilter').value, page, pageSize };
    const result = combined ? await sendWorkerMessage({ type: 'GET_ALL_DATA', filters, refresh }) : firebase ? await sendWorkerMessage({ type: 'GET_PUSHED_DATA', filters, refresh }) : await queryAudit(filters);
    if (version !== requestVersion || document.fullscreenElement) return;
    const pages = Math.max(1, Math.ceil(result.total / pageSize));
    if (page > pages) { page = pages; return renderData(); }
    const pinned = await Promise.all([...favourites].map(async ticker => {
      const period = favouriteTimeframes[ticker] || 'filters';
      const range = period === 'filters' ? {} : dateRange(period);
      if (filters.ticker && !ticker.toUpperCase().includes(filters.ticker.toUpperCase())) return [ticker, []];
      const chartFilters = { ...filters, ...range, ticker };
      const data = combined ? await sendWorkerMessage({ type:'GET_ALL_DATA', filters:chartFilters }) : firebase ? await sendWorkerMessage({ type:'GET_PUSHED_DATA',filters:chartFilters }) : await queryAudit(chartFilters);
      return [ticker, data.chartRows || data.rows];
    }));
    if (version !== requestVersion || document.fullscreenElement || batchBusy) return;
    const tickerValue = $('tickerFilter').value;
    $('tickerFilter').replaceChildren(...['', ...(result.tickers || [])].map(ticker => { const option = document.createElement('option'); option.value = ticker; option.textContent = ticker || 'All tickers'; return option; }));
    $('tickerFilter').value = tickerValue;
    visibleRows = result.rows;
    flaggedOutlierRows = result.outlierRows || result.rows.filter(row => row.outlier);
    const flaggedIds = new Set(flaggedOutlierRows.map(row => row.id));
    for (const id of autoSelectedOutliers) if (!flaggedIds.has(id)) { selected.delete(id); autoSelectedOutliers.delete(id); }
    if ($('autoSelectOutliers').checked) {
      for (const row of result.outlierRows || result.rows.filter(row => row.outlier)) {
        if (!deselectedOutliers.has(row.id) && (selected.has(row.id) || selected.size < 100)) {
          if (!selected.has(row.id)) autoSelectedOutliers.add(row.id);
          selected.set(row.id, row);
        }
      }
    }
    chartRows = result.chartRows || result.rows;
    const previousChartTicker = $('chartTicker').value;
    const chartTickers = [...new Set(chartRows.map(row => row.ticker))].sort();
    $('chartTicker').replaceChildren(...['', ...chartTickers].map(ticker => { const option = document.createElement('option'); option.value = ticker; option.textContent = ticker || 'All tickers'; return option; }));
    $('chartTicker').value = chartTickers.includes(tickerValue) ? tickerValue : chartTickers.includes(previousChartTicker) ? previousChartTicker : '';
    favouriteRows = chartRows;
    favouriteChartRows.clear(); pinned.forEach(([ticker,rows]) => favouriteChartRows.set(ticker,rows));
    renderCharts();
    $('dataRows').replaceChildren();
    for (const row of result.rows) {
      const tr = document.createElement('tr');
      if (row.outlier) tr.classList.add('outlier');
      const selectCell = document.createElement('td'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(row.id); checkbox.setAttribute('aria-label', `Select ${row.ticker} ${row.price}`); checkbox.onchange = () => { autoSelectedOutliers.delete(row.id); if (checkbox.checked) { selected.set(row.id, row); deselectedOutliers.delete(row.id); } else { selected.delete(row.id); deselectedOutliers.add(row.id); } updateSelection(); }; selectCell.append(checkbox); tr.append(selectCell);
      const values = [row.capturedAt == null ? 'Timestamp not recorded' : new Date(row.capturedAt).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' }), row.ticker || '—', row.price ?? '-', row.dayHigh ?? '-', row.dayLow ?? '-', row.priceKey || 'Legacy record (grid key not captured)', row.referencePrice == null ? 'Insufficient nearby consensus' : `${row.outlier ? 'FLAG ' : ''}${row.outlierDeltaPct.toFixed(2)}% vs nearby median ${row.referencePrice} (${row.referenceCount} prices)`, row.syncStatus || (firebase ? 'Stored in Firebase' : row.accepted ? 'Accepted' : 'Rejected'), firebase || row.origin === 'firebase' ? row.source : `${row.strategy} / ${row.source}`];
      for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
      const td = document.createElement('td'); const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = (firebase || row.origin === 'firebase') && !row.raw?.length ? 'Stored record (raw source unavailable)' : `${row.raw?.length || 0} raw pairs`;
      const pre = document.createElement('pre'); pre.textContent = JSON.stringify({ priceKey: row.priceKey, highLowKey: row.highLowKey, highLowRaw: row.highLowRaw, rangeError: row.rangeError, previousPrice: row.previousPrice, deltaPct: row.deltaPct, referencePrice: row.referencePrice, referenceCount: row.referenceCount, outlierDeltaPct: row.outlierDeltaPct, stored: row.stored, raw: row.raw, selected: row.selected, parsed: { ticker: row.ticker, price: row.price, dayHigh: row.dayHigh, dayLow: row.dayLow, name: row.name, changePct: row.changePct }, url: row.url }, null, 2);
      details.append(summary, pre); td.append(details); tr.append(td); $('dataRows').append(tr);
    }
    $('dataMessage').textContent = result.total ? `${result.total} matching records` : combined ? 'No matching synced or pending records for these dates.' : firebase ? 'No matching pushed data in Firebase.' : 'No matching local audit records. Run a scrape to collect raw records.';
    if (result.warning) $('dataMessage').textContent += ` ${result.warning}`;
    $('pageInfo').textContent = `Page ${page} of ${pages}`;
    updateSelection();
    $('prevPage').disabled = page <= 1; $('nextPage').disabled = page >= pages;
  } catch (error) { if (version !== requestVersion) return; $('dataMessage').textContent = error.message; $('dataRows').replaceChildren(); $('priceChart').replaceChildren(); $('favouriteChartList').replaceChildren(); $('prevPage').disabled = true; $('nextPage').disabled = true; }
}
for (const id of ['dataView', 'fromDate', 'toDate', 'tickerFilter', 'strategyFilter', 'acceptedFilter', 'sourceFilter', 'outlierFilter', 'pageSize']) $(id).addEventListener('change', () => { page = 1; selected.clear(); autoSelectedOutliers.clear(); deselectedOutliers.clear(); updateSelection(); renderData(); });
$('refreshData').onclick = () => renderData(true);
$('prevPage').onclick = () => { page--; renderData(); };
$('nextPage').onclick = () => { page++; renderData(); };
$('selectAll').onchange = () => {
  for (const row of visibleRows) { autoSelectedOutliers.delete(row.id); if ($('selectAll').checked) { selected.set(row.id, row); deselectedOutliers.delete(row.id); } else { selected.delete(row.id); deselectedOutliers.add(row.id); } }
  renderData();
};
async function applyBatch(operation) {
  if (batchBusy) return;
  const entries = [...selected.values()].map(row => ({ id: row.id, kind: row.kind, origin: row.origin || ( $('dataView').value === 'firebase' ? 'firebase' : 'local'), auditId: row.auditId, ticker: row.ticker, key: row.key, price: row.price, time: row.stored?.time }));
  const price = Number($('batchPrice').value);
  if (!entries.length) return;
  if (entries.length > 100) { $('dataMessage').textContent = 'Select at most 100 records per batch.'; return; }
  if (operation === 'edit' && (!Number.isFinite(price) || price <= 0)) { $('dataMessage').textContent = 'Enter a positive corrected price.'; return; }
  const location = $('dataView').value === 'all' ? 'their respective Firebase or local records' : $('dataView').value === 'firebase' ? 'the shared Firebase database' : 'local audit history';
  if (!window.confirm(operation === 'delete' ? 'Delete ' + entries.length + ' selected record(s) from ' + location + '?' : 'Set all ' + entries.length + ' selected record(s) to price ' + price + ' in ' + location + '?')) return;
  batchBusy = true;
  document.dispatchEvent(new document.defaultView.CustomEvent('extension-action', { detail: { key: 'batch', busy: true } }));
  $('editSelected').disabled = $('deleteSelected').disabled = true;
  try {
    const firebaseEntries = entries.filter(entry => entry.origin === 'firebase');
    const localEntries = entries.filter(entry => entry.origin === 'local').map(entry => ({ ...entry, id: entry.auditId ?? entry.id }));
    const results = [];
    if (firebaseEntries.length) {
      try { results.push(...(await sendWorkerMessage({ type: 'MUTATE_PUSHED_DATA', entries: firebaseEntries, operation, price })).results); }
      catch (error) { results.push(...firebaseEntries.map(entry => ({ id: entry.id, ok: false, error: error.message }))); }
    }
    if (localEntries.length) {
      try { results.push(...await mutateAudit(localEntries, operation, price)); }
      catch (error) { results.push(...localEntries.map(entry => ({ id: entry.id, ok: false, error: error.message }))); }
    }
    selected.clear(); batchBusy = false; await renderData(true);
    $('dataMessage').textContent = results.filter(result => result.ok).length + ' record(s) updated. ' + results.filter(result => result.error || result.warning).map(result => result.error || result.warning).join(' ');
  } catch (error) { $('dataMessage').textContent = error.message; }
  finally { batchBusy = false; document.dispatchEvent(new document.defaultView.CustomEvent('extension-action', { detail: { key: 'batch', busy: false } })); updateSelection(); }
}
for (const button of document.querySelectorAll('[data-period]')) button.onclick = async () => {
  const range = dateRange(button.dataset.period);
  $('fromDate').value = range.from; $('toDate').value = range.to;
  for (const toggle of document.querySelectorAll('[data-period]')) toggle.setAttribute('aria-pressed', String(toggle === button));
  page = 1; selected.clear(); deselectedOutliers.clear(); await renderData();
};
for (const id of ['fromDate', 'toDate']) $(id).addEventListener('change', () => { for (const toggle of document.querySelectorAll('[data-period]')) toggle.setAttribute('aria-pressed', 'false'); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) renderData(); });
$('chartTicker').onchange = () => renderCharts();
$('autoSelectOutliers').onchange = () => { selected.clear(); deselectedOutliers.clear(); renderData(); };
function renderCharts() {
  const options = { favourites, onFavourite: async ticker => {
    const next = new Set(favourites);
    if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
    await setChartFavourites([...next]);
    favourites.clear(); next.forEach(symbol => favourites.add(symbol));
    await renderData();
  } };
  renderPriceChart($('priceChart'), chartRows, $('chartTicker').value, options);
  const list = $('favouriteChartList'); list.replaceChildren();
  if (!favourites.size) { list.textContent = 'Choose Favourite on a chart to pin it here.'; return; }
  const grid = document.createElement('div'); grid.className = 'chart-grid';
  for (const ticker of [...favourites].sort().filter(ticker => !$('tickerFilter').value || ticker.includes($('tickerFilter').value))) {
    const card = document.createElement('section'); const title = document.createElement('h3'); title.textContent = ticker;
    const periods = document.createElement('div'); periods.className = 'chart-ranges'; periods.setAttribute('role','group'); periods.setAttribute('aria-label', ticker + ' timeframe');
    for (const period of ['filters','1d','7d','1M','3M','6M','1Y','all']) {
      const button = document.createElement('button'); button.textContent = period === 'filters' ? 'Table dates' : period === 'all' ? 'All time' : period;
      button.dataset.favouritePeriod = period; button.setAttribute('aria-pressed', String((favouriteTimeframes[ticker] || 'filters') === period));
      button.onclick = async () => {
        button.disabled = true;
        try {
        favouriteTimeframes = { ...favouriteTimeframes, [ticker]:period };
        await chrome.storage.local?.set({ favouriteTimeframes }); await renderData();
        } catch (error) { $('dataMessage').textContent = error.message; }
        finally { button.disabled = false; }
      }; periods.append(button);
    }
    const chart = document.createElement('div'); card.append(title, periods, chart); grid.append(card);
    renderPriceChart(chart, favouriteChartRows.get(ticker) || favouriteRows, ticker, options);
  }
  list.append(grid);
}
$('editSelected').onclick = () => applyBatch('edit');
$('deleteSelected').onclick = () => applyBatch('delete');
$('deleteOutliers').onclick = async () => {
  if (batchBusy || !flaggedOutlierRows.length) return;
  selected.clear(); flaggedOutlierRows.forEach(row => selected.set(row.id, row)); updateSelection();
  await applyBatch('delete');
};
await renderData();
let refreshTimer;
function scheduleDataRefresh(force = false) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (batchBusy) { scheduleDataRefresh(force); return; } renderData(force); }, 150);
}
for (const id of ['dataView','pageSize','outlierFilter','autoSelectOutliers']) $(id).addEventListener('change', async () => {
  const viewPreferences = Object.fromEntries(['dataView','pageSize','outlierFilter','autoSelectOutliers'].map(key => [key, key === 'autoSelectOutliers' ? $(key).checked : $(key).value]));
  await chrome.storage.local?.set({ viewPreferences });
});

chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.chartFavourites) { favourites.clear(); (changes.chartFavourites.newValue || []).forEach(ticker => favourites.add(ticker)); renderData(); }
  if (area === 'local' && changes.viewPreferences) { applyViewPreferences(changes.viewPreferences.newValue); page = 1; renderData(); }
  if (area === 'local' && changes.favouriteTimeframes) { favouriteTimeframes = changes.favouriteTimeframes.newValue || {}; renderData(); }
  if (area === 'local' && (changes.auditUpdatedAt || changes.auth || changes.status?.newValue?.lastPushAt !== changes.status?.oldValue?.lastPushAt)) scheduleDataRefresh(!!changes.auth || !!changes.status); });
