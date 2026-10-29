import { APP_MODULES } from '../components/ModuleSelectionModal';
import { saveModulePreference } from '../lib/firebase/profile';
import { APP_DEFAULTS_VERSION } from './appDefaults';
import { useAppearanceStore } from './appearanceStore';
import { DEFAULT_BANK_SETTINGS } from './defaultBankWorkbook';
import { DEFAULT_CASH_SETTINGS } from './defaultCashWorkbook';
import { DEFAULT_EMI_SETTINGS } from './defaultEmiWorkbook';
import { DEFAULT_FUNDS_SETTINGS } from './defaultFundsWorkbook';
import { DEFAULT_PERSONAL_LOANS_SETTINGS } from './defaultPersonalLoansWorkbook';
import { DEFAULT_PLANNED_BANK_SETTINGS } from './defaultPlannedBankWorkbook';
import { DEFAULT_PLANNED_CASH_SETTINGS } from './defaultPlannedCashWorkbook';
import { DEFAULT_PLANNED_CREDIT_CARD_SETTINGS } from './defaultPlannedCreditCardWorkbook';
import { DEFAULT_RENTAL_SETTINGS } from './defaultRentalsWorkbook';
import { DEFAULT_SUBSCRIPTIONS_SETTINGS } from './defaultSubscriptionsWorkbook';
import { DEFAULT_SETTINGS } from './defaultWorkbook';
import { createDefaultPSXBrokerSettings, DEFAULT_PSX_SETTINGS } from './defaultPsxWorkbook';
import { useBankWorkbookStore } from './bankWorkbookStore';
import { useCashWorkbookStore } from './cashWorkbookStore';
import { useEMIWorkbookStore } from './emiWorkbookStore';
import { useFundsWorkbookStore } from './fundsWorkbookStore';
import { usePersonalLoansWorkbookStore } from './personalLoansWorkbookStore';
import { usePlannedBankWorkbookStore } from './plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from './plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from './plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from './plannedRentalsWorkbookStore';
import { useRentalsWorkbookStore } from './rentalsWorkbookStore';
import { useSubscriptionsWorkbookStore } from './subscriptionsWorkbookStore';
import { useInterEntityTransfersStore } from './interEntityTransfersStore';
import { useNetWorthSnapshotsWorkbookStore } from './netWorthSnapshotsWorkbookStore';
import { useEnabledCurrenciesStore } from './enabledCurrenciesStore';
import { usePSXWorkbookStore } from './psxWorkbookStore';
import { useWorkbookStore } from './workbookStore';

/**
 * Restore settings and UI preferences to current application defaults while
 * preserving all financial records, user-created entities, categories, groups,
 * and account identity. Cloud workbook hooks observe the store updates and
 * sync them through the existing per-module paths.
 */
export async function resetAllSettingsToAppDefaults(uid?: string): Promise<void> {
  const qse = useWorkbookStore.getState().workbook;
  const qseProfiles = qse.brokerProfiles.map((profile) => ({
    ...profile,
    settings: { ...DEFAULT_SETTINGS },
    settingsDefaultsVersion: APP_DEFAULTS_VERSION,
  }));
  const activeQse = qseProfiles.find((profile) => profile.id === qse.activeBrokerId);
  useWorkbookStore.getState().setWorkbook({
    ...qse,
    settings: { ...(activeQse?.settings ?? DEFAULT_SETTINGS) },
    brokerProfiles: qseProfiles,
  });

  const psx = usePSXWorkbookStore.getState().workbook;
  const psxProfiles = psx.brokerProfiles.map((profile) => ({
    ...profile,
    settings: createDefaultPSXBrokerSettings(profile.name),
    settingsDefaultsVersion: APP_DEFAULTS_VERSION,
  }));
  const activePsx = psxProfiles.find((profile) => profile.id === psx.activeBrokerId);
  usePSXWorkbookStore.getState().setWorkbook({
    ...psx,
    settings: { ...(activePsx?.settings ?? DEFAULT_PSX_SETTINGS) },
    brokerProfiles: psxProfiles,
  });

  const bankStore = useBankWorkbookStore.getState();
  const bank = bankStore.workbook;
  bankStore.setWorkbook({
    ...bank,
    settings: {
      ...DEFAULT_BANK_SETTINGS,
      // Accounts and banks are user-owned entities, not preferences.
      accounts: bank.settings.accounts,
      banks: bank.settings.banks,
    },
  });

  const cashStore = useCashWorkbookStore.getState();
  cashStore.setWorkbook({ ...cashStore.workbook, settings: { ...DEFAULT_CASH_SETTINGS } });

  const emiStore = useEMIWorkbookStore.getState();
  emiStore.setWorkbook({ ...emiStore.workbook, settings: { ...DEFAULT_EMI_SETTINGS } });

  const fundsStore = useFundsWorkbookStore.getState();
  fundsStore.setWorkbook({ ...fundsStore.workbook, settings: { ...DEFAULT_FUNDS_SETTINGS } });

  const loansStore = usePersonalLoansWorkbookStore.getState();
  loansStore.setWorkbook({ ...loansStore.workbook, settings: { ...DEFAULT_PERSONAL_LOANS_SETTINGS } });

  const plannedBankStore = usePlannedBankWorkbookStore.getState();
  plannedBankStore.setWorkbook({ ...plannedBankStore.workbook, settings: { ...DEFAULT_PLANNED_BANK_SETTINGS } });

  const plannedCashStore = usePlannedCashWorkbookStore.getState();
  plannedCashStore.setWorkbook({ ...plannedCashStore.workbook, settings: { ...DEFAULT_PLANNED_CASH_SETTINGS } });

  const plannedCardStore = usePlannedCreditCardWorkbookStore.getState();
  plannedCardStore.setWorkbook({ ...plannedCardStore.workbook, settings: { ...DEFAULT_PLANNED_CREDIT_CARD_SETTINGS } });

  const plannedRentalsStore = usePlannedRentalsWorkbookStore.getState();
  plannedRentalsStore.setWorkbook({ ...plannedRentalsStore.workbook, settings: {} });

  const rentalsStore = useRentalsWorkbookStore.getState();
  const rentals = rentalsStore.workbook;
  rentalsStore.setWorkbook({
    ...rentals,
    settings: {
      ...DEFAULT_RENTAL_SETTINGS,
      // Property definitions are financial entities and must survive reset.
      properties: rentals.settings.properties,
    },
  });

  const subscriptionsStore = useSubscriptionsWorkbookStore.getState();
  subscriptionsStore.setWorkbook({ ...subscriptionsStore.workbook, settings: { ...DEFAULT_SUBSCRIPTIONS_SETTINGS } });

  const interEntityStore = useInterEntityTransfersStore.getState();
  interEntityStore.setWorkbook({ ...interEntityStore.workbook, settings: {} });

  const netWorthStore = useNetWorthSnapshotsWorkbookStore.getState();
  netWorthStore.setWorkbook({ ...netWorthStore.workbook, settings: {} });

  useAppearanceStore.getState().resetToDefaults();
  useEnabledCurrenciesStore.getState().setEnabledCodes(null);

  const defaultModules = APP_MODULES.map(([id]) => id);
  try {
    localStorage.setItem(`wealthcrescent:modules:${uid ?? 'guest'}`, JSON.stringify(defaultModules));
  } catch (error) {
    console.warn('Could not persist default module visibility locally.', error);
  }
  if (uid) await saveModulePreference(uid, defaultModules);
}
