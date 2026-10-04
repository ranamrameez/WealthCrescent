import { mountConfig, mountControls } from './config-ui.js';
import { getAuth, getStatus, getScrapeConfig } from './common.js';

const $ = (id) => document.getElementById(id);

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function fmtAgo(ts) {
  if (!ts) return 'never';
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

function fmtIn(ts) {
  if (!ts) return '—';
  const sec = Math.round((ts - Date.now()) / 1000);
  if (sec <= 0) return 'due now';
  const min = Math.round(sec / 60);
  if (min < 1) return `${sec}s`;
  return `${min}m`;
}

async function renderStatus() {
  const status = await getStatus();
  const lines = [
    `Last scrape: ${fmtAgo(status.lastScrapeAt)}${status.lastScrapeCount != null ? ` — ${status.lastScrapeCount} ticker(s)` : ''}${status.lastStrategy ? ` (${status.lastStrategy})` : ''}`,
    `Last push: ${fmtAgo(status.lastPushAt)}${status.lastPushCount != null ? ` — ${status.lastPushCount}/${status.lastPushTotal} ticker(s), ${status.lastNamesCount || 0} name(s)` : ''}`,
    `Next push due: ${fmtIn(status.nextPushAt)}`,
  ];
  $('statusLines').replaceChildren(...lines.map(line => { const div = document.createElement('div'); div.textContent = line; return div; }));
  $('statusError').textContent = status.lastError || '';
}

async function renderAuthState() {
  const auth = await getAuth();
  $('signedOutView').hidden = !!auth;
  $('signedInView').hidden = !auth;
  if (auth) {
    $('emailLabel').textContent = auth.email || auth.uid;

    await renderStatus();
  }
}

$('createNew').addEventListener('change', (e) => {
  $('createNewHint').hidden = !e.target.checked;
  $('signInBtn').textContent = e.target.checked ? 'Create account' : 'Sign in';
});

$('signInBtn').addEventListener('click', async () => {
  $('signInError').textContent = '';
  $('signInBtn').disabled = true;
  const email = $('email').value.trim();
  const password = $('password').value;
  const type = $('createNew').checked ? 'SIGN_UP' : 'SIGN_IN';
  const res = await sendMessage({ type, email, password });
  $('signInBtn').disabled = false;
  if (!res?.ok) {
    $('signInError').textContent = res?.error || 'Sign-in failed.';
    return;
  }
  $('password').value = '';
  await renderAuthState();
});

$('signOutBtn').addEventListener('click', async () => {
  await sendMessage({ type: 'SIGN_OUT' });
  await renderAuthState();
});



$('scrapeNowBtn').addEventListener('click', async () => {
  $('scrapeNowBtn').disabled = true;
  await sendMessage({ type: 'SCRAPE_NOW_MANUAL' });
  $('scrapeNowBtn').disabled = false;
  await renderStatus();
});

$('pushNowBtn').addEventListener('click', async () => {
  $('pushNowBtn').disabled = true;
  await sendMessage({ type: 'PUSH_NOW' });
  $('pushNowBtn').disabled = false;
  await renderStatus();
});

$('openPageLink').addEventListener('click', async (e) => {
  e.preventDefault();
  const cfg = await getScrapeConfig();
  chrome.tabs.create({ url: cfg.targetUrl });
});

$('openOptionsLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

renderAuthState();
// Keep the "ago"/"due in" lines fresh while the popup is open.
setInterval(() => {
  if (!$('signedInView').hidden) renderStatus();
}, 5000);

mountConfig($('configCard'));
mountControls($('scrapingControls'));
