import { PSX_API_ORIGIN } from './psxDataModel.mjs';
for (const path of ['/health', '/stocks', '/screener', '/indices', '/stocks/OGDC/quote', '/stocks/OGDC/historical?start=2026-10-01&end=2026-10-22', '/stocks/OGDC/fundamentals', '/sectors/CEMENT/stocks', '/indices/KSE100', '/debt-market', '/eligible-scrips']) {
  try {
    const response = await fetch(PSX_API_ORIGIN + path, { signal: AbortSignal.timeout(25000) });
    const body = await response.json();
    console.log(JSON.stringify({ path, status: response.status, meta: body.meta, shape: Array.isArray(body.data) ? 'array' : typeof body.data, count: Array.isArray(body.data) ? body.data.length : undefined, fields: Object.keys((Array.isArray(body.data) ? body.data[0] : body.data) || {}) }));
  } catch (error) { console.log(path, error.message); }
  await new Promise(resolve => setTimeout(resolve, 1200));
}
