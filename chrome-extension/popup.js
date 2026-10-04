import { mountControls } from './config-ui.js';
import { sendWorkerMessage } from './common.js';
const error = document.getElementById('actionError');
for (const [id, type] of [['scrapeNowBtn', 'SCRAPE_NOW_MANUAL'], ['pushNowBtn', 'PUSH_NOW']]) {
  const button = document.getElementById(id);
  button.onclick = async () => {
    button.disabled = true; error.textContent = '';
    try { await sendWorkerMessage({ type }); }
    catch (cause) { error.textContent = cause.message; }
    finally { button.disabled = false; }
  };
}
mountControls(document.getElementById('scrapingControls')).catch(cause => { error.textContent = cause.message; });
