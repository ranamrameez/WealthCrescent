// One-off bootstrap. Only --write mutates the owned PSX reference/cache paths.
// For protected databases, supply an existing Firebase ID token in PSX_FIREBASE_ID_TOKEN.
import { PSX_API_ORIGIN, buildPsxReference, psxCacheKey } from './psxDataModel.mjs';
const write = process.argv.includes('--write');
const database = 'https://qse-app-default-rtdb.asia-southeast1.firebasedatabase.app';
const token = process.env.PSX_FIREBASE_ID_TOKEN;
const endpoint = path => database + path + '.json' + (token ? '?auth=' + encodeURIComponent(token) : '');
const paths = ['/sectors', '/stocks', '/screener'];
const payloads = {};
try {
  for (const path of paths) {
    const response = await fetch(PSX_API_ORIGIN + path, { signal: AbortSignal.timeout(25000) });
    if (!response.ok || response.headers.get('X-Cache') === 'STALE') throw new Error('Fresh PSX data unavailable: HTTP ' + response.status);
    const body = await response.json();
    if (!Number.isFinite(Date.parse(body.meta?.timestamp))) throw new Error('Invalid PSX response');
    payloads[path] = body;
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  const reference = buildPsxReference(payloads['/sectors'].data, payloads['/stocks'].data, payloads['/screener'].data, payloads['/sectors'].meta.timestamp);
  console.log(JSON.stringify({ sectors: Object.keys(reference.sectors).length, symbols: reference.symbols.length, mapped: Object.keys(reference.tickerSectors).length, unclassified: reference.tickerGroups.unknown?.length || 0, write }));
  if (write) {
    const existing = await fetch(endpoint('/PSX/reference'), { signal: AbortSignal.timeout(20000) });
    if (!existing.ok) throw new Error('Database access denied or unavailable (HTTP ' + existing.status + '). Supply an authorized Firebase ID token. No database write attempted.');
    const updates = { reference };
    for (const path of paths) updates['api/' + psxCacheKey(path)] = { path, fetchedAt: Date.now(), payload: JSON.stringify(payloads[path]) };
    const response = await fetch(endpoint('/PSX'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Database update failed (HTTP ' + response.status + ').');
    const verify = await fetch(endpoint('/PSX/reference'), { signal: AbortSignal.timeout(20000) });
    const saved = await verify.json();
    if (!verify.ok || saved.updatedAt !== reference.updatedAt || saved.symbols?.length !== reference.symbols.length) throw new Error('Database verification failed.');
    console.log('PSX reference and essential API cache saved and verified.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
