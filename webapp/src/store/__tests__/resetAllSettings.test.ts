import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

it('resets app settings and appearance while preserving financial records', async () => {
  const [{ useWorkbookStore }, { usePSXWorkbookStore }, { useCashWorkbookStore }, { useAppearanceStore }, { resetAllSettingsToAppDefaults }, { createEmptyWorkbook }, { createEmptyPSXWorkbook }, { createEmptyCashWorkbook }, { DEFAULT_APPEARANCE }] = await Promise.all([
    import('../workbookStore'),
    import('../psxWorkbookStore'),
    import('../cashWorkbookStore'),
    import('../appearanceStore'),
    import('../resetAllSettings'),
    import('../defaultWorkbook'),
    import('../defaultPsxWorkbook'),
    import('../defaultCashWorkbook'),
    import('../appearanceStore'),
  ]);

  const qse = createEmptyWorkbook();
  const qseTransaction = { date: '2026-10-01', ticker: 'ABC', action: 'BUY' as const, shares: 2, price: 10 };
  useWorkbookStore.getState().setWorkbook({
    ...qse,
    settings: { ...qse.settings, feePct: 9 },
    transactions: [qseTransaction],
    marketPrices: { ABC: 12 },
  });

  const psx = createEmptyPSXWorkbook();
  const psxTransaction = { date: '2026-10-02', ticker: 'XYZ', action: 'BUY' as const, shares: 3, price: 20 };
  usePSXWorkbookStore.getState().setWorkbook({
    ...psx,
    settings: { ...psx.settings, feePct: 9 },
    transactions: [psxTransaction],
  });

  const cash = createEmptyCashWorkbook();
  useCashWorkbookStore.getState().setWorkbook({
    ...cash,
    settings: { defaultCurrency: 'QAR' },
    entries: [{ id: 'keep-me', amount: 123 } as never],
  });

  useAppearanceStore.getState().update({ theme: 'dark', fontSize: 'xl', colorTheme: 'forest' });
  await resetAllSettingsToAppDefaults();

  expect(useWorkbookStore.getState().workbook.settings.feePct).toBe(0.275);
  expect(useWorkbookStore.getState().workbook.transactions).toEqual([qseTransaction]);
  expect(useWorkbookStore.getState().workbook.marketPrices).toEqual({ ABC: 12 });

  expect(usePSXWorkbookStore.getState().workbook.settings.feePct).toBe(0.2);
  expect(usePSXWorkbookStore.getState().workbook.transactions).toEqual([psxTransaction]);
  expect(usePSXWorkbookStore.getState().workbook.brokerProfiles.find(p => p.name === 'AL Habib Capital Markets')?.settings.sameDayNettingRule).toBe('higherValueSide');

  expect(useCashWorkbookStore.getState().workbook.settings.defaultCurrency).toBe('USD');
  expect(useCashWorkbookStore.getState().workbook.entries).toHaveLength(1);
  expect(useCashWorkbookStore.getState().workbook.entries[0]).toMatchObject({ id: 'keep-me', amount: 123 });
  expect(useAppearanceStore.getState().appearance).toEqual(DEFAULT_APPEARANCE);
});
