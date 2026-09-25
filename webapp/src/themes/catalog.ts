export const COLOR_THEMES = [
  { group: 'Classic rounded themes', options: [
    ['ocean', 'Ocean (Finance Blue)'],
    ['forest', 'Forest (Finance Green)'],
    ['violet', 'Violet (Market Purple)'],
  ] },
  { group: 'Modern finance themes', options: [
    ['aurora', 'Aurora (Indigo)'],
    ['cobalt', 'Cobalt (Finance Blue)'],
    ['teal', 'Teal (Blue-Green)'],
    ['copper', 'Copper (Market Orange)'],
    ['gold', 'Gold (Wealth)'],
  ] },
  { group: 'Material themes', options: [
    ['material-teal', 'Material Teal'],
  ] },
];

export const DEFAULT_COLOR_THEME = 'ocean';
const themeIds = new Set(COLOR_THEMES.flatMap(group => group.options.map(([id]) => id)));

/** Retired or invalid saved themes use the selectable default. */
export function normalizeColorTheme(value: unknown): string {
  return typeof value === 'string' && themeIds.has(value) ? value : DEFAULT_COLOR_THEME;
}
