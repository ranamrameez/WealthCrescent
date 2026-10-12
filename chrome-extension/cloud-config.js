import { RTDB_BASE_URL, DEFAULT_SCRAPE_CONFIG, DEFAULT_SYNC_CONFIG } from './common.js';
export const CONFIG_KEYS = ['scrapeConfig', 'syncConfig', 'chartFavourites', 'favouriteTimeframes', 'viewPreferences'];
const defaults = () => ({ scrapeConfig: { ...DEFAULT_SCRAPE_CONFIG }, syncConfig: { ...DEFAULT_SYNC_CONFIG }, chartFavourites: [], favouriteTimeframes: {}, viewPreferences: {} });
let queue = Promise.resolve(), restoring = false, lastSaved = '', activeUid = null;
function enqueue(work) { const task = queue.catch(() => {}).then(work); queue = task; return task; }
function pick(value) { return Object.fromEntries(CONFIG_KEYS.filter(key => value?.[key] !== undefined).map(key => [key, value[key]])); }
function url(auth) { return RTDB_BASE_URL + '/users/' + encodeURIComponent(auth.uid) + '/extensionConfigs.json?auth=' + encodeURIComponent(auth.idToken); }
async function upload(auth, snapshot, profiles, keys = CONFIG_KEYS) {
  const response = await fetch(url(auth), { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...Object.fromEntries(keys.map(key => [key, snapshot[key]])), schemaVersion:1, updatedAt:new Date().toISOString() }) });
  if (!response.ok) throw new Error('Configuration sync failed (' + response.status + '); settings retained locally for retry.');
  lastSaved = JSON.stringify(snapshot);
  profiles[auth.uid] = { values:snapshot, pending:false };
  await chrome.storage.local.set({ extensionConfigProfiles:profiles, extensionConfigOwner:auth.uid, configSyncStatus:{ uid:auth.uid, syncedAt:Date.now(), error:'' } });
}
async function restore(auth) {
    if (!auth) return;
    const local = await chrome.storage.local.get(null), profiles = local.extensionConfigProfiles || {};
    // An offline account switch must not expose the previous account's settings.
    if (local.extensionConfigOwner && local.extensionConfigOwner !== auth.uid) {
      const cached = { ...defaults(), ...pick(profiles[auth.uid]?.values) };
      activeUid = null; lastSaved = JSON.stringify(cached); restoring = true;
      try { await chrome.storage.local.set({ ...cached, extensionConfigOwner:auth.uid }); }
      finally { restoring = false; }
    }
    const response = await fetch(url(auth));
    if (!response.ok) throw new Error('Cannot load account configurations (' + response.status + ').');
    const cloud = await response.json();
    const own = profiles[auth.uid];
    const snapshot = { ...defaults(), ...pick(cloud || own?.values || (!local.extensionConfigOwner || local.extensionConfigOwner === auth.uid ? local : {})) };
    if (own?.pending) for (const key of own.pendingKeys || CONFIG_KEYS) snapshot[key] = own.values[key];
    activeUid = auth.uid;
    restoring = true;
    lastSaved = JSON.stringify(snapshot);
    try { await chrome.storage.local.set({ ...snapshot, extensionConfigOwner:auth.uid }); }
    finally { restoring = false; }
    if (!cloud || own?.pending) await upload(auth,snapshot,profiles, own?.pendingKeys || CONFIG_KEYS);
    else await chrome.storage.local.set({ configSyncStatus:{ uid:auth.uid, syncedAt:Date.now(), error:'' } });
}
export function restoreExtensionConfigs(auth) {
  return enqueue(async () => {
    try { await restore(auth); }
    catch (error) { await chrome.storage.local.set({ configSyncStatus:{ uid:auth?.uid,error:error.message } }); throw error; }
  });
}
export function saveExtensionConfigs(getAuth, dirty = false) {
  if (restoring) return Promise.resolve();
  return enqueue(async () => {
    const auth = await getAuth(); if (!auth) return;
    const local = await chrome.storage.local.get(null);
    if (local.extensionConfigOwner && local.extensionConfigOwner !== auth.uid) throw new Error('Load this account configuration before saving changes.');
    const snapshot = { ...defaults(), ...pick(local) };
    if (activeUid !== auth.uid && !dirty) { await restore(auth); return; }
    if (JSON.stringify(snapshot) === lastSaved && !local.extensionConfigProfiles?.[auth.uid]?.pending) return;
    const profiles = local.extensionConfigProfiles || {};
    const previous = lastSaved ? JSON.parse(lastSaved) : {};
    const keys = [...new Set([...(profiles[auth.uid]?.pendingKeys || []), ...CONFIG_KEYS.filter(key => JSON.stringify(snapshot[key]) !== JSON.stringify(previous[key]))])];
    profiles[auth.uid] = { values:snapshot, pending:true, pendingKeys:keys.length ? keys : CONFIG_KEYS };
    await chrome.storage.local.set({ extensionConfigProfiles:profiles, extensionConfigOwner:auth.uid });
    try {
      if (activeUid !== auth.uid) await restore(auth);
      else await upload(auth,snapshot,profiles,profiles[auth.uid].pendingKeys);
    }
    catch (error) { await chrome.storage.local.set({ configSyncStatus:{ uid:auth.uid,error:error.message } }); throw error; }
  });
}
