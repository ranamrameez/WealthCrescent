import { PSX_TICKER_NAMES, PSX_TICKER_SECTORS } from '../../../lib/stockData/psxSeed';
import { useMemo } from 'react';
import { usePsxReferenceStore } from './usePsxReference';

/** Database sector memberships augment the bundled company-name fallback. */
export function usePSXStockData() {
  const reference = usePsxReferenceStore(state => state.data);
  return useMemo(() => ({ tickerNames: PSX_TICKER_NAMES, sectors: { ...PSX_TICKER_SECTORS, ...Object.fromEntries(Object.entries(reference?.tickerSectors || {}).filter(([, code]) => reference?.sectors[code]).map(([symbol, code]) => [symbol, reference!.sectors[code].sector_name])) } }), [reference]);
}
