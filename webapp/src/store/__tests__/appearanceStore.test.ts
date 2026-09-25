import { beforeEach, expect, it, vi } from 'vitest';

const key = 'WealthCrescent_appearance_v1';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

it('uses a selectable theme for new users', async () => {
  const { useAppearanceStore } = await import('../appearanceStore');
  expect(useAppearanceStore.getState().appearance.colorTheme).toBe('ocean');
});

it.each(['wine', 'bright', 'sunset', 'rose', 'sage', 'material-purple', 'unknown', null])(
  'recovers retired or invalid saved theme %s without losing other preferences', async (colorTheme) => {
    localStorage.setItem(key, JSON.stringify({ colorTheme, theme: 'dark', density: 'compact' }));
    const { useAppearanceStore } = await import('../appearanceStore');
    expect(useAppearanceStore.getState().appearance).toMatchObject({
      colorTheme: 'ocean', theme: 'dark', density: 'compact',
    });
  },
);

it('persists theme changes and restores them on reload', async () => {
  const { COLOR_THEMES } = await import('../../themes/catalog');
  for (const [colorTheme] of COLOR_THEMES.flatMap(group => group.options)) {
    const { useAppearanceStore } = await import('../appearanceStore');
    useAppearanceStore.getState().update({ colorTheme, theme: 'dark' });
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ colorTheme, theme: 'dark' });
    vi.resetModules();
    const reloaded = await import('../appearanceStore');
    expect(reloaded.useAppearanceStore.getState().appearance.colorTheme).toBe(colorTheme);
  }
});

it('normalizes invalid theme updates before saving', async () => {
  const { useAppearanceStore } = await import('../appearanceStore');
  useAppearanceStore.getState().update({ colorTheme: 'wine' });
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ colorTheme: 'ocean' });
});
