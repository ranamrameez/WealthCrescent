import { saveAudit } from './audit.js';
import { pushedRecords, paginatePushed, priceDeviation } from './pushed-data.js';
import { setSyncConfig, withinScrapingWindow } from './common.js';
// Background service worker: owns the collect → (throttled, randomized)
// push loop, Firebase Auth (email/password, via plain REST calls — no SDK
// bundling needed in an MV3 service worker), and the safe read-modify-write
// against the shared `stockData/QSE` RTDB node. The popup and options pages
// talk to this file only via chrome.runtime messages; they never touch
// Firebase or chrome.alarms directly.

import {
  FIREBASE_API_KEY,
  RTDB_BASE_URL,
  IDENTITY_TOOLKIT_BASE,
  SECURE_TOKEN_BASE,
  COLLECT_MIN_SECONDS,
  COLLECT_MAX_SECONDS,
  priceCachePath,
  priceHistoryPath,
  tickerNamePath,
  SHARED_LAST_UPDATED_PATH,
  getAuth,
  setAuth,
  clearAuth,
  getScrapeConfig,
  getSyncConfig,
  patchStatus,
  getStatus,
  randInt,
} from './common.js';

const COLLECT_ALARM = 'collect-tick';
let pushedSnapshot = null;

async function conditionalRead(path, auth) {
  const url = `${RTDB_BASE_URL}/${path}.json?auth=${encodeURIComponent(auth.idToken)}`;
  const response = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } });
  if (!response.ok) throw new Error(`Database read failed (${response.status})`);
  const etag = response.headers.get('ETag');
  if (!etag) throw new Error('Database did not return a version; refresh and try again.');
  return { url, etag, value: await response.json() };
}

async function conditionalWrite(state, value) {
  const response = await fetch(state.url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': state.etag }, body: JSON.stringify(value) });
  if (!response.ok) throw new Error(response.status === 412 ? 'Record changed since it was read. Refresh and try again.' : `Database update failed (${response.status})`);
}

async function mutatePushedData(entries, operation, price) {
  if (!['delete', 'edit'].includes(operation) || !Array.isArray(entries) || !entries.length || entries.length > 100) throw new Error('Select between 1 and 100 records.');
  if (operation === 'edit' && (!Number.isFinite(price) || price <= 0)) throw new Error('Price must be a positive number.');
  const auth = await getFreshAuth();
  if (!auth) throw new Error('Sign in to edit Firebase records.');
  const results = [];
  for (const entry of entries) {
    try {
      if (!/^[A-Z][A-Z0-9]{1,5}$/.test(entry.ticker) || !['history', 'current'].includes(entry.kind)) throw new Error('Invalid record.');
      if (entry.kind === 'current') {
        const state = await conditionalRead(priceCachePath(entry.ticker), auth);
        if (state.value !== entry.price) throw new Error('Current price changed. Refresh first.');
        await conditionalWrite(state, operation === 'delete' ? null : price);
      } else {
        const state = await conditionalRead(priceHistoryPath(entry.ticker), auth);
        const points = state.value || {};
        if (!/^[A-Za-z0-9_-]+$/.test(String(entry.key)) || !Object.hasOwn(points, entry.key)) throw new Error('Invalid history key.');
        const point = points[entry.key];
        if (!point || point.price !== entry.price || (entry.time && point.time !== entry.time)) throw new Error('History record changed. Refresh first.');
        const ordered = () => Object.entries(points).filter(([, p]) => p && Number.isFinite(p.price)).sort((a, b) => String(a[1].time || a[1].date || '').localeCompare(String(b[1].time || b[1].date || '')));
        const wasLatest = ordered().at(-1)?.[0] === String(entry.key);
        points[entry.key] = operation === 'delete' ? null : { ...point, price, originalPrice: point.originalPrice ?? point.price, editedAt: new Date().toISOString() };
        await conditionalWrite(state, points);
        if (wasLatest) {
          try {
            const current = await conditionalRead(priceCachePath(entry.ticker), auth);
            if (current.value === entry.price) await conditionalWrite(current, ordered().at(-1)?.[1].price ?? null);
          } catch (error) { results.push({ id: entry.id, ok: true, warning: `History updated; current price needs review: ${error.message}` }); continue; }
        }
      }
      results.push({ id: entry.id, ok: true });
    } catch (error) { results.push({ id: entry.id, ok: false, error: error.message }); }
  }
  pushedSnapshot = null;
  return results;
}

async function queryPushedData(filters, refresh = false) {
  const auth = await getFreshAuth();
  if (!auth) throw new Error('Sign in on this page to view the data already pushed to Firebase.');
  if (refresh || !pushedSnapshot || pushedSnapshot.uid !== auth.uid || Date.now() - pushedSnapshot.at > 60000) {
    const paths = ['priceHistory', 'prices', 'tickerNames', 'pricesUpdatedAt'];
    const values = await Promise.all(paths.map(async path => {
      const response = await fetch(`${RTDB_BASE_URL}/stockData/QSE/${path}.json?auth=${encodeURIComponent(auth.idToken)}`);
      if (!response.ok) throw new Error(`Cannot read Firebase ${path} (${response.status}). Check that this account has database read access.`);
      return response.json();
    }));
    pushedSnapshot = { uid: auth.uid, at: Date.now(), rows: pushedRecords({ history: values[0], prices: values[1], names: values[2], updatedAt: values[3] }) };
  }
  return paginatePushed(pushedSnapshot.rows, filters);
}

// ---------- Auth (Firebase Identity Toolkit REST, no SDK needed) ----------

function normalizeAuthResponse(json, fallbackEmail) {
  const idToken = json.idToken || json.id_token;
  const refreshToken = json.refreshToken || json.refresh_token;
  const uid = json.localId || json.user_id;
  const expiresInSec = Number(json.expiresIn || json.expires_in || 3600);
  return {
    idToken,
    refreshToken,
    uid,
    email: json.email || fallbackEmail || null,
    // Refresh a minute early rather than racing an exact expiry.
    expiresAt: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
  };
}

async function signInWithPassword(email, password) {
  const res = await fetch(`${IDENTITY_TOOLKIT_BASE}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || `Sign-in failed (${res.status})`;
    throw new Error(friendlyAuthError(msg));
  }
  const auth = normalizeAuthResponse(json, email);
  await setAuth(auth);
  return auth;
}

async function signUpWithPassword(email, password) {
  const res = await fetch(`${IDENTITY_TOOLKIT_BASE}/accounts:signUp?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || `Sign-up failed (${res.status})`;
    throw new Error(friendlyAuthError(msg));
  }
  const auth = normalizeAuthResponse(json, email);
  await setAuth(auth);
  return auth;
}

function friendlyAuthError(code) {
  const map = {
    EMAIL_NOT_FOUND: 'No account with that email.',
    INVALID_PASSWORD: 'Wrong password.',
    INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
    USER_DISABLED: 'This account has been disabled.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts — try again in a bit.',
    EMAIL_EXISTS: 'An account with that email already exists — sign in instead.',
    INVALID_EMAIL: 'That email address looks invalid.',
  };
  if (map[code]) return map[code];
  if (typeof code === 'string' && code.startsWith('WEAK_PASSWORD')) return 'Password must be at least 6 characters.';
  return code;
}

async function refreshAuth(auth) {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refreshToken });
  const res = await fetch(`${SECURE_TOKEN_BASE}/token?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    // Refresh token itself is no longer valid — the user needs to sign in again.
    await clearAuth();
    throw new Error('Signed out (token expired) — sign in again from the popup.');
  }
  const next = normalizeAuthResponse(json, auth.email);
  await setAuth(next);
  return next;
}

/** Returns a currently-valid idToken, refreshing first if it's near expiry.
 * Returns null if never signed in; throws if refresh itself fails (caller
 * should surface that as a "please sign in again" state). */
async function getFreshAuth() {
  const auth = await getAuth();
  if (!auth) return null;
  if (Date.now() < auth.expiresAt) return auth;
  return refreshAuth(auth);
}

// ---------- RTDB REST helpers ----------

async function putScalar(path, value, idToken) {
  const res = await fetch(`${RTDB_BASE_URL}/${path}.json?auth=${idToken}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`RTDB write failed for ${path}: ${res.status}`);
}

/** Safe read-modify-write of a shared array using RTDB's conditional-write
 * support (an ETag from a GET, sent back as `if-match` on the PUT) so two
 * concurrent writers (e.g. two people each running this extension) can't
 * silently clobber each other's append — one gets a 412 and retries against
 * the now-current value instead. Retries once; on a second conflict it just
 * skips this ticker for this cycle rather than looping forever, since the
 * next scheduled push will pick it up anyway. */
async function appendHistoryPointSafely(ticker, point, idToken) {
  const url = `${RTDB_BASE_URL}/${priceHistoryPath(ticker)}.json?auth=${idToken}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const getRes = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } });
    if (!getRes.ok) throw new Error(`RTDB read failed for ${ticker} history: ${getRes.status}`);
    const etag = getRes.headers.get('ETag');
    const current = (await getRes.json()) || [];
    const entries = Object.entries(current).filter(([, value]) => value && Number.isFinite(value.price));
    const last = entries.sort((a, b) => String(a[1].time || a[1].date || '').localeCompare(String(b[1].time || b[1].date || ''))).at(-1)?.[1];
    // Skip appending an identical consecutive price (e.g. no change since
    // the last push) so the array doesn't grow forever on a quiet ticker.
    if (last && last.price === point.price) return { appended: false };
    const keys = Object.keys(current);
    const nextKey = keys.every(key => /^\d+$/.test(key)) ? String(Math.max(-1, ...keys.map(Number)) + 1) : String(Date.now());
    const next = { ...current, [nextKey]: point };
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'if-match': etag },
      body: JSON.stringify(next),
    });
    if (putRes.ok) return { appended: true };
    if (putRes.status !== 412) throw new Error(`RTDB write failed for ${ticker} history: ${putRes.status}`);
    // 412 Precondition Failed — someone else wrote in between; retry once.
  }
  return { appended: false, conflicted: true };
}

async function pushRows(rows) {
  const auth = await getFreshAuth();
  if (!auth) throw new Error('Not signed in — open the popup and sign in to push scraped prices.');
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  let pushed = 0;
  let namesPushed = 0;
  const errors = [];
  for (const row of rows) {
    try {
      const previousResponse = await fetch(`${RTDB_BASE_URL}/${priceCachePath(row.ticker)}.json?auth=${encodeURIComponent(auth.idToken)}`);
      if (!previousResponse.ok) throw new Error(`Cannot read previous price (${previousResponse.status})`);
      const previousPrice = await previousResponse.json();
      const point = { date: today, time: nowIso, price: row.price, priceKey: row.priceKey || null, raw: row.raw || [], ...priceDeviation(row.price, previousPrice) };
      await putScalar(priceCachePath(row.ticker), row.price, auth.idToken);
      await appendHistoryPointSafely(row.ticker, point, auth.idToken);
      pushedSnapshot = null;
      pushed++;
    } catch (e) {
      errors.push(`${row.ticker}: ${e.message || e}`);
    }
    // Ticker name is a best-effort extra on top of the price push above —
    // a name-write failure (or a row with no scraped name at all) never
    // blocks or fails the price push for that same ticker.
    const name = row.name && row.name.trim();
    if (name) {
      try {
        await putScalar(tickerNamePath(row.ticker), name, auth.idToken);
        namesPushed++;
      } catch (e) {
        errors.push(`${row.ticker} (name): ${e.message || e}`);
      }
    }
  }
  try {
    await putScalar(SHARED_LAST_UPDATED_PATH, nowIso, auth.idToken);
  } catch (e) {
    // Non-critical — the per-ticker writes already landed.
  }
  return { pushed, namesPushed, total: rows.length, errors };
}

// ---------- Scraping (delegates to the content script) ----------

async function findTargetTab(targetUrl) {
  let originPattern = 'https://webd.thegroup.com.qa/*';
  try {
    originPattern = `${new URL(targetUrl).origin}/*`;
  } catch (e) {
    // fall back to the default pattern above
  }
  const tabs = await chrome.tabs.query({ url: originPattern });
  if (!tabs.length) return null;
  const exact = tabs.find((t) => t.url && t.url.startsWith(targetUrl));
  return exact || tabs[0];
}

/** Chrome's own `chrome.runtime.lastError.message` for a tab whose content
 * script isn't (or is no longer) listening is the literal, developer-facing
 * string "Could not establish connection. Receiving end does not exist." —
 * meaningless to a non-technical user and, worse, misleading: it reads like
 * a one-off glitch, but the two real causes are both persistent until fixed
 * (a stale content script from before the extension was loaded/reloaded, or
 * a tab on a URL under the right domain that doesn't match the content
 * script's own narrower `matches` pattern in manifest.json — reloading that
 * tab would never help). Recognize it and give the one actionable fix that
 * covers the common case; anything else passes through unchanged so a real,
 * different error is never hidden behind a wrong hint. */
function friendlyScrapeError(rawError) {
  if (rawError && /Could not establish connection/i.test(rawError)) {
    return 'Lost the connection to the market page — reload that tab (F5) and try again. If it keeps happening, check the tab is on the exact market-watch URL configured in Options.';
  }
  return rawError;
}

async function scrapeTab(tab, overrideConfig) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_NOW', config: overrideConfig }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: friendlyScrapeError(chrome.runtime.lastError.message) });
        return;
      }
      resolve(response || { ok: false, error: 'No response from page' });
    });
  });
}

// ---------- The collect → throttled/randomized push cycle ----------

let cycleRunning = false;
async function runCycle(options = {}) {
  if (cycleRunning) return;
  cycleRunning = true;
  try { await collectCycle(options); } finally { cycleRunning = false; await scheduleNextCollect(); }
}
async function collectCycle({ forcePush = false, manual = false } = {}) {
  const config = await getSyncConfig();
  if (!manual && (!config.scrapingEnabled || !withinScrapingWindow(config))) {
    await scheduleNextCollect();
    return;
  }
  const scrapeConfig = await getScrapeConfig();
  const tab = await findTargetTab(scrapeConfig.targetUrl);
  if (!tab) {
    await patchStatus({ lastError: 'No matching tab open — open the market page for auto-refresh to work.' });
    await scheduleNextCollect();
    return;
  }

  const result = await scrapeTab(tab);
  if (!result.ok) {
    await patchStatus({ lastError: `Scrape failed: ${result.error}` });
    scheduleNextCollect();
    return;
  }

  await saveAudit(result, tab.url, manual ? 'manual' : 'automatic');
  const rows = result.rows || [];
  await patchStatus({
    lastScrapeAt: Date.now(),
    lastScrapeCount: rows.length,
    lastStrategy: result.strategy,
    lastError: rows.length ? '' : 'Scraped 0 rows — the page layout may not match; tune selectors in Options.',
  });

  if (!rows.length) {
    scheduleNextCollect();
    return;
  }

  const status = await getStatus();
  const syncConfig = await getSyncConfig();
  const due = forcePush || !status.nextPushAt || Date.now() >= status.nextPushAt;

  if (due && (manual || (await getSyncConfig()).scrapingEnabled)) {
    try {
      const { pushed, namesPushed, total, errors } = await pushRows(rows);
      const floorMs = syncConfig.minPushIntervalMinutes * 60000;
      // Randomized gap: between 1x and 2x the configured floor, re-rolled
      // fresh after every push — never a perfectly predictable period.
      const nextPushAt = Date.now() + floorMs + randInt(0, floorMs);
      await patchStatus({
        lastPushAt: Date.now(),
        lastPushCount: pushed,
        lastPushTotal: total,
        lastNamesCount: namesPushed,
        nextPushAt,
        lastError: errors.length ? `${errors.length} ticker(s) failed to push (see console).` : '',
      });
      if (errors.length) console.warn('[thegroup-price-sync] push errors:', errors);
    } catch (e) {
      await patchStatus({ lastError: e.message || String(e) });
    }
  }

  await scheduleNextCollect();
}

async function scheduleNextCollect() {
  if (!(await getSyncConfig()).scrapingEnabled) { await chrome.alarms.clear(COLLECT_ALARM); return; }
  const delaySec = randInt(COLLECT_MIN_SECONDS, COLLECT_MAX_SECONDS);
  chrome.alarms.create(COLLECT_ALARM, { when: Date.now() + delaySec * 1000 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === COLLECT_ALARM) runCycle().catch(e => patchStatus({ lastError: e.message || String(e) }));
});

chrome.runtime.onInstalled.addListener(() => scheduleNextCollect());
chrome.runtime.onStartup.addListener(() => scheduleNextCollect());

// ---------- Messages from popup.js / options.js ----------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'START_SCRAPING': {
        await setSyncConfig({ scrapingEnabled: true });
        await runCycle();
        await scheduleNextCollect();
        sendResponse({ ok: true });
        break;
      }
      case 'STOP_SCRAPING': {
        await setSyncConfig({ scrapingEnabled: false });
        await chrome.alarms.clear(COLLECT_ALARM);
        sendResponse({ ok: true });
        break;
      }
      case 'GET_PUSHED_DATA': {
        sendResponse({ ok: true, ...await queryPushedData(message.filters || {}, !!message.refresh) });
        break;
      }
      case 'MUTATE_PUSHED_DATA': {
        sendResponse({ ok: true, results: await mutatePushedData(message.entries, message.operation, message.price) });
        break;
      }
      case 'SIGN_IN': {
        try {
          const auth = await signInWithPassword(message.email, message.password);
          sendResponse({ ok: true, email: auth.email, uid: auth.uid });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || String(e) });
        }
        break;
      }
      case 'SIGN_UP': {
        try {
          const auth = await signUpWithPassword(message.email, message.password);
          sendResponse({ ok: true, email: auth.email, uid: auth.uid });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || String(e) });
        }
        break;
      }
      case 'SIGN_OUT': {
        await clearAuth();
        sendResponse({ ok: true });
        break;
      }
      case 'SCRAPE_NOW_MANUAL': {
        await runCycle({ forcePush: false, manual: true });
        sendResponse({ ok: true });
        break;
      }
      case 'PUSH_NOW': {
        await runCycle({ forcePush: true, manual: true });
        sendResponse({ ok: true });
        break;
      }
      case 'TEST_SCRAPE': {
        const scrapeConfig = await getScrapeConfig();
        const targetUrl = message.targetUrl || scrapeConfig.targetUrl;
        const tab = await findTargetTab(targetUrl);
        if (!tab) {
          sendResponse({ ok: false, error: 'No matching tab open. Open the market page first.' });
          break;
        }
        // Use the caller's draft selectors (possibly unsaved) rather than
        // whatever's currently saved, so Options' "Test scrape" reflects
        // in-progress edits immediately.
        const result = await scrapeTab(tab, message.config);
        if (result.ok) await saveAudit(result, tab.url, 'test');
        sendResponse({ ...result, auditSaved: !!result.ok });
        break;
      }
      default:
        sendResponse({ ok: false, error: `Unknown message type: ${message?.type}` });
    }
  })().catch(e => sendResponse({ ok: false, error: e.message || String(e) }));
  return true; // async response
});
