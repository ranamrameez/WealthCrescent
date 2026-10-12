import { getScrapeConfig, getSyncConfig, setScrapeConfig, setSyncConfig, sendWorkerMessage } from './common.js';

export async function mountConfig(container) {
  const scrape = await getScrapeConfig();
  const sync = await getSyncConfig();
  container.innerHTML = `<h2>Configurations</h2><form>
    <div class="config-sections"><section class="config-section"><h3>Firebase pushes</h3><label>Minutes between Firebase pushes<input name="minPushIntervalMinutes" type="number" min="0" step="1" required></label>
    <label>Push timing<select name="pushTimingMode"><option value="random">Random (1-2x interval)</option><option value="constant">Constant interval</option></select></label>
    <p class="muted">Random push intervals vary between 1× and 2× this minimum. Constant timing uses the configured interval. Set 0 to sync after every automatic scrape.</p>
    </section><section class="config-section"><h3>Automatic scraping</h3><label>Scrape interval (seconds)<input name="scrapeIntervalSeconds" type="number" min="0" step="0.1" required></label><label><input name="scrapeOnPriceChange" type="checkbox"> Scrape on every price change</label><label><input name="respectTimeWindows" type="checkbox"> Follow Qatar time windows</label><p class="muted">0 disables periodic scraping; enable price-change scraping to collect updates as they appear. Price changes trigger collection immediately. Set Firebase push interval to 0 to sync each scrape. Keep the market tab open.</p></section><section class="config-section"><h3>Scraping windows (Qatar time)</h3><div class="windows"></div><button type="button" class="add-window secondary">Add time pair</button>
    <p class="muted">Automatic scraping runs within these windows. End times are exclusive; overnight pairs are supported. Manual scrape and push work outside these windows.</p>
    </section></div><section class="config-section"><h3>Market page</h3><div class="config-grid">${Object.keys(scrape).map(key => `<label>${({ targetUrl: 'Market-watch URL', rowSelector: 'Row selector', tickerSelector: 'Ticker selector', priceSelector: 'Price selector', changeSelector: 'Change % selector', nameSelector: 'Company name selector' })[key]}<input name="${key}" type="text" ${key === 'targetUrl' ? 'required' : ''}></label>`).join('')}</div>
    <p class="muted">Prices are detected automatically using named grid columns.</p>
    </section><button type="submit">Save configurations</button><span class="config-message" role="status"></span></form>`;
  const form = container.querySelector('form');
  let dirty = false;
  form.addEventListener('input', () => { dirty = true; });
  for (const [key, value] of Object.entries(scrape)) form.elements[key].value = value;
  form.elements.minPushIntervalMinutes.value = sync.minPushIntervalMinutes;
  form.elements.pushTimingMode.value = sync.pushTimingMode;
  form.elements.scrapeIntervalSeconds.value = sync.scrapeIntervalSeconds ?? 0;
  form.elements.scrapeOnPriceChange.checked = sync.scrapeOnPriceChange !== false;
  form.elements.respectTimeWindows.checked = sync.respectTimeWindows === true;
  const windows = container.querySelector('.windows');
  function addWindow(pair = { start: '09:30', end: '13:00' }) {
    const row = document.createElement('div'); row.className = 'row window';
    row.innerHTML = '<label>Start<input type="time" class="start" required></label><label>End<input type="time" class="end" required></label><button type="button" class="secondary">Remove</button>';
    row.querySelector('.start').value = pair.start; row.querySelector('.end').value = pair.end;
    row.querySelector('button').onclick = () => { dirty = true; row.remove(); }; windows.append(row);
  }
  sync.timeWindows.forEach(addWindow);
  chrome.storage.onChanged.addListener(async (changes,area) => {
    if (area !== 'local' || !(changes.extensionConfigOwner || changes.scrapeConfig || changes.syncConfig)) return;
    if (dirty && !changes.extensionConfigOwner) return;
    if (changes.extensionConfigOwner) dirty = false;
    const [scrape,sync] = await Promise.all([getScrapeConfig(),getSyncConfig()]);
    form.elements.targetUrl.value = scrape.targetUrl;
    form.elements.minPushIntervalMinutes.value = sync.minPushIntervalMinutes;
    form.elements.pushTimingMode.value = sync.pushTimingMode;
  form.elements.scrapeIntervalSeconds.value = sync.scrapeIntervalSeconds ?? 0;
  form.elements.scrapeOnPriceChange.checked = sync.scrapeOnPriceChange !== false;
  form.elements.respectTimeWindows.checked = sync.respectTimeWindows === true;
    windows.replaceChildren(); sync.timeWindows.forEach(addWindow);
  });
  container.querySelector('.add-window').onclick = () => { dirty = true; addWindow(); };
  form.onsubmit = async event => {
    event.preventDefault();
    const message = container.querySelector('.config-message');
    try {
      const targetUrl = new URL(form.elements.targetUrl.value.trim());
      if (targetUrl.origin !== 'https://webd.thegroup.com.qa') throw new Error('Use a market URL on https://webd.thegroup.com.qa.');
      const fields = Object.fromEntries(Object.keys(scrape).map(key => [key, form.elements[key].value.trim()]));
      for (const [key, value] of Object.entries(fields)) if (key.endsWith('Selector') && value) document.querySelector(value);
      await sendWorkerMessage({ type: 'SAVE_CONFIGS', scrape: fields, sync: { scrapeIntervalSeconds: Number(form.elements.scrapeIntervalSeconds.value), scrapeOnPriceChange: form.elements.scrapeOnPriceChange.checked, respectTimeWindows: form.elements.respectTimeWindows.checked, pushTimingMode: form.elements.pushTimingMode.value, minPushIntervalMinutes: Number(form.elements.minPushIntervalMinutes.value), timeWindows: Array.from(windows.children).map(row => ({ start: row.querySelector('.start').value, end: row.querySelector('.end').value })) } });
      dirty = false; message.textContent = ' Configurations saved.';
    } catch (error) { message.textContent = ` ${error.message}`; }
  };
}

export async function mountControls(container, { manualActions = false } = {}) {
  container.innerHTML = '<p class="run-state" role="status"></p><button class="start-control">Start scraping</button> <button class="stop-control secondary">Stop scraping</button><p class="control-error" role="alert"></p>';
  if (manualActions) {
    const actions = document.createElement('div'); actions.className = 'manual-actions';
    for (const [label, type, className] of [['Scrape now', 'SCRAPE_NOW_MANUAL', 'scrape-control'], ['Push now', 'PUSH_NOW', 'push-control']]) {
      const button = document.createElement('button'); button.textContent = label; button.className = className;
      button.onclick = async () => {
        button.disabled = true; container.querySelector('.control-error').textContent = '';
        try { await sendWorkerMessage({ type }); }
        catch (error) { container.querySelector('.control-error').textContent = error.message; }
        finally { button.disabled = false; }
      };
      actions.append(button);
    }
    container.querySelector('.run-state').after(actions);
  }
  async function refresh() {
    const config = await getSyncConfig();
    container.querySelector('.run-state').textContent = config.scrapingEnabled ? config.respectTimeWindows ? 'Scraping enabled (follows Qatar time windows)' : 'Scraping enabled (all day)' : 'Scraping stopped';
    container.querySelector('.start-control').disabled = config.scrapingEnabled;
    container.querySelector('.stop-control').disabled = !config.scrapingEnabled;
  }
  for (const [selector, type] of [['.start-control', 'START_SCRAPING'], ['.stop-control', 'STOP_SCRAPING']]) container.querySelector(selector).onclick = async () => {
    try {
      container.querySelector('.control-error').textContent = '';
      await sendWorkerMessage({ type });
      await refresh();
    } catch (error) { container.querySelector('.control-error').textContent = error.message; }
  };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.syncConfig) refresh(); });
  await refresh();
}
