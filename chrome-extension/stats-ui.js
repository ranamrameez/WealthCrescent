import { getActivity } from './activity.js';
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
  async function render() {
    const [activity, status, config] = await Promise.all([getActivity(), getStatus(), getSyncConfig()]);
    if (disposed) return;
    const daily = activity.daily;
    const lastSyncAt = activity.lastSyncAt || (status.lastPushCount > 0 ? status.lastPushAt : null);
    const lines = [
      ['Since last sync', elapsed(lastSyncAt)],
      ['Since last scrape', elapsed(activity.lastScrapeAt || status.lastScrapeAt)],
      ['Scrapes today', `${daily.scrapeCount} (${daily.scrapedRows} ticker rows)`],
      ['Syncs today', `${daily.syncCount} (${daily.syncedRows} ticker writes)`],
      ['Sync attempts today', `${daily.syncAttempts}; ${daily.syncFailures} failed or partial`],
      ['Scrape failures / tests today', `${daily.scrapeFailures} / ${daily.testCount}`],
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
    note.textContent = `Today uses Qatar time. Counts start with this update${activity.trackingStartedAt ? ` (${new Date(activity.trackingStartedAt).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' })})` : ''}. Test scrapes are included; a sync counts when at least one price is written.`;
    const error = document.createElement('p'); error.className = 'error'; error.textContent = status.lastError || '';
    container.replaceChildren(heading, list, note, error);
  }
  const refresh = () => render().catch(error => { if (!disposed) container.textContent = `Cannot load statistics: ${error.message}`; });
  const listener = (changes, area) => { if (area === 'local' && (changes.activity || changes.status || changes.syncConfig)) refresh(); };
  chrome.storage.onChanged.addListener(listener);
  const timer = setInterval(refresh, 5000);
  window.addEventListener('pagehide', () => { disposed = true; clearInterval(timer); chrome.storage.onChanged.removeListener(listener); }, { once: true });
  await refresh();
}
