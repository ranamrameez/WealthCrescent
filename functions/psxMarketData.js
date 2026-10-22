/** Provider access happens only in this scheduled worker, never in page loads. */
async function refreshPsxMarketData(db, fetcher = fetch, pause = () => new Promise(resolve => setTimeout(resolve, 1200))) {
  const { PSX_API_ORIGIN, PSX_CACHE_MS, PSX_BASE_PATHS, psxCacheKey, validPsxPath, buildPsxReference } = await import('./psxDataModel.mjs');
  const requested = await db.ref('PSX/requests').orderByChild('requestedAt').limitToFirst(35).once('value');
  const jobs = Object.entries(requested.val() || {});
  for (const [key, job] of jobs) if (!validPsxPath(job?.path) || psxCacheKey(job.path) !== key) await db.ref('PSX/requests/' + key).remove();
  const paths = [...new Set([...PSX_BASE_PATHS, ...jobs.filter(([key, job]) => validPsxPath(job?.path) && psxCacheKey(job.path) === key).map(([, job]) => job.path)])];
  const fresh = {};
  const failures = [];
  const deadline = Date.now() + 7 * 60_000;
  for (const path of paths) {
    if (Date.now() > deadline) { failures.push({ path, error: 'Remaining datasets deferred to the next run.' }); break; }
    const key = psxCacheKey(path);
    try {
      const existing = (await db.ref('PSX/api/' + key).once('value')).val();
      let cachedFresh = false;
      try { cachedFresh = existing && Date.now() - existing.fetchedAt < PSX_CACHE_MS && !JSON.parse(existing.payload).stale; } catch { /* replace malformed cache */ }
      if (cachedFresh) fresh[path] = existing;
      else {
        const response = await fetcher(PSX_API_ORIGIN + path, { signal: AbortSignal.timeout(25000) });
        if (response.status === 429 || response.status === 503) { failures.push({ path, status: response.status }); break; }
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const value = await response.json();
        if (!value || !('data' in value) || !Number.isFinite(Date.parse(value.meta?.timestamp))) throw new Error('Invalid PSX response');
        const stale = response.headers.get('X-Cache') === 'STALE';
        // Use JSON storage to preserve nulls, empty arrays and numeric-keyed objects in RTDB.
        const entry = { payload: JSON.stringify({ ...value, stale }), fetchedAt: Date.now(), path };
        await db.ref('PSX/api/' + key).set(entry);
        if (!stale) fresh[path] = entry;
        await pause();
      }
      if (jobs.some(([id]) => id === key)) await db.ref('PSX/requests/' + key).remove();
    } catch (error) { failures.push({ path, error: error.message }); }
  }
  if (['/sectors', '/stocks', '/screener'].every(path => fresh[path])) {
    const sectors = JSON.parse(fresh['/sectors'].payload), stocks = JSON.parse(fresh['/stocks'].payload), screener = JSON.parse(fresh['/screener'].payload);
    const reference = buildPsxReference(sectors.data, stocks.data, screener.data, sectors.meta.timestamp);
    await db.ref('PSX/reference').set(reference);
  }
  await db.ref('PSX/syncStatus').set({ checkedAt: new Date().toISOString(), refreshed: Object.keys(fresh).length, failures });
  if (failures.length) console.warn('PSX refresh failures', failures);
}
module.exports = { refreshPsxMarketData };
