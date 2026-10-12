import { mergeBounds, tickerProjection } from './ticker-data.js';
import { restoreExtensionConfigs, saveExtensionConfigs, CONFIG_KEYS } from './cloud-config.js';
import { recordActivity, qatarDate } from './activity.js';
import { saveAudit, queryAudit, markAuditSynced } from './audit.js';
import { combineRecords } from './combined-data.js';
import { pushedRecords, paginatePushed, priceDeviation, flagPriceOutliers } from './pushed-data.js';
import { setSyncConfig, withinScrapingWindow, pushDelayMs } from './common.js';
// Background service worker: owns the collect → (throttled, randomized)
// push loop, Firebase Auth (email/password, via plain REST calls — no SDK
// bundling needed in an MV3 service worker), and the safe read-modify-write
// against the shared `QSE` RTDB node. The popup and options pages
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
  setScrapeConfig,
  getSyncConfig,
  patchStatus,
  getStatus,
  randInt,
} from './common.js';

const COLLECT_ALARM = 'collect-tick';
function networkRequest(url, options = {}) {
  return fetch(url, { ...options, ...(typeof AbortSignal !== 'undefined' ? { signal: AbortSignal.timeout(20000) } : {}) });
}
let pushedSnapshot = null;
let pushedRead = null;
let combinedSnapshot = null;
let rootReady = false;
async function ensureQseRoot(auth) {
  if (rootReady) return;
  const marker = await conditionalRead('QSE/migrationVersion', auth);
  if (marker.value === 2) { rootReady = true; return; }
  const state = await conditionalRead('QSE', auth);
  const response = await networkRequest(RTDB_BASE_URL + '/stockData/QSE.json?auth=' + encodeURIComponent(auth.idToken));
  if (!response.ok) throw new Error('Cannot migrate legacy QSE data (' + response.status + ')');
  const legacy = await response.json() || {};
  const current = state.value || {};
  const merged = { ...legacy, ...current, migrationVersion:2 };
  for (const key of ['tickers','prices','priceHistory','tickerNames','fundamentals']) merged[key] = { ...(legacy[key] || {}), ...(current[key] || {}) };
  for (const ticker of Object.keys(merged.priceHistory)) merged.priceHistory[ticker] = { ...(legacy.priceHistory?.[ticker] || {}), ...(current.priceHistory?.[ticker] || {}) };
  for (const ticker of Object.keys(merged.tickers)) {
    const archived = { ...(legacy.tickers?.[ticker]?.allPrices || {}), ...(current.tickers?.[ticker]?.allPrices || {}) };
    const projection = tickerProjection(archived);
    merged.tickers[ticker] = { ...(legacy.tickers?.[ticker] || {}), ...(current.tickers?.[ticker] || {}), ...projection, latest: Object.hasOwn(current.tickers?.[ticker] || {}, 'latest') ? current.tickers[ticker].latest : projection.latest };
  }
  try { await conditionalWrite(state, merged); }
  catch (error) {
    if (!/Record changed/.test(error.message) || (await conditionalRead('QSE/migrationVersion', auth)).value !== 2) throw error;
  }
  rootReady = true;
}


async function conditionalRead(path, auth) {
  const url = `${RTDB_BASE_URL}/${path}.json?auth=${encodeURIComponent(auth.idToken)}`;
  const response = await networkRequest(url, { headers: { 'X-Firebase-ETag': 'true' } });
  if (!response.ok) throw new Error(`Database read failed (${response.status})`);
  const etag = response.headers.get('ETag');
  if (!etag) throw new Error('Database did not return a version; refresh and try again.');
  return { url, etag, value: await response.json() };
}

async function conditionalWrite(state, value) {
  const response = await networkRequest(state.url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': state.etag }, body: JSON.stringify(value) });
  if (!response.ok) throw new Error(response.status === 412 ? 'Record changed since it was read. Refresh and try again.' : `Database update failed (${response.status})`);
}

async function mutatePushedData(entries, operation, price) {
  if (!['delete', 'edit'].includes(operation) || !Array.isArray(entries) || !entries.length || entries.length > 100) throw new Error('Select between 1 and 100 records.');
  if (operation === 'edit' && (!Number.isFinite(price) || price <= 0)) throw new Error('Price must be a positive number.');
  const auth = await getFreshAuth();
  if (!auth) throw new Error('Sign in to edit Firebase records.');
  await ensureQseRoot(auth);
  const results = [];
  for (const entry of entries) {
    try {
      if (!/^[A-Z][A-Z0-9]{1,5}$/.test(entry.ticker) || !['history', 'current'].includes(entry.kind)) throw new Error('Invalid record.');
      if (entry.kind === 'current') {
        const state = await conditionalRead(priceCachePath(entry.ticker), auth);
        if (state.value !== entry.price) throw new Error('Current price changed. Refresh first.');
        await conditionalWrite(state, operation === 'delete' ? null : price);
        if (operation === 'edit') {
          const time = new Date().toISOString();
          // Record manual current-price corrections so allPrices and summaries agree.
          await putScalar(priceHistoryPath(entry.ticker) + '/' + Date.parse(time), { price, originalPrice:entry.price, time, date:qatarDate(new Date(time)), editedAt:time, priceKey:'manualCorrection', dayHigh:null, dayLow:null, raw:[] }, auth.idToken);
        }
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
      await rebuildTickerProjection(entry.ticker, auth, entry.kind === 'current' && operation === 'delete');
      results.push({ id: entry.id, ok: true });
    } catch (error) { results.push({ id: entry.id, ok: false, error: error.message }); }
  }
  pushedSnapshot = null;
  return results;
}

async function queryPushedData(filters, refresh = false) {
  const auth = await getFreshAuth();
  if (!auth) throw new Error('Sign in on this page to view the data already pushed to Firebase.');
  await ensureQseRoot(auth);
  if (refresh || !pushedSnapshot || pushedSnapshot.uid !== auth.uid || Date.now() - pushedSnapshot.at > 60000) {
    if (!pushedRead || pushedRead.uid !== auth.uid) {
      const pending = { uid: auth.uid };
      pending.promise = (async () => {
    const paths = ['priceHistory', 'prices', 'tickerNames', 'pricesUpdatedAt'];
    const values = await Promise.all(paths.map(async path => {
      const response = await networkRequest(`${RTDB_BASE_URL}/QSE/${path}.json?auth=${encodeURIComponent(auth.idToken)}`);
      if (!response.ok) throw new Error(`Cannot read Firebase ${path} (${response.status}). Check that this account has database read access.`);
      return response.json();
    }));
    pushedSnapshot = { uid: auth.uid, at: Date.now(), rows: pushedRecords({ history: values[0], prices: values[1], names: values[2], updatedAt: values[3] }) };
      })().finally(() => { if (pushedRead === pending) pushedRead = null; });
      pushedRead = pending;
    }
    await pushedRead.promise;
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
  const res = await networkRequest(`${IDENTITY_TOOLKIT_BASE}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
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
  const res = await networkRequest(`${IDENTITY_TOOLKIT_BASE}/accounts:signUp?key=${FIREBASE_API_KEY}`, {
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
  const res = await networkRequest(`${SECURE_TOKEN_BASE}/token?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    // Refresh token itself is no longer valid — the user needs to sign in again.
    if (res.status >= 500 || res.status === 429) throw new Error('Authentication service unavailable. Retrying will keep your sign-in.');
    const current = await getAuth();
    if (current?.refreshToken === auth.refreshToken) await clearAuth();
    throw new Error('Signed out (token expired) — sign in again from the extension page.');
  }
  const next = normalizeAuthResponse(json, auth.email);
  const current = await getAuth();
  if (current?.refreshToken !== auth.refreshToken) return current;
  await setAuth(next);
  return next;
}

/** Returns a currently-valid idToken, refreshing first if it's near expiry.
 * Returns null if never signed in; throws if refresh itself fails (caller
 * should surface that as a "please sign in again" state). */
let refreshingAuth = null;
async function getFreshAuth() {
  const auth = await getAuth();
  if (!auth) return null;
  if (Date.now() < auth.expiresAt) return auth;
  if (!refreshingAuth) refreshingAuth = refreshAuth(auth).finally(() => { refreshingAuth = null; });
  return refreshingAuth;
}

// ---------- RTDB REST helpers ----------

async function putScalar(path, value, idToken) {
  const res = await networkRequest(`${RTDB_BASE_URL}/${path}.json?auth=${idToken}`, {
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
    const getRes = await networkRequest(url, { headers: { 'X-Firebase-ETag': 'true' } });
    if (!getRes.ok) throw new Error(`RTDB read failed for ${ticker} history: ${getRes.status}`);
    const etag = getRes.headers.get('ETag');
    const current = (await getRes.json()) || [];
    const entries = Object.entries(current).filter(([, value]) => value && Number.isFinite(value.price));
    const last = entries.sort((a, b) => String(a[1].time || a[1].date || '').localeCompare(String(b[1].time || b[1].date || ''))).at(-1)?.[1];
    // Skip only unchanged price and bounds within the same Qatar day.
    // New extrema must be retained even when the sampled last price is unchanged.
    if (last && last.price === point.price && last.date === point.date && (last.dayHigh ?? null) === (point.dayHigh ?? null) && (last.dayLow ?? null) === (point.dayLow ?? null)) return { appended: false };
    const keys = Object.keys(current);
    const nextKey = keys.every(key => /^\d+$/.test(key)) ? String(Math.max(-1, ...keys.map(Number)) + 1) : String(Date.now());
    const next = { ...current, [nextKey]: point };
    const putRes = await networkRequest(url, {
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

async function updateTickerBounds(path, point, auth) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await conditionalRead(path, auth);
    try { await conditionalWrite(state, mergeBounds(state.value, point)); return; }
    catch (error) { if (!/Record changed/.test(error.message) || attempt === 2) throw error; }
  }
}

async function syncTickerPoint(ticker, point, auth) {
  const root = 'QSE/tickers/' + encodeURIComponent(ticker);
  const latest = await conditionalRead(root + '/latest', auth);
  // One-time migration: bootstrap historical extrema before incremental updates.
  if (!latest.value) {
    const legacy = await conditionalRead(priceHistoryPath(ticker), auth);
    const seed = tickerProjection(legacy.value);
    const state = await conditionalRead(root, auth);
    if (!state.value) await conditionalWrite(state, seed);
  }
  await Promise.all([
    updateTickerBounds(root + '/dayToDayBounds/' + point.date, point, auth),
    updateTickerBounds(root + '/allTimeBounds', point, auth),
  ]);
  const last = latest.value;
  if (last && last.price === point.price && last.date === point.date && (last.dayHigh ?? null) === point.dayHigh && (last.dayLow ?? null) === point.dayLow) return;
  const key = String(Date.parse(point.time));
  const response = await networkRequest(RTDB_BASE_URL + '/QSE.json?auth=' + encodeURIComponent(auth.idToken), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ['tickers/' + ticker + '/allPrices/' + key]: point, ['tickers/' + ticker + '/latest']: point, ['priceHistory/' + ticker + '/' + key]: point }),
  });
  if (!response.ok) throw new Error('Ticker price/history sync failed (' + response.status + ')');
}

async function rebuildTickerProjection(ticker, auth, clearLatest = false) {
  const state = await conditionalRead('QSE/tickers/' + encodeURIComponent(ticker), auth);
  const legacy = await conditionalRead(priceHistoryPath(ticker), auth);
  const projection = tickerProjection(legacy.value);
  if (clearLatest) projection.latest = null;
  await conditionalWrite(state, projection);
}

async function pushRows(rows) {
  const auth = await getFreshAuth();
  if (!auth) throw new Error('Sign in on the extension page to sync prices.');
  await ensureQseRoot(auth);
  await saveExtensionConfigs(getFreshAuth).then(() => patchStatus({ configSyncError:'' })).catch(error => patchStatus({ configSyncError:error.message }));
  const nowIso = new Date().toISOString();
  const today = qatarDate(new Date(nowIso));
  let pushed = 0;
  const syncedTickers = [];
  let namesPushed = 0;
  const errors = [];
  for (const row of rows) {
    try {
      const previousResponse = await networkRequest(`${RTDB_BASE_URL}/${priceCachePath(row.ticker)}.json?auth=${encodeURIComponent(auth.idToken)}`);
      if (!previousResponse.ok) throw new Error(`Cannot read previous price (${previousResponse.status})`);
      const previousPrice = await previousResponse.json();
      const point = { date: today, time: nowIso, price: row.price, priceKey: row.priceKey || null, dayHigh: row.dayHigh ?? null, dayLow: row.dayLow ?? null, highLowKey: row.highLowKey || null, highLowRaw: row.highLowRaw || [], rangeError: row.rangeError || '', raw: row.raw || [], ...priceDeviation(row.price, previousPrice) };
      await putScalar(priceCachePath(row.ticker), row.price, auth.idToken);
      pushedSnapshot = null;
      pushed++;
      syncedTickers.push(row.ticker);
      try {
        await syncTickerPoint(row.ticker, point, auth);
      } catch (error) { errors.push(`${row.ticker}: current price synced; history failed: ${error.message}`); }
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
    if (pushed > 0) await putScalar(SHARED_LAST_UPDATED_PATH, nowIso, auth.idToken);
  } catch (e) {
    // Non-critical — the per-ticker writes already landed.
  }
  return { pushed, namesPushed, total: rows.length, errors, syncedTickers };
}

// ---------- Scraping (delegates to the content script) ----------

function matchesMarketUrl(candidate, target) {
  try { const a = new URL(candidate), b = new URL(target); return a.origin === b.origin && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, ''); }
  catch { return false; }
}
async function findTargetTab(targetUrl) {
  let originPattern = 'https://webd.thegroup.com.qa/*';
  try {
    originPattern = `${new URL(targetUrl).origin}/*`;
  } catch (e) {
    // fall back to the default pattern above
  }
  const tabs = await chrome.tabs.query({ url: originPattern });
  if (!tabs.length) return null;
  return tabs.find(tab => matchesMarketUrl(tab.url, targetUrl)) || null;
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
    const timeout = typeof setTimeout === 'function' ? setTimeout(() => resolve({ ok: false, error: 'Market page did not respond within 15 seconds. Refresh that tab and retry.' }), 15000) : null;
    chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_NOW', config: overrideConfig }, (response) => {
      if (timeout !== null) clearTimeout(timeout);
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
let cyclePending = null;
let cyclePromise = null;
let actionRunning = false;
let stopRunning = false;
const RETRY_ALARM = "sync-retry";
async function runCycle(options = {}) {
  if (cycleRunning) {
    if (options.manual) throw new Error('Scraping or syncing is already running. Wait for completion.');
    if (options.forcePush) { await cyclePromise; return runCycle(options); }
    if (options.pageTriggered) cyclePending = { pageTriggered: true };
    return cyclePromise;
  }
  if ((actionRunning || stopRunning) && !options.manual && !options.actionOwned) { cyclePending = { pageTriggered: true }; return; }
  cycleRunning = true;
  cyclePromise = (async () => {
    try { await patchStatus({ cycleBusy: true }); return await collectCycle(options); }
    catch (error) { const status = await getStatus(); await patchStatus({ lastError: error.message, ...(status.scrapeState === 'Scraping' ? { scrapeState: 'Failed' } : {}) }); throw error; }
    finally {
      try { await patchStatus({ cycleBusy: false }); }
      finally { cycleRunning = false; }
      await scheduleNextCollect();
    }
  })();
  try { return await cyclePromise; }
  finally {
    if (cyclePending && !actionRunning) {
      const next = cyclePending; cyclePending = null;
      runCycle(next).catch(error => patchStatus({ lastError: error.message }));
    }
  }
}
async function collectCycle({ forcePush = false, manual = false, scrapeOnly = false } = {}) {
  const config = await getSyncConfig();
  if (!manual && (!config.scrapingEnabled || !withinScrapingWindow(config))) {
    await patchStatus({ scrapeState: config.scrapingEnabled ? 'Outside time window' : 'Stopped', syncState: config.scrapingEnabled ? 'Outside time window' : 'Stopped' });
    await scheduleNextCollect();
    return;
  }
  const scrapeConfig = await getScrapeConfig();
  const tab = await findTargetTab(scrapeConfig.targetUrl);
  if (!tab) {
    await patchStatus({ scrapeState: 'Waiting for market tab', lastError: 'No matching tab open — open the market page for auto-refresh to work.' });
    await scheduleNextCollect();
    if (manual) throw new Error('No matching market tab open. Open the configured market page first.');
    return;
  }

  await patchStatus({ scrapeState: 'Scraping' });
  const result = await scrapeTab(tab);
  if (!result.ok) {
    await recordActivity({ type: 'scrape', success: false });
    await patchStatus({ scrapeState: 'Scrape failed', lastError: `Scrape failed: ${result.error}` });
    await scheduleNextCollect();
    if (manual) throw new Error(`Scrape failed: ${result.error}`);
    return;
  }

  await recordActivity({ type: 'scrape', success: true, count: result.rows?.length || 0 });
  const auditBatchAt = await saveAudit(result, tab.url, manual ? 'manual' : 'automatic');
  const rows = result.rows || [];
  await patchStatus({
    scrapeState: 'Watching prices',
    lastScrapeAt: Date.now(),
    lastScrapeCount: rows.length,
    lastStrategy: result.strategy,
    lastError: rows.length ? '' : 'Scraped 0 rows — the page layout may not match; tune selectors in Options.',
  });

  if (!rows.length) {
    await scheduleNextCollect();
    if (manual) throw new Error('No valid prices found on the market page.');
    return;
  }

  const status = await getStatus();
  const syncConfig = await getSyncConfig();
  if (!scrapeOnly && typeof getAuth === 'function' && !await getAuth()) {
    await patchStatus({ syncState: 'Waiting for sign-in', lastSyncError: '', retryAt: null });
    await chrome.alarms.clear?.(RETRY_ALARM);
    if (manual && forcePush) throw new Error('Scrape saved locally. Sign in to sync prices.');
    return;
  }
  const due = forcePush || (!status.retryAt || Date.now() >= status.retryAt) && (syncConfig.minPushIntervalMinutes === 0 || !status.nextPushAt || Date.now() >= status.nextPushAt);
  if (!scrapeOnly && !due) {
    await patchStatus({ syncState: status.retryAt ? 'Retrying' : 'Waiting for push interval' });
    chrome.alarms.create(RETRY_ALARM, { when: status.retryAt || status.nextPushAt });
  }

  if (!scrapeOnly && due && (manual || (await getSyncConfig()).scrapingEnabled)) {
    let syncFailure = '';
    await patchStatus({ syncState: 'Syncing' });
    try {
      const { pushed, namesPushed, total, errors, syncedTickers } = await pushRows(rows);
      await recordActivity({ type: 'sync', count: pushed, success: pushed === total && !errors.length, error: errors.slice(0, 3).join(' ') });
      try { await markAuditSynced(auditBatchAt, syncedTickers); }
      catch (error) { errors.push(`Prices synced; local audit update failed: ${error.message}`); }
      const retryAt = errors.length ? Date.now() + Math.max(5000, syncConfig.minPushIntervalMinutes * 60000) : null;
      if (retryAt) chrome.alarms.create(RETRY_ALARM, { when: retryAt });
      else await chrome.alarms.clear?.(RETRY_ALARM);
      const nextPushAt = Date.now() + pushDelayMs(syncConfig);
      await patchStatus({
        syncState: errors.length ? 'Retrying' : 'Synced', retryAt,
        lastPushAt: pushed > 0 ? Date.now() : status.lastPushAt,
        lastPushCount: pushed,
        lastPushTotal: total,
        lastNamesCount: namesPushed,
        nextPushAt,
        lastError: errors.slice(0, 3).join(' '),
        lastSyncError: errors.slice(0, 3).join(' '),
      });
      pushedSnapshot = null;
      if (manual && errors.length) syncFailure = errors.slice(0, 3).join(' ');
      if (errors.length) console.warn('[thegroup-price-sync] push errors:', errors);
    } catch (e) {
      await recordActivity({ type: 'sync', count: 0, success: false, error: e.message || String(e) });
      const retryAt = Date.now() + Math.max(5000, syncConfig.minPushIntervalMinutes * 60000);
      chrome.alarms.create(RETRY_ALARM, { when: retryAt });
      await patchStatus({ syncState: 'Retrying', retryAt, lastError: e.message || String(e), lastSyncError: e.message || String(e), nextPushAt: retryAt });
      if (manual) throw e;
    }
    if (syncFailure) throw new Error(syncFailure);
  }

  await scheduleNextCollect();
  return { scraped: rows.length, status: await getStatus() };
}

async function scheduleNextCollect() {
  if (!(await getSyncConfig()).scrapingEnabled) { await chrome.alarms.clear(COLLECT_ALARM); return; }
  const interval = (await getSyncConfig()).scrapeIntervalSeconds;
  if (interval === 0 && (await getSyncConfig()).respectTimeWindows === false) { await chrome.alarms.clear(COLLECT_ALARM); return; }
  if (interval === 0) {
    if (!withinScrapingWindow(await getSyncConfig())) chrome.alarms.create(COLLECT_ALARM, { when: Date.now() + 60000 });
    else await chrome.alarms.clear(COLLECT_ALARM);
    return;
  }
  const delaySec = interval === undefined ? randInt(COLLECT_MIN_SECONDS, COLLECT_MAX_SECONDS) : Math.max(30, interval);
  const config = await getSyncConfig();
  const status = config.pushTimingMode === 'constant' ? await getStatus() : {};
  const now = Date.now();
  const when = status.nextPushAt > now ? Math.min(now + delaySec * 1000, status.nextPushAt) : now + delaySec * 1000;
  chrome.alarms.create(COLLECT_ALARM, { when });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === COLLECT_ALARM || alarm.name === RETRY_ALARM) runCycle().catch(e => patchStatus({ lastError: e.message || String(e) }));
});

chrome.runtime.onInstalled.addListener(() => scheduleNextCollect());
chrome.runtime.onStartup.addListener(() => scheduleNextCollect());

// ---------- Messages from popup.js / options.js ----------

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  let response;
  const sendResponse = value => { response = value; };
  (async () => {
    const exclusive = ['START_SCRAPING', 'SCRAPE_NOW_MANUAL', 'PUSH_NOW', 'TEST_SCRAPE', 'MUTATE_PUSHED_DATA', 'SIGN_IN', 'SIGN_UP', 'SIGN_OUT', 'SAVE_CONFIGS'].includes(message?.type);
    if (stopRunning || (exclusive || message?.type === 'STOP_SCRAPING' && !cycleRunning) && (actionRunning || cycleRunning)) throw new Error('Another action is running. Wait for completion.');
    if (exclusive) actionRunning = true;
    try {
    if (exclusive) await patchStatus({ actionBusy: true, currentAction: message.type, actionError: '' });
    switch (message?.type) {
      case 'PAGE_SCRAPE_TRIGGER': {
        const [config, scrape] = await Promise.all([getSyncConfig(), getScrapeConfig()]);
        if (!_sender.tab || !matchesMarketUrl(_sender.tab.url, scrape.targetUrl) || (message.reason === 'price' ? !config.scrapeOnPriceChange : !(config.scrapeIntervalSeconds > 0 && config.scrapeIntervalSeconds < 30))) { sendResponse({ ok: false }); break; }
        await runCycle({ pageTriggered: true });
        sendResponse({ ok: true });
        break;
      }
      case 'START_SCRAPING': {
        await setSyncConfig({ scrapingEnabled: true });
        await runCycle({ actionOwned: true });
        await scheduleNextCollect();
        sendResponse({ ok: true });
        break;
      }
      case 'STOP_SCRAPING': {
        stopRunning = true;
        try {
        await patchStatus({ currentAction: 'STOP_SCRAPING', actionBusy: true });
        await setSyncConfig({ scrapingEnabled: false });
        cyclePending = null;
        if (cycleRunning) await cyclePromise.catch(() => {});
        await chrome.alarms.clear(COLLECT_ALARM);
        await chrome.alarms.clear(RETRY_ALARM);
        await patchStatus({ scrapeState: 'Stopped', syncState: 'Stopped', actionBusy: false, currentAction: '', actionCompletedAt: Date.now() });
        sendResponse({ ok: true });
        } finally { stopRunning = false; }
        break;
      }
      case 'GET_PUSHED_DATA': {
        sendResponse({ ok: true, ...await queryPushedData(message.filters || {}, !!message.refresh) });
        break;
      }
      case 'GET_ALL_DATA': {
        const local = await queryAudit({ includeRecords: true, rawOnly: true });
        let firebase = [];
        let warning = '';
        try {
          await queryPushedData({}, !!message.refresh);
          firebase = pushedSnapshot.rows;
        } catch (error) { warning = `Firebase unavailable: ${error.message} Showing local records; their sync state may be unverified.`; }
        const key = [local.auditVersion, pushedSnapshot?.uid, pushedSnapshot?.at, warning].join(':');
        if (local.auditVersion === undefined || combinedSnapshot?.key !== key) combinedSnapshot = { key, rows: flagPriceOutliers(combineRecords(firebase, local.records)) };
        const rows = combinedSnapshot.rows;
        sendResponse({ ok: true, ...paginatePushed(rows, message.filters || {}), warning });
        break;
      }
      case 'GET_ACTIVITY_SUMMARY': {
        await queryPushedData({});
        const today = qatarDate();
        const points = pushedSnapshot.rows.filter(row => row.kind === 'history' && row.capturedAt != null && qatarDate(row.capturedAt) === today);
        sendResponse({ ok: true, historyPointsToday: points.length });
        break;
      }
      case 'MUTATE_PUSHED_DATA': {
        sendResponse({ ok: true, results: await mutatePushedData(message.entries, message.operation, message.price) });
        break;
      }
      case 'LOAD_EXTENSION_CONFIGS': {
        await patchStatus({ actionBusy: actionRunning, cycleBusy: cycleRunning });
        await restoreExtensionConfigs(await getFreshAuth());
        await patchStatus({ configSyncError:'', actionBusy: actionRunning, cycleBusy: cycleRunning });
        sendResponse({ ok: true }); break;
      }
      case 'SIGN_IN': {
        try {
          const auth = await signInWithPassword(message.email, message.password);
          await restoreExtensionConfigs(auth).catch(error => patchStatus({ configSyncError: error.message }));
          await recordActivity({ type: 'auth' });
          await patchStatus({ lastSyncError: '', lastError: '', nextPushAt: 0, retryAt: null, syncState: 'Ready to sync' });
          await runCycle({ forcePush: true, actionOwned: true }).catch(error => patchStatus({ lastSyncError: error.message }));
          sendResponse({ ok: true, email: auth.email, uid: auth.uid, status: await getStatus() });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || String(e) });
        }
        break;
      }
      case 'SIGN_UP': {
        try {
          const auth = await signUpWithPassword(message.email, message.password);
          await restoreExtensionConfigs(auth).catch(error => patchStatus({ configSyncError: error.message }));
          await recordActivity({ type: 'auth' });
          await patchStatus({ lastSyncError: '', lastError: '', nextPushAt: 0, retryAt: null, syncState: 'Ready to sync' });
          await runCycle({ forcePush: true, actionOwned: true }).catch(error => patchStatus({ lastSyncError: error.message }));
          sendResponse({ ok: true, email: auth.email, uid: auth.uid, status: await getStatus() });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || String(e) });
        }
        break;
      }
      case 'SIGN_OUT': {
        await clearAuth();
        await recordActivity({ type: 'auth' });
        await patchStatus({ syncState: 'Waiting for sign-in', lastSyncError: '', retryAt: null });
        await chrome.alarms.clear(RETRY_ALARM);
        sendResponse({ ok: true });
        break;
      }
      case 'SCRAPE_NOW_MANUAL': {
        const result = await runCycle({ forcePush: false, manual: true, scrapeOnly: true });
        sendResponse({ ok: true, ...result });
        break;
      }
      case 'PUSH_NOW': {
        const result = await runCycle({ forcePush: true, manual: true });
        sendResponse({ ok: true, ...result });
        break;
      }
      case 'SAVE_CONFIGS': {
        const target = new URL(message.scrape?.targetUrl);
        if (target.origin !== 'https://webd.thegroup.com.qa') throw new Error('Use a supported market URL.');
        await setSyncConfig(message.sync);
        await setScrapeConfig({ targetUrl: target.href });
        sendResponse({ ok: true }); break;
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
        await patchStatus({ scrapeState: 'Testing scrape' });
        const result = await scrapeTab(tab, message.config);
        await patchStatus({ scrapeState: result.ok ? 'Test complete' : 'Test failed', lastError: result.ok ? '' : result.error });
        await recordActivity({ type: 'scrape', success: !!result.ok, count: result.rows?.length || 0, source: 'test' });
        if (result.ok) await saveAudit(result, tab.url, 'test');
        sendResponse({ ...result, auditSaved: !!result.ok });
        break;
      }
      default:
        sendResponse({ ok: false, error: `Unknown message type: ${message?.type}` });
    }
    } finally {
      if (exclusive) {
        actionRunning = false;
        await patchStatus({ actionBusy: false, currentAction: '', actionCompletedAt: Date.now(), actionError: response?.ok === false ? response.error || 'Action failed.' : '' });
        if (cyclePending) { const next = cyclePending; cyclePending = null; runCycle(next).catch(error => patchStatus({ lastError: error.message })); }
      }
    }
    if (response && (exclusive || message?.type === 'STOP_SCRAPING')) response = { ...response, status: await getStatus() };
    reply(response || { ok: true });
  })().catch(async e => {
    if (!actionRunning) await patchStatus({ actionError: e.message || String(e) }).catch(() => {});
    reply({ ok: false, error: e.message || String(e) });
  });
  return true; // async response
});

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area !== 'local') return;
  if (CONFIG_KEYS.some(key => changes[key])) saveExtensionConfigs(getFreshAuth, true).then(() => patchStatus({ configSyncError:'' })).catch(error => patchStatus({ configSyncError: error.message }));
  if (!changes.syncConfig) return;

  (async () => {
    const [config, status] = await Promise.all([getSyncConfig(), getStatus()]);
    if (status.lastPushAt) await patchStatus({ nextPushAt: status.lastPushAt + pushDelayMs(config) });
    await scheduleNextCollect();
  })().catch(error => patchStatus({ lastError: error.message }));
});
