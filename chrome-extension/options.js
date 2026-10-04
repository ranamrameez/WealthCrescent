import { mountConfig, mountControls } from './config-ui.js';
import { queryAudit } from './audit.js';
const $ = id => document.getElementById(id);
await mountConfig($('configCard'));
await mountControls($('scrapingControls'));

$('testBtn').onclick = async () => {
  $('testBtn').disabled = true;
  $('testOutput').textContent = 'Scraping…';
  try {
    const form = $('configCard').querySelector('form');
    const config = Object.fromEntries(['targetUrl', 'rowSelector', 'tickerSelector', 'priceSelector', 'changeSelector', 'nameSelector'].map(key => [key, form.elements[key].value.trim()]));
    const result = await chrome.runtime.sendMessage({ type: 'TEST_SCRAPE', targetUrl: config.targetUrl, config });
    if (!result?.ok) throw new Error(result?.error || 'No response');
    $('testStrategy').textContent = `Strategy: ${result.strategy}`;
    $('testOutput').textContent = JSON.stringify(result, null, 2);
    page = 1; await renderData();
  } catch (error) { $('testOutput').textContent = error.message; }
  finally { $('testBtn').disabled = false; }
};
let page = 1;
let requestVersion = 0;
async function renderData() {
  const version = ++requestVersion;
  try {
    if ($('fromDate').value && $('toDate').value && $('fromDate').value > $('toDate').value) throw new Error('From date must be before or equal to To date.');
    const pageSize = Number($('pageSize').value);
    const result = await queryAudit({ from: $('fromDate').value, to: $('toDate').value, ticker: $('tickerFilter').value.trim(), strategy: $('strategyFilter').value, accepted: $('acceptedFilter').value, source: $('sourceFilter').value, page, pageSize });
    if (version !== requestVersion) return;
    const pages = Math.max(1, Math.ceil(result.total / pageSize));
    if (page > pages) { page = pages; return renderData(); }
    $('dataRows').replaceChildren();
    for (const row of result.rows) {
      const tr = document.createElement('tr');
      const values = [new Date(row.capturedAt).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' }), row.ticker || '—', row.price ?? '—', row.accepted ? 'Accepted' : 'Rejected', `${row.strategy} / ${row.source}`];
      for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
      const td = document.createElement('td'); const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = `${row.raw?.length || 0} raw pairs`;
      const pre = document.createElement('pre'); pre.textContent = JSON.stringify({ raw: row.raw, selected: row.selected, parsed: { ticker: row.ticker, price: row.price, name: row.name, changePct: row.changePct }, url: row.url }, null, 2);
      details.append(summary, pre); td.append(details); tr.append(td); $('dataRows').append(tr);
    }
    $('dataMessage').textContent = result.total ? `${result.total} matching records` : 'No matching data. Open the market tab and run a scrape to collect records.';
    $('pageInfo').textContent = `Page ${page} of ${pages}`;
    $('prevPage').disabled = page <= 1; $('nextPage').disabled = page >= pages;
  } catch (error) { $('dataMessage').textContent = error.message; $('dataRows').replaceChildren(); $('prevPage').disabled = true; $('nextPage').disabled = true; }
}
for (const id of ['fromDate', 'toDate', 'tickerFilter', 'strategyFilter', 'acceptedFilter', 'sourceFilter', 'pageSize']) $(id).addEventListener('change', () => { page = 1; renderData(); });
$('refreshData').onclick = () => renderData();
$('prevPage').onclick = () => { page--; renderData(); };
$('nextPage').onclick = () => { page++; renderData(); };
await renderData();
