export interface PsxSector { sector_code: string; sector_name: string; advance: number; decline: number; unchanged: number; turnover: number; market_cap_b: number }
export interface PsxScreenerRow { symbol: string; sector?: number | null; price?: number | null; [key: string]: unknown }
export interface PsxReference { sectors: Record<string, PsxSector>; tickerGroups: Record<string, string[]>; tickerSectors: Record<string, string>; symbols: string[]; updatedAt: string; source: string }
export const PSX_API_ORIGIN: string;
export const PSX_CACHE_MS: number;
export const PSX_BASE_PATHS: string[];
export function validPsxPath(path: string): boolean;
export function psxCacheKey(path: string): string;
export function buildPsxReference(sectors: PsxSector[], stocks: string[], screener: PsxScreenerRow[], updatedAt: string): PsxReference;
