import { create } from 'zustand';
import type { Appearance } from '../types/workbook';
import { DEFAULT_COLOR_THEME, normalizeColorTheme } from '../themes/catalog';

const STORAGE_KEY = 'WealthCrescent_appearance_v1';

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'light',
  font: 'body',
  fontSize: 'medium',
  colorTheme: DEFAULT_COLOR_THEME,
  density: 'comfortable',
  numberDisplay: 'compact',
  dateFormat: 'DD-MMM-YYYY',
};

const DATE_FORMATS = new Set([
  'DD-MMM-YYYY','YYYY-MMM-DD','DD-MM-YYYY','MM-DD-YYYY',
  'DD/MM/YYYY','MM/DD/YYYY','dddd, MMM DD, YYYY','ddd, DD MMM, YYYY',
]);

function load(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Appearance>;
      const legacy = parsed.dateFormat;
      const dateFormat = typeof legacy === 'string' && DATE_FORMATS.has(legacy)
        ? legacy
        : DEFAULT_APPEARANCE.dateFormat;
      return { ...DEFAULT_APPEARANCE, ...parsed, dateFormat, colorTheme: normalizeColorTheme(parsed.colorTheme) } as Appearance;
    }
  } catch {
    /* ignore, fall through to defaults */
  }
  return { ...DEFAULT_APPEARANCE };
}

function persist(a: Appearance) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch (e) {
    console.warn('Failed to save appearance preference', e);
  }
}

interface AppearanceState {
  appearance: Appearance;
  update: (patch: Partial<Appearance>) => void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  appearance: load(),

  update: (patch) => {
    const next = { ...get().appearance, ...patch };
    next.colorTheme = normalizeColorTheme(next.colorTheme);
    set({ appearance: next });
    persist(next);
  },
}));
