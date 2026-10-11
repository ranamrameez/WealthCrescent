import { getActivity, qatarDate } from './activity.js';
import { summarizeAuditToday } from './audit.js';
import { getStatus, getSyncConfig, sendWorkerMessage } from './common.js';

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
    evidencePending = Promise.allSettled([summarizeAuditToday(), sendWorkerMessage({ type: 'GET_ACTIVITY_SUMMARY' })]).then(([audit, firebase]) => {
      evidenceCache = { at: Date.now(), date: qatarDate(), audit: audit.status === 'fulfilled' ? audit.value : null, firebase: firebase.status === 'fulfilled' ? firebase.value : null, error: firebase.status === 'rejected' ? firebase.reason.message : '' };
      return evidenceCache;
    }).finally(() => { evidencePending = null; });
    return evidencePending;
  }
  async function render() {
    const [activity, status, config, recorded] = await Promise.all([getActivity(), getStatus(), getSyncConfig(), evidence()]);
    if (disposed) return;
    const daily = activity.daily;
    const tracked = !!activity.trackingStartedAt;
    const stale = !!status.lastScrapeAt && (!activity.lastScrapeAt || status.lastScrapeAt > activity.lastScrapeAt + 5000);
    const untracked = 'Unavailable (not tracked)';
    const lastSyncAt = activity.lastSyncAt || (status.lastPushCount > 0 ? status.lastPushAt : null);
    const lines = [
      ['Since last sync', elapsed(lastSyncAt)],
      ['Since last scrape', elapsed(activity.lastScrapeAt || status.lastScrapeAt)],
      ['Local scrapes recorded today', recorded.audit ? `${recorded.audit.scrapeCount} (${recorded.audit.rowCount} raw rows)` : 'Unavailable'],
      ['Firebase history points today', recorded.firebase ? String(recorded.firebase.historyPointsToday) : 'Unavailable'],
      ['Scrapes counted today', tracked ? `${daily.scrapeCount} (${daily.scrapedRows} ticker rows)` : untracked],
      ['Syncs counted today', tracked ? `${daily.syncCount} (${daily.syncedRows} ticker writes)` : untracked],
      ['Sync attempts today', tracked ? `${daily.syncAttempts}; ${daily.syncFailures} failed or partial` : untracked],
      ['Scrape failures / tests today', tracked ? `${daily.scrapeFailures} / ${daily.testCount}` : untracked],
      ['Next sync due', !config.scrapingEnabled ? 'Stopped' : status.nextPushAt ? status.nextPushAt <= Date.now() ? 'On next eligible scrape' : `In ${elapsed(Date.now(), status.nextPushAt)}` : 'On next eligible scrape'],
    ];
    const heading = document.createElement('h2'); heading.textContent = 'Activity';
    const list = document.createElement('dl'); list.className = 'stats-grid';
    for (const [label, value] of lines) {
      const term = document.createElement('dt'); term.textContent = label;
      const detail = document.createElement('dd'); detail.textContent = value;
      list.append(term, detail);
    }
    const note = document.createElement('p'); note.className = 'muted';
    note.textContent = `Today uses Qatar time. Statistics cover all tickers; table filters do not affect them. Local records count retained scrape batches. Firebase points are shared stored price changes, not sync attempts. ${tracked ? `Activity counters started ${new Date(activity.trackingStartedAt).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' })}; tests are included.` : 'Activity counters have not started; reload the extension in chrome://extensions to load the updated worker.'}${stale ? ' Saved status is newer than the activity counters; reload the extension to resume tracking.' : ''}`;
    const error = document.createElement('p'); error.className = 'error'; error.textContent = [status.lastError, recorded.error].filter(Boolean).join(' ');
    container.replaceChildren(heading, list, note, error);
  }
  const refresh = () => render().catch(error => { if (!disposed) container.textContent = `Cannot load statistics: ${error.message}`; });
  const listener = (changes, area) => { if (area === 'local' && (changes.activity || changes.status || changes.syncConfig || changes.auditUpdatedAt || changes.auth)) { evidenceCache = null; refresh(); } };
  chrome.storage.onChanged.addListener(listener);
  const timer = setInterval(refresh, 5000);
  window.addEventListener('pagehide', () => { disposed = true; clearInterval(timer); chrome.storage.onChanged.removeListener(listener); }, { once: true });
  await refresh();
}
