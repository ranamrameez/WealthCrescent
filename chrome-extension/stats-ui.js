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
  let renderVersion = 0;
  let evidenceCache = null;
  let evidencePending = null;
  async function evidence() {
    if (evidenceCache && evidenceCache.date === qatarDate() && Date.now() - evidenceCache.at < 5000) return evidenceCache;
    if (evidencePending) return evidencePending;
    evidencePending = summarizeAuditToday().then(audit => {
      evidenceCache = { at: Date.now(), date: qatarDate(), audit, error: '' };
      return evidenceCache;
    }).catch(error => ({ audit: null, error: 'Local audit read failed: ' + error.message })).finally(() => { evidencePending = null; });
    return evidencePending;
  }
  async function render() {
    const version = ++renderVersion;
    const [activity, status, config, recorded] = await Promise.all([getActivity(), getStatus(), getSyncConfig(), evidence()]);
    if (disposed || version !== renderVersion) return;
    const daily = activity.daily;
    const tracked = !!activity.trackingStartedAt;
    const stale = !!status.lastScrapeAt && (!activity.lastScrapeAt || status.lastScrapeAt > activity.lastScrapeAt + 5000);
    const gated = ['Stopped', 'Outside time window'].includes(status.scrapeState) || ['Stopped', 'Outside time window'].includes(status.syncState);
    const syncError = gated || status.syncState === 'Waiting for sign-in' || status.syncState === 'Ready to sync' ? '' : activity.lastSyncError || status.lastSyncError || '';
    const hasFailures = daily.syncFailures > 0;
    const lastSyncAt = activity.lastSyncAt || recorded.audit?.lastSyncAt || (status.lastPushCount > 0 ? status.lastPushAt : null);
    const lines = [
      ['Since last sync', lastSyncAt ? elapsed(lastSyncAt) : 'No successful sync yet'],
      ['Scrape status', !config.scrapingEnabled ? 'Stopped' : status.scrapeState || 'Watching prices'],
      ['Sync status', status.syncState === 'Stopped' || status.syncState === 'Outside time window' ? status.syncState : status.syncState === 'Syncing' ? 'Syncing' : status.syncState === 'Retrying' ? `Retrying${status.retryAt ? ' in ' + elapsed(Date.now(), status.retryAt) : ''}${syncError ? ': ' + syncError : ''}` : status.syncState === 'Waiting for sign-in' || status.syncState === 'Ready to sync' ? status.syncState : syncError ? `Needs attention: ${syncError}` : hasFailures && !lastSyncAt ? 'Previous attempts failed; retry to see the cause' : lastSyncAt ? 'Prices synced' : 'Waiting for first sync'],
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
    const localLabels = new Set(['Scrape status','Since last scrape','Local scrapes recorded today','Scrapes counted today','Scrape failures / tests today']);
    for (const [title, isLocal] of [['Local scrape',true],['DB sync',false]]) {
      const section = document.createElement('section'); section.className = 'wc-card wc-card--inset'; const heading = document.createElement('h3'); heading.textContent = title;
      const details = document.createElement('dl'); details.className = 'stats-grid';
      for (const [label,value] of lines.filter(([label]) => localLabels.has(label) === isLocal)) {
        const term = document.createElement('dt'); term.textContent = label;
        const detail = document.createElement('dd'); detail.textContent = value; details.append(term,detail);
      }
      section.append(heading,details); list.append(section);
    }
    const note = document.createElement('p'); note.className = 'muted';
    note.textContent = `Today uses Qatar time. Statistics cover all tickers; table filters do not affect them. Local records count retained scrape batches. Stats come from this extension; no Firebase read is needed. Confirmed synced rows are retained audit records marked after a successful price write. ${tracked ? `Activity counters started ${new Date(activity.trackingStartedAt).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' })}; tests are included.` : 'Activity counters have not started; reload the extension in chrome://extensions to load the updated worker.'}${stale ? ' Saved status is newer than the activity counters; reload the extension to resume tracking.' : ''}`;
    const error = document.createElement('p'); error.className = 'error'; error.textContent = [...new Set([syncError, gated ? null : status.lastError, status.configSyncError, recorded.error].filter(Boolean))].join(' ');
    const { configSyncStatus } = await chrome.storage.local?.get('configSyncStatus') || {};
    if (disposed || version !== renderVersion) return;
    if (configSyncStatus?.error) error.textContent += ' ' + configSyncStatus.error;
    const explanation = container.querySelector('details.statistics-info') || document.createElement('details');
    explanation.className = 'advanced-controls wc-info-wrap statistics-info';
    const summary = explanation.querySelector('summary') || document.createElement('summary'); summary.textContent = 'About activity statistics';
    const history = document.createElement('p'); history.className = 'muted';
    history.textContent = status.lastScrapeError ? 'Previous scrape error: ' + status.lastScrapeError : '';
    explanation.replaceChildren(summary, note, history);
    container.replaceChildren(heading, list, explanation, error);
  }
  const refresh = () => render().catch(error => { if (disposed) return; const warning = container.querySelector('.statistics-load-error') || document.createElement('p'); warning.className = 'error statistics-load-error'; warning.textContent = 'Cannot refresh activity: ' + error.message + '. Previous statistics remain visible.'; if (!warning.isConnected) container.append(warning); });
  const listener = (changes, area) => { if (area === 'local' && (changes.activity || changes.status || changes.syncConfig || changes.auditUpdatedAt || changes.auth || changes.configSyncStatus)) { if (changes.status?.newValue?.actionCompletedAt !== changes.status?.oldValue?.actionCompletedAt) evidenceCache = null; refresh(); } };
  chrome.storage.onChanged.addListener(listener);
  const timer = setInterval(refresh, 5000);
  window.addEventListener('pagehide', () => { disposed = true; clearInterval(timer); chrome.storage.onChanged.removeListener(listener); }, { once: true });
  await refresh();
}
