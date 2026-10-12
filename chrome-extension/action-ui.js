// Shared feedback and lock for options and popup actions.
const localOperations = new Set();
let status = {}, renderVersion = 0, localAction = '';
const selectors = '#signInBtn, #signOutBtn, #testBtn, #editSelected, #deleteSelected, #deleteOutliers, #scrapeNowBtn, #pushNowBtn, .start-control, .scrape-control, .push-control, #configCard button';
const banner = document.createElement('p'); banner.className = 'action-status'; banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite');
document.querySelector('h1')?.after(banner);
if (!banner.isConnected) document.body.prepend(banner);
function busy() { return localOperations.size > 0 || status.actionBusy || status.cycleBusy; }
function render() {
  const active = busy(); document.body.setAttribute('aria-busy', String(active));
  const command = localAction || status.currentAction;
  const phase = command === 'STOP_SCRAPING' ? 'Stopping scraping' : localOperations.has('batch') ? 'Updating selected records' : command === 'SIGN_IN' || command === 'SIGN_UP' ? 'Signing in' : command === 'SAVE_CONFIGS' ? 'Saving configurations' : status.syncState === 'Syncing' ? 'Syncing prices' : status.scrapeState === 'Scraping' ? 'Scraping prices' : command === 'TEST_SCRAPE' ? 'Testing scrape' : 'Working';
  const text = active ? phase + ' - wait for completion.' : status.actionError ? 'Action failed: ' + status.actionError : status.actionCompletedAt ? 'Action complete. Scrape: ' + (status.scrapeState || 'Ready') + '. Sync: ' + (status.syncState || 'Ready') + '.' : 'Scrape: ' + (status.scrapeState || 'Watching prices') + '. Sync: ' + (status.syncState || 'Waiting') + '.';
  if (banner.textContent !== text) banner.textContent = text;
  for (const control of document.querySelectorAll(selectors)) {
    if (active) {
      if (!control.hasAttribute('data-action-locked')) { control.dataset.actionLocked = String(control.disabled); }
      if (!control.disabled) control.disabled = true;
    } else if (control.hasAttribute('data-action-locked')) {
      delete control.dataset.actionLocked;
      control.disabled = control.classList.contains('start-control') ? status.scrapingEnabled === true : control.id === 'deleteOutliers' ? control.dataset.previewStale === 'true' || !(parseInt(document.getElementById('outlierCount')?.textContent, 10) > 0) : control.id === 'editSelected' || control.id === 'deleteSelected' ? !(parseInt(document.getElementById('selectionInfo')?.textContent, 10) > 0) : false;
    }
  }
}
async function refresh() {
  const version = ++renderVersion;
  try { const stored = await chrome.storage.local.get(['status', 'syncConfig']); if (version !== renderVersion) return; status = { ...stored.status, scrapingEnabled: stored.syncConfig?.scrapingEnabled }; render(); }
  catch (error) { banner.textContent = error.message; }
}
document.addEventListener('extension-action', event => { if (event.detail.key === 'worker-message') localAction = event.detail.busy ? event.detail.action || '' : ''; if (event.detail.busy) localOperations.add(event.detail.key); else localOperations.delete(event.detail.key); render(); refresh(); });
document.addEventListener('click', event => {
  const control = event.target.closest?.(selectors);
  if (control && busy()) { event.preventDefault(); event.stopImmediatePropagation(); banner.textContent = 'Another action is running. Wait for completion.'; }
}, true);
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.status || changes.syncConfig)) refresh(); });
new MutationObserver(render).observe(document.body, { subtree: true, childList: true });
refresh();
