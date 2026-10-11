import { getActivity, qatarDate } from './activity.js';
import { summarizeAuditToday } from './audit.js';
import { getStatus, getSyncConfig } from './common.js';

export function elapsed(timestamp, now = Date.now()) {
  if (!timestamp) return 'Never';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`;
}

export async function mountStats(container) {
  const document = container.ownerDocument;
  let disposed = false;
  let evidenceCache = null;
  let evidencePending = null;
  async function evidence() {
    if (evidenceCache && evidenceCache.date === qatarDate() && Date.now() - evidenceCache.at < 30000) return evidenceCache;
    if (evidencePending) return evidencePending;
    evidencePending = summarizeAuditToday().then(audit => {
      evidenceCache = { at: Date.now(), date: qatarDate(), audit, error: '' };
      return evidenceCache;
    }).catch(error => ({ audit: null, error: 'Local audit read failed: ' + error.message })).finally(() => { evidencePending = null; });
    return evidencePending;
  }
  async function render() {
    const [activity, status, config, recorded] = await Promise.all([getActivity(), getStatus(), getSyncConfig(), evidence()]);
    if (disposed) return;
    const daily = activity.daily;
    const tracked = !!activity.trackingStartedAt;
    const stale = !!status.lastScrapeAt && (!activity.lastScrapeAt || status.lastScrapeAt > activity.lastScrapeAt + 5000);
    const syncError = activity.lastSyncError || status.lastSyncError || '';
    const hasFailures = daily.syncFailures > 0;
    const lastSyncAt = activity.lastSyncAt || recorded.audit?.lastSyncAt || (status.lastPushCount > 0 ? status.lastPushAt : null);
    const lines = [
      ['Since last sync', lastSyncAt ? elapsed(lastSyncAt) : 'No successful sync yet'],
      ['Sync status', syncError ? `Needs attention: ${syncError}` : hasFailures && !lastSyncAt ? 'Previous attempts failed; retry to see the cause' : lastSyncAt ? 'Prices synced' : 'Waiting for first sync'],
      ['Since last scrape', elapsed(activity.lastScrapeAt || status.lastScrapeAt)],
      ['Local scrapes recorded today', recorded.audit ? `${recorded.audit.scrapeCount} (${recorded.audit.rowCount} raw rows)` : 'Local audit read failed'],
      ['Confirmed synced audit rows today', String(recorded.audit?.syncedRows ?? daily.syncedRows ?? 0)],
      ['Scrapes counted today', `${daily.scrapeCount} (${daily.scrapedRows} ticker rows)`],
      ['Syncs counted today', `${daily.syncCount} (${daily.syncedRows} ticker writes)`],
      ['Sync attempts today', `${daily.syncAttempts}; ${daily.syncFailures} failed or partial`],
      ['Scrape failures / tests today', `${daily.scrapeFailures} / ${daily.testCount}`],
      ['Next sync due', !config.scrapingEnabled ? 'Stopped' : status.nextPushAt ? status.nextPushAt <= Date.now() ? 'On next eligible scrape' : `In ${elapsed(Date.now(), status.nextPushAt)}` : 'On next eligible scrape'],
    ];
    const heading = document.createElement('h2'); heading.textContent = 'Activity';
    const list = document.createElement('div'); list.className = 'activity-sections';
    const localLabels = new Set(['Since last scrape','Local scrapes recorded today','Scrapes counted today','Scrape failures / tests today']);
    for (const [title, isLocal] of [['Local scrape',true],['DB sync',false]]) {
      const section = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = title;
      const details = document.createElement('dl'); details.className = 'stats-grid';
      for (const [label,value] of lines.filter(([label]) => localLabels.has(label) === isLocal)) {
        const term = document.createElement('dt'); term.textContent = label;
        const detail = document.createElement('dd'); detail.textContent = value; details.append(term,detail);
      }
      section.append(heading,details); list.append(section);
    }
    const note = document.createElement('p'); note.className = 'muted';
    note.textContent = `Today uses Qatar time. Statistics cover all tickers; table filters do not affect them. Local records count retained scrape batches. Stats come from this extension; no Firebase read is needed. Confirmed synced rows are retained audit records marked after a successful price write. ${tracked ? `Activity counters started ${new Date(activity.trackingStartedAt).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' })}; tests are included.` : 'Activity counters have not started; reload the extension in chrome://extensions to load the updated worker.'}${stale ? ' Saved status is newer than the activity counters; reload the extension to resume tracking.' : ''}`;
    const error = document.createElement('p'); error.className = 'error'; error.textContent = [...new Set([syncError, status.lastError, status.configSyncError, recorded.error].filter(Boolean))].join(' ');
    const { configSyncStatus } = await chrome.storage.local?.get('configSyncStatus') || {};
    if (configSyncStatus?.error) error.textContent += ' ' + configSyncStatus.error;
    container.replaceChildren(heading, list, note, error);
  }
  const refresh = () => render().catch(error => { if (!disposed) container.textContent = `Cannot load statistics: ${error.message}`; });
  const listener = (changes, area) => { if (area === 'local' && (changes.activity || changes.status || changes.syncConfig || changes.auditUpdatedAt || changes.auth || changes.configSyncStatus)) { evidenceCache = null; refresh(); } };
  chrome.storage.onChanged.addListener(listener);
  const timer = setInterval(refresh, 5000);
  window.addEventListener('pagehide', () => { disposed = true; clearInterval(timer); chrome.storage.onChanged.removeListener(listener); }, { once: true });
  await refresh();
}
