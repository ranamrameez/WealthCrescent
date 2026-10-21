import { resolveActionFeedback } from './notifications.js';
// Shared feedback and lock for options and popup actions.
const localOperations = new Set();
let status = {}, renderVersion = 0, localAction = '';
const selectors = '#signInBtn, #signOutBtn, #testBtn, #editSelected, #deleteSelected, #deleteOutliers, #scrapeNowBtn, #pushNowBtn, .start-control, .scrape-control, .push-control, #configCard button';
const banner = document.createElement('div'); banner.className = 'wc-toast action-status'; banner.hidden = true;
const message = document.createElement('span'); message.className = 'wc-toast-message'; message.setAttribute('role','status'); message.setAttribute('aria-live','polite');
const dismiss = document.createElement('button'); dismiss.className = 'wc-toast-dismiss'; dismiss.textContent = 'Dismiss'; dismiss.title = 'Dismiss this notification';
banner.append(message, dismiss); document.body.append(banner);
let timer, lastNotice = '', dismissedNotice = '', initialRead = true, userActionSeen = false, seenCompletion = 0, seenError = '';
function notify(feedback, key) {
  if (key === dismissedNotice || key === lastNotice) return;
  lastNotice = key; const labels = { progress:'In progress', success:'Success', warning:'Warning', error:'Error', stopped:'Stopped', info:'Notice' }; message.textContent = labels[feedback.type] + ': ' + feedback.message; message.title = feedback.message; banner.dataset.type = feedback.type; banner.hidden = false;
  message.setAttribute('role', feedback.type === 'error' ? 'alert' : 'status');
  if (typeof clearTimeout === 'function') clearTimeout(timer);
  if (typeof setTimeout === 'function' && !['progress','error'].includes(feedback.type)) timer = setTimeout(() => { banner.hidden = true; }, 7000);
}
dismiss.onclick = () => { dismissedNotice = lastNotice; banner.hidden = true; };

function busy() { return localOperations.size > 0 || status.actionBusy || status.cycleBusy; }
function isRecordMutation(control) { return !!control?.matches?.('#editSelected, #deleteSelected, #deleteOutliers'); }
function render() {
  const active = busy(); document.body.setAttribute('aria-busy', String(active));
  const command = localAction || status.currentAction;
  const feedback = resolveActionFeedback(status, { active: localOperations.size > 0 || status.actionBusy, command, batch: localOperations.has('batch') });
  if (localOperations.size || status.actionBusy) { userActionSeen = true; notify(feedback, 'progress:' + command + ':' + feedback.message); }
  else if (userActionSeen || (status.actionCompletedAt || 0) > seenCompletion || (status.actionCompletedAt && status.actionError && status.actionError !== seenError)) { notify(feedback, String(status.actionCompletedAt || 'local') + ':' + feedback.type + ':' + feedback.message); seenCompletion = status.actionCompletedAt || 0; seenError = status.actionError || ''; userActionSeen = false; }
  for (const control of document.querySelectorAll(selectors)) {
    const locked = localOperations.size > 0 || status.actionBusy || (status.cycleBusy && !isRecordMutation(control));
    if (locked) {
      if (!control.hasAttribute('data-action-locked')) { control.dataset.actionLocked = String(control.disabled); }
      if (!control.disabled) control.disabled = true;
    } else if (control.hasAttribute('data-action-locked')) {
      delete control.dataset.actionLocked;
      control.disabled = control.classList.contains('start-control') ? status.scrapingEnabled === true : control.id === 'deleteOutliers' ? control.dataset.previewStale === 'true' || !(Number(control.dataset.flaggedCount) > 0) : control.id === 'editSelected' || control.id === 'deleteSelected' ? !(parseInt(document.getElementById('selectionInfo')?.textContent, 10) > 0) : false;
    }
  }
}
async function refresh() {
  const version = ++renderVersion;
  try { const stored = await chrome.storage.local.get(['status', 'syncConfig']); if (version !== renderVersion) return; status = { ...stored.status, scrapingEnabled: stored.syncConfig?.scrapingEnabled }; if (initialRead) { initialRead = false; seenCompletion = status.actionCompletedAt || 0; seenError = status.actionError || ''; if (status.actionCompletedAt) dismissedNotice = String(status.actionCompletedAt) + ':' + resolveActionFeedback(status).type + ':' + resolveActionFeedback(status).message; } render(); }
  catch (error) { notify({type:'error',message:error.message}, 'load-error:' + error.message); }
}
document.addEventListener('extension-action', event => { if (event.detail.busy) for (const error of document.querySelectorAll('#actionError,.control-error')) error.textContent = ''; if (event.detail.key === 'worker-message') localAction = event.detail.busy ? event.detail.action || '' : ''; if (event.detail.busy) localOperations.add(event.detail.key); else localOperations.delete(event.detail.key); render(); refresh(); });
document.addEventListener('click', event => {
  const control = event.target.closest?.(selectors);
  const conflicting = localOperations.size > 0 || status.actionBusy || (status.cycleBusy && !isRecordMutation(control));
  if (control && conflicting) { event.preventDefault(); event.stopImmediatePropagation(); notify({ type:'warning', message:'Another action is running. Wait for it to finish.' }, 'busy-warning'); }
}, true);
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.status || changes.syncConfig)) refresh(); });
new MutationObserver(render).observe(document.body, { subtree: true, childList: true });
refresh();
