import { getScrapeConfig, getSyncConfig, setScrapeConfig, setSyncConfig } from './common.js';

export async function mountConfig(container) {
  const scrape = await getScrapeConfig();
  const sync = await getSyncConfig();
  container.innerHTML = `<h2>Configurations</h2><form>
    <label>Minimum minutes between Firebase pushes<input name="minPushIntervalMinutes" type="number" min="2" step="1" required></label>
    <p class="muted">Push intervals vary between 1× and 2× this minimum. Collection runs every 45–90 seconds.</p>
    <h3>Scraping windows (Qatar time)</h3><div class="windows"></div><button type="button" class="add-window secondary">Add time pair</button>
    <p class="muted">Automatic scraping runs within these windows. End times are exclusive; overnight pairs are supported. Manual scrape and push work outside these windows.</p>
    ${Object.keys(scrape).map(key => `<label>${({ targetUrl: 'Market-watch URL', rowSelector: 'Row selector', tickerSelector: 'Ticker selector', priceSelector: 'Price selector', changeSelector: 'Change % selector', nameSelector: 'Company name selector' })[key]}<input name="${key}" type="text" ${key === 'targetUrl' ? 'required' : ''}></label>`).join('')}
    <p class="muted">Leave selectors blank for auto-detection. Selectors are relative to each row.</p>
    <button type="submit">Save configurations</button><span class="config-message" role="status"></span></form>`;
  const form = container.querySelector('form');
  for (const [key, value] of Object.entries(scrape)) form.elements[key].value = value;
  form.elements.minPushIntervalMinutes.value = sync.minPushIntervalMinutes;
  const windows = container.querySelector('.windows');
  function addWindow(pair = { start: '09:30', end: '13:00' }) {
    const row = document.createElement('div'); row.className = 'row window';
    row.innerHTML = '<label>Start<input type="time" class="start" required></label><label>End<input type="time" class="end" required></label><button type="button" class="secondary">Remove</button>';
    row.querySelector('.start').value = pair.start; row.querySelector('.end').value = pair.end;
    row.querySelector('button').onclick = () => row.remove(); windows.append(row);
  }
  sync.timeWindows.forEach(addWindow);
  container.querySelector('.add-window').onclick = () => addWindow();
  form.onsubmit = async event => {
    event.preventDefault();
    const message = container.querySelector('.config-message');
    try {
      const targetUrl = new URL(form.elements.targetUrl.value.trim());
      if (targetUrl.origin !== 'https://webd.thegroup.com.qa') throw new Error('Use a market URL on https://webd.thegroup.com.qa.');
      const fields = Object.fromEntries(Object.keys(scrape).map(key => [key, form.elements[key].value.trim()]));
      for (const [key, value] of Object.entries(fields)) if (key.endsWith('Selector') && value) document.querySelector(value);
      await setSyncConfig({ minPushIntervalMinutes: Number(form.elements.minPushIntervalMinutes.value), timeWindows: Array.from(windows.children).map(row => ({ start: row.querySelector('.start').value, end: row.querySelector('.end').value })) });
      await setScrapeConfig(fields); message.textContent = ' Saved.';
    } catch (error) { message.textContent = ` ${error.message}`; }
  };
}

export async function mountControls(container) {
  container.innerHTML = '<p class="run-state" role="status"></p><button class="start-control">Start scraping</button> <button class="stop-control secondary">Stop scraping</button><p class="control-error" role="alert"></p>';
  async function refresh() {
    const config = await getSyncConfig();
    container.querySelector('.run-state').textContent = config.scrapingEnabled ? 'Scraping enabled (follows Qatar time windows)' : 'Scraping stopped';
    container.querySelector('.start-control').disabled = config.scrapingEnabled;
    container.querySelector('.stop-control').disabled = !config.scrapingEnabled;
  }
  for (const [selector, type] of [['.start-control', 'START_SCRAPING'], ['.stop-control', 'STOP_SCRAPING']]) container.querySelector(selector).onclick = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type });
      if (!response?.ok) throw new Error(response?.error || 'Operation failed');
      await refresh();
    } catch (error) { container.querySelector('.control-error').textContent = error.message; }
  };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.syncConfig) refresh(); });
  await refresh();
}
