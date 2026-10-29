import { describe, expect, it } from 'vitest';
import { createDefaultPSXBrokerSettings, createEmptyPSXWorkbook } from '../defaultPsxWorkbook';

describe('PSX broker application defaults', () => {
  it('enables higher-value-leg intraday commission netting for JS Zindagi and AHL', () => {
    const workbook = createEmptyPSXWorkbook();
    expect(workbook.brokerProfiles?.find(p => p.name === 'JS Zindagi')?.settings.sameDayNettingRule).toBe('higherValueSide');
    expect(workbook.brokerProfiles?.find(p => p.name === 'AL Habib Capital Markets')?.settings.sameDayNettingRule).toBe('higherValueSide');
    expect(createDefaultPSXBrokerSettings('AHL').sameDayNettingRule).toBe('higherValueSide');
  });

  it('starts new named broker profiles from their own app defaults, not active broker settings', () => {
    expect(createDefaultPSXBrokerSettings('Al Habib Ltd')).toMatchObject({
      feePct: 0.15, lowPriceThreshold: 20, lowPriceFee: 0.03, sameDayNettingRule: 'higherValueSide',
    });
    expect(createDefaultPSXBrokerSettings('New Broker').sameDayNettingRule).toBe('none');
    expect(createDefaultPSXBrokerSettings('JS Zindagi')).toMatchObject({
      feePct: 0.2, lowPriceThreshold: 25, lowPriceFee: 0.05, sameDayNettingRule: 'higherValueSide',
    });
  });
});
