// Shared constants + small helpers used by background.js, popup.js and
// options.js (all loaded as ES modules). content.js is a plain content
// script (no module imports allowed there), so it duplicates the tiny bit
// of selector-config-reading logic it needs instead of importing this file.

// Same Firebase project WealthCrescent itself uses (webapp/src/lib/firebase/client.ts).
// This API key is not a secret — it only identifies the project; real access
// control lives in the Realtime Database security rules, same as the web app.
export const FIREBASE_API_KEY = 'AIzaSyCzg_KmLGNUXlIzqEAUJctG29kyJQruM8I';
export const RTDB_BASE_URL = 'https://qse-app-default-rtdb.asia-southeast1.firebasedatabase.app';
export const IDENTITY_TOOLKIT_BASE = 'https://identitytoolkit.googleapis.com/v1';
export const SECURE_TOKEN_BASE = 'https://securetoken.googleapis.com/v1';

export const DEFAULT_TARGET_URL = 'https://webd.thegroup.com.qa/en/markets/qatar';

// Scrape cadence and Firebase push cadence are configured independently.
export const MIN_PUSH_INTERVAL_MINUTES_FLOOR = 0;
export const DEFAULT_MIN_PUSH_INTERVAL_MINUTES = 2;

// Legacy bounds retained for older scheduler callers.
export const COLLECT_MIN_SECONDS = 45;
export const COLLECT_MAX_SECONDS = 90;

export const STORAGE_KEYS = {
  AUTH: 'auth', // { idToken, refreshToken, uid, email, expiresAt }
  SCRAPE_CONFIG: 'scrapeConfig', // { targetUrl, rowSelector, tickerSelector, priceSelector, changeSelector, nameSelector }
  SYNC_CONFIG: 'syncConfig', // { minPushIntervalMinutes }
  STATUS: 'status', // { lastScrapeAt, lastScrapeCount, lastPushAt, lastPushCount, lastNamesCount, nextPushAt, lastError }
};

export const DEFAULT_SCRAPE_CONFIG = {
  targetUrl: DEFAULT_TARGET_URL,
};

export const DEFAULT_SYNC_CONFIG = {
  minPushIntervalMinutes: DEFAULT_MIN_PUSH_INTERVAL_MINUTES,
  pushTimingMode: 'random',
  scrapingEnabled: true,
  scrapeIntervalSeconds: 5,
  scrapeOnPriceChange: true,
  respectTimeWindows: true,
  timeWindows: [{ start: '09:30', end: '13:00' }, { start: '13:10', end: '13:15' }],
};

export async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

export async function setStorage(obj) {
  return chrome.storage.local.set(obj);
}

export async function getAuth() {
  const { [STORAGE_KEYS.AUTH]: auth } = await getStorage(STORAGE_KEYS.AUTH);
  return auth || null;
}

export async function setAuth(auth) {
  await setStorage({ [STORAGE_KEYS.AUTH]: auth });
}

export async function clearAuth() {
  await chrome.storage.local.remove(STORAGE_KEYS.AUTH);
}

export async function getScrapeConfig() {
  const { [STORAGE_KEYS.SCRAPE_CONFIG]: cfg } = await getStorage(STORAGE_KEYS.SCRAPE_CONFIG);
  return { targetUrl: cfg?.targetUrl || DEFAULT_TARGET_URL };
}

export async function setScrapeConfig(patch) {
  const current = await getScrapeConfig();
  await setStorage({ [STORAGE_KEYS.SCRAPE_CONFIG]: { ...current, ...patch } });
}

export async function getSyncConfig() {
  const { [STORAGE_KEYS.SYNC_CONFIG]: cfg } = await getStorage(STORAGE_KEYS.SYNC_CONFIG);
  const merged = { ...DEFAULT_SYNC_CONFIG, ...(cfg || {}) };
  merged.pushTimingMode = merged.pushTimingMode === 'constant' ? 'constant' : 'random';
  merged.minPushIntervalMinutes = Math.max(MIN_PUSH_INTERVAL_MINUTES_FLOOR, Number.isFinite(Number(merged.minPushIntervalMinutes)) ? Number(merged.minPushIntervalMinutes) : DEFAULT_MIN_PUSH_INTERVAL_MINUTES);
  return merged;
}

export async function setSyncConfig(patch) {
  const current = await getSyncConfig();
  const next = { ...current, ...patch };
  if (!['random', 'constant'].includes(next.pushTimingMode)) throw new Error('Choose random or constant push timing.');
  if (!Array.isArray(next.timeWindows) || !next.timeWindows.length || next.timeWindows.some(w => !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end) || w.start === w.end)) throw new Error('Provide at least one valid start/end pair with different times.');
  if (!Number.isFinite(Number(next.scrapeIntervalSeconds)) || Number(next.scrapeIntervalSeconds) < 0) throw new Error('Scrape interval must be zero or a positive number of seconds.');
  next.scrapeIntervalSeconds = Number(next.scrapeIntervalSeconds);
  if (!next.scrapeIntervalSeconds && !next.scrapeOnPriceChange) throw new Error('Enable price-change scraping or set a positive scrape interval.');
  next.minPushIntervalMinutes = Math.max(MIN_PUSH_INTERVAL_MINUTES_FLOOR, Number.isFinite(Number(next.minPushIntervalMinutes)) ? Number(next.minPushIntervalMinutes) : DEFAULT_MIN_PUSH_INTERVAL_MINUTES);
  await setStorage({ [STORAGE_KEYS.SYNC_CONFIG]: next });
  return next;
}

export function pushDelayMs(config, random = Math.random) {
  const value = Number(config.minPushIntervalMinutes);
  const floor = Math.max(0, Number.isFinite(value) ? value : DEFAULT_MIN_PUSH_INTERVAL_MINUTES) * 60000;
  return config.pushTimingMode === 'constant' ? floor : floor + Math.min(floor, Math.floor(Math.max(0, random()) * (floor + 1)));
}

export function withinScrapingWindow(config, now = new Date()) {
  if (config.respectTimeWindows === false) return true;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return config.timeWindows.some(({ start, end }) => start < end ? time >= start && time < end : time >= start || time < end);
}

export async function sendWorkerMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    const error = response?.error || 'The extension background worker did not respond.';
    if (/Unknown message type|Receiving end does not exist/i.test(error)) throw new Error('Reload this extension in chrome://extensions, then refresh the market tab and reopen the extension page to load the updated background worker.');
    throw new Error(error);
  }
  return response;
}

// User-independent QSE market data lives at the database root QSE.
// Account settings alone live under users/{uid}/extensionConfigs.
// The worker migrates stockData/QSE once, preserving legacy data and root values.
export function priceCachePath(ticker) {
  return `QSE/prices/${encodeURIComponent(ticker)}`;
}

export function priceHistoryPath(ticker) {
  return `QSE/priceHistory/${encodeURIComponent(ticker)}`;
}

export function tickerNamePath(ticker) {
  return `QSE/tickerNames/${encodeURIComponent(ticker)}`;
}

export const SHARED_LAST_UPDATED_PATH = 'QSE/pricesUpdatedAt';

export async function getStatus() {
  const { [STORAGE_KEYS.STATUS]: status } = await getStorage(STORAGE_KEYS.STATUS);
  return status || {};
}

export async function patchStatus(patch) {
  const current = await getStatus();
  const next = { ...current, ...patch };
  await setStorage({ [STORAGE_KEYS.STATUS]: next });
  return next;
}

/** Random integer in [min, max], inclusive on both ends. */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
