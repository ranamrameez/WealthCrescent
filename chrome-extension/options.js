import { renderPriceChart } from './price-chart.js';
import './account.js';
import { saveAudit } from './audit.js';
import { sendWorkerMessage } from './common.js';
import { mountConfig, mountControls } from './config-ui.js';
import { queryAudit, mutateAudit } from './audit.js';
const $ = id => document.getElementById(id);
await mountConfig($('configCard'));
await mountControls($('scrapingControls'));

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
    for (const id of ['fromDate', 'toDate', 'tickerFilter', 'strategyFilter', 'acceptedFilter', 'sourceFilter']) $(id).value = '';
    $('testStrategy').textContent = `Strategy: ${result.strategy}`;
    $('testOutput').textContent = JSON.stringify(result, null, 2);
    selected.clear(); page = 1; await renderData();
  } catch (error) { $('testOutput').textContent = error.message; }
  finally { $('testBtn').disabled = false; }
};
let page = 1;
const selected = new Map();
const deselectedOutliers = new Set();
let chartRows = [];
let visibleRows = [];
function updateSelection() {
  $('selectionInfo').textContent = `${selected.size} selected`;
  $('editSelected').disabled = $('deleteSelected').disabled = !selected.size;
  $('selectAll').checked = visibleRows.length > 0 && visibleRows.every(row => selected.has(row.id));
  $('selectAll').indeterminate = visibleRows.some(row => selected.has(row.id)) && !$('selectAll').checked;
}
let requestVersion = 0;
async function renderData(refresh = false) {
  const version = ++requestVersion;
  try {
    if ($('fromDate').value && $('toDate').value && $('fromDate').value > $('toDate').value) throw new Error('From date must be before or equal to To date.');
    const pageSize = Number($('pageSize').value);
    const firebase = $('dataView').value === 'firebase';
    for (const id of ['strategyFilter', 'acceptedFilter', 'sourceFilter']) $(id).disabled = firebase;
    $('dataMessage').textContent = firebase ? 'Loading pushed data from Firebase...' : 'Loading local audit...';
    const filters = { from: $('fromDate').value, to: $('toDate').value, ticker: $('tickerFilter').value.trim(), strategy: $('strategyFilter').value, accepted: $('acceptedFilter').value, source: $('sourceFilter').value, outliers: $('outlierFilter').value, page, pageSize };
    const result = firebase ? await sendWorkerMessage({ type: 'GET_PUSHED_DATA', filters, refresh }) : await queryAudit(filters);
    if (version !== requestVersion) return;
    const pages = Math.max(1, Math.ceil(result.total / pageSize));
    if (page > pages) { page = pages; return renderData(); }
    const tickerValue = $('tickerFilter').value;
    $('tickerFilter').replaceChildren(...['', ...(result.tickers || [])].map(ticker => { const option = document.createElement('option'); option.value = ticker; option.textContent = ticker || 'All tickers'; return option; }));
    $('tickerFilter').value = tickerValue;
    visibleRows = result.rows;
    if ($('autoSelectOutliers').checked) {
      for (const row of result.outlierRows || result.rows.filter(row => row.outlier)) {
        if (!deselectedOutliers.has(row.id) && (selected.has(row.id) || selected.size < 100)) selected.set(row.id, row);
      }
    }
    chartRows = result.chartRows || result.rows;
    const previousChartTicker = $('chartTicker').value;
    const chartTickers = [...new Set(chartRows.map(row => row.ticker))].sort();
    $('chartTicker').replaceChildren(...chartTickers.map(ticker => { const option = document.createElement('option'); option.value = option.textContent = ticker; return option; }));
    $('chartTicker').value = chartTickers.includes(tickerValue) ? tickerValue : chartTickers.includes(previousChartTicker) ? previousChartTicker : chartTickers[0] || '';
    renderPriceChart($('priceChart'), chartRows, $('chartTicker').value);
    $('dataRows').replaceChildren();
    for (const row of result.rows) {
      const tr = document.createElement('tr');
      if (row.outlier) tr.classList.add('outlier');
      const selectCell = document.createElement('td'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(row.id); checkbox.setAttribute('aria-label', `Select ${row.ticker} ${row.price}`); checkbox.onchange = () => { if (checkbox.checked) { selected.set(row.id, row); deselectedOutliers.delete(row.id); } else { selected.delete(row.id); deselectedOutliers.add(row.id); } updateSelection(); }; selectCell.append(checkbox); tr.append(selectCell);
      const values = [row.capturedAt == null ? 'Time unavailable' : new Date(row.capturedAt).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' }), row.ticker || '—', row.price ?? '-', row.priceKey || 'Unavailable (older record)', row.deltaPct == null ? 'No previous value' : `${row.outlier ? 'FLAG ' : ''}${row.deltaPct.toFixed(2)}% (previous ${row.previousPrice})`, firebase ? 'Stored in Firebase' : row.accepted ? 'Accepted' : 'Rejected', firebase ? row.source : `${row.strategy} / ${row.source}`];
      for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
      const td = document.createElement('td'); const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = firebase && !row.raw?.length ? 'Stored record (raw source unavailable)' : `${row.raw?.length || 0} raw pairs`;
      const pre = document.createElement('pre'); pre.textContent = JSON.stringify({ priceKey: row.priceKey, previousPrice: row.previousPrice, deltaPct: row.deltaPct, stored: row.stored, raw: row.raw, selected: row.selected, parsed: { ticker: row.ticker, price: row.price, name: row.name, changePct: row.changePct }, url: row.url }, null, 2);
      details.append(summary, pre); td.append(details); tr.append(td); $('dataRows').append(tr);
    }
    $('dataMessage').textContent = result.total ? `${result.total} matching records` : firebase ? 'No matching pushed data in Firebase.' : 'No matching local audit records. Run a scrape to collect raw records.';
    $('pageInfo').textContent = `Page ${page} of ${pages}`;
    updateSelection();
    $('prevPage').disabled = page <= 1; $('nextPage').disabled = page >= pages;
  } catch (error) { if (version !== requestVersion) return; $('dataMessage').textContent = error.message; $('dataRows').replaceChildren(); $('priceChart').replaceChildren(); $('prevPage').disabled = true; $('nextPage').disabled = true; }
}
for (const id of ['dataView', 'fromDate', 'toDate', 'tickerFilter', 'strategyFilter', 'acceptedFilter', 'sourceFilter', 'outlierFilter', 'pageSize']) $(id).addEventListener('change', () => { page = 1; selected.clear(); deselectedOutliers.clear(); updateSelection(); renderData(); });
$('refreshData').onclick = () => renderData(true);
$('prevPage').onclick = () => { page--; renderData(); };
$('nextPage').onclick = () => { page++; renderData(); };
$('selectAll').onchange = () => {
  for (const row of visibleRows) { if ($('selectAll').checked) { selected.set(row.id, row); deselectedOutliers.delete(row.id); } else { selected.delete(row.id); deselectedOutliers.add(row.id); } }
  renderData();
};
async function applyBatch(operation) {
  const entries = [...selected.values()].map(row => ({ id: row.id, kind: row.kind, ticker: row.ticker, key: row.key, price: row.price, time: row.stored?.time }));
  const price = Number($('batchPrice').value);
  if (!entries.length) return;
  if (entries.length > 100) { $('dataMessage').textContent = 'Select at most 100 records per batch.'; return; }
  if (operation === 'edit' && (!Number.isFinite(price) || price <= 0)) { $('dataMessage').textContent = 'Enter a positive corrected price.'; return; }
  const location = $('dataView').value === 'firebase' ? 'the shared Firebase database' : 'local audit history';
  if (!window.confirm(operation === 'delete' ? 'Delete ' + entries.length + ' selected record(s) from ' + location + '?' : 'Set all ' + entries.length + ' selected record(s) to price ' + price + ' in ' + location + '?')) return;
  $('editSelected').disabled = $('deleteSelected').disabled = true;
  try {
    const results = $('dataView').value === 'firebase' ? (await sendWorkerMessage({ type: 'MUTATE_PUSHED_DATA', entries, operation, price })).results : await mutateAudit(entries, operation, price);
    selected.clear(); await renderData(true);
    $('dataMessage').textContent = results.filter(result => result.ok).length + ' record(s) updated. ' + results.filter(result => result.error || result.warning).map(result => result.error || result.warning).join(' ');
  } catch (error) { $('dataMessage').textContent = error.message; }
  finally { updateSelection(); }
}
$('chartTicker').onchange = () => renderPriceChart($('priceChart'), chartRows, $('chartTicker').value);
$('autoSelectOutliers').onchange = () => { selected.clear(); deselectedOutliers.clear(); renderData(); };
$('editSelected').onclick = () => applyBatch('edit');
$('deleteSelected').onclick = () => applyBatch('delete');
await renderData();

chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.auditUpdatedAt || changes.auth || changes.status)) renderData(!!changes.status); });
