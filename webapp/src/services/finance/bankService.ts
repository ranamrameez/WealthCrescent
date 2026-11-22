import { auth } from '../../lib/firebase/client';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import type { BankingReadFilters } from '../../lib/calc/bankReadModel';
import type { PlannedBankTransaction } from '../../types/plannedBank';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { useCategoryStore } from '../../store/categoryStore';
const listeners = new Set<() => void>();
const accounts = new Map<string, ReturnType<typeof buildAccount>>();
const summaries = new Map<string, ReturnType<typeof CalculationEngine.bank.bankingScopeSummary>>();
const directories = new Map<string, ReturnType<typeof CalculationEngine.bank.bankDirectoryReadModel>>();
function invalidate() { accounts.clear(); summaries.clear(); directories.clear(); analyticsScopes.clear(); listeners.forEach(listener => listener()); }
for (const source of [useBankWorkbookStore, useCreditCardWorkbookStore, usePlannedBankWorkbookStore, useCategoryStore]) source.subscribe(invalidate);
let timer: ReturnType<typeof setInterval> | undefined;
export function subscribeBankQueries(listener: () => void) {
  listeners.add(listener); let day = new Date().toISOString().slice(0, 10);
  if (!timer) timer = setInterval(() => { const next = new Date().toISOString().slice(0, 10); if (next !== day) { day = next; invalidate(); } }, 60_000);
  return () => { listeners.delete(listener); if (!listeners.size && timer) { clearInterval(timer); timer = undefined; } };
}
function buildAccount(id: string | undefined, filters: BankingReadFilters, date: string) {
  const bank = useBankWorkbookStore.getState().workbook;
  const categories = useCategoryStore.getState().workbook.categories;
  const account = bank.settings.accounts.find(item => item.id === id);
  const model = CalculationEngine.bank.bankAccountReadModel(account, bank.transactions, usePlannedBankWorkbookStore.getState().workbook.entries, categories, filters, new Date(date + 'T00:00:00.000Z'));
  return { legacyBudgetRows: CalculationEngine.bank.bankLegacyBudgetRows(model.clearedLedger, bank.settings.budgets ?? {}, categories), account, accounts: bank.settings.accounts, banks: bank.settings.banks ?? [], categories,
    ...model,
  };
}
export function getBankAccount(id: string | undefined, filters: BankingReadFilters) {
  const date = new Date().toISOString().slice(0, 10), key = JSON.stringify([date, id, filters]);
  const cached = accounts.get(key); if (cached) return cached;
  const value = buildAccount(id, filters, date); if (accounts.size >= 32) accounts.clear(); accounts.set(key, value); return value;
}
export function getBankingScopeSummary(accountIds: readonly string[], filters: BankingReadFilters, plansOverride?: PlannedBankTransaction[], includeCards = true, bankId?: string) {
  const date = new Date().toISOString().slice(0, 10), key = JSON.stringify([date, [...accountIds].sort(), filters, plansOverride, includeCards, bankId]);
  const cached = summaries.get(key); if (cached) return cached;
  const bank = useBankWorkbookStore.getState().workbook, cards = useCreditCardWorkbookStore.getState().workbook;
  const ids = new Set(accountIds);
  const value = CalculationEngine.bank.bankingScopeSummary(bank.settings.accounts.filter(account => ids.has(account.id)), bank.transactions, cards.cards, cards.transactions,
    plansOverride ?? usePlannedBankWorkbookStore.getState().workbook.entries, useCategoryStore.getState().workbook.categories, filters, new Date(date + 'T00:00:00.000Z'), includeCards, bankId);
  if (summaries.size >= 32) summaries.clear(); summaries.set(key, value); return value;
}

export function bankTransactionMatchesFilters(...args: Parameters<typeof CalculationEngine.bank.bankTransactionMatchesFilters>) { return CalculationEngine.bank.bankTransactionMatchesFilters(...args); }
export function bankPlanMatchesFilters(...args: Parameters<typeof CalculationEngine.bank.bankPlanMatchesFilters>) { return CalculationEngine.bank.bankPlanMatchesFilters(...args); }

export function getBankCategories() { return useCategoryStore.getState().workbook.categories; }
export function getBankAccountAnalytics(input: Omit<Parameters<typeof CalculationEngine.bank.bankAccountAnalyticsModel>[0], 'categories'>) { return CalculationEngine.bank.bankAccountAnalyticsModel({ ...input, categories: getBankCategories() }); }

export function getBankDirectory(showArchived = false) {
  const date = new Date().toISOString().slice(0, 10), key = JSON.stringify([date, showArchived]);
  const cached = directories.get(key); if (cached) return cached;
  const bank = useBankWorkbookStore.getState().workbook, cards = useCreditCardWorkbookStore.getState().workbook;
  const value = CalculationEngine.bank.bankDirectoryReadModel(bank.settings.banks ?? [], bank.settings.accounts, bank.transactions, cards.cards, cards.transactions, getBankCategories(), new Date(date + 'T00:00:00.000Z'), showArchived);
  if (directories.size >= 8) directories.clear(); directories.set(key, value); return value;
}

const analyticsScopes = new Map<string, ReturnType<typeof CalculationEngine.bank.bankAnalyticsAccounts>>();
export function getBankAnalyticsAccounts(bankId: string | undefined, accountId: string) {
  const key = JSON.stringify([bankId, accountId]);
  const cached = analyticsScopes.get(key); if (cached) return cached;
  const result = CalculationEngine.bank.bankAnalyticsAccounts(useBankWorkbookStore.getState().workbook.settings.accounts, bankId, accountId);
  if (analyticsScopes.size >= 32) analyticsScopes.clear();
  analyticsScopes.set(key, result); return result;
}

export function saveLegacyBankBudget(category: string, amount: number, originalCategory?: string) {
  if (!auth?.currentUser) throw new Error('Sign in to save a budget target.');
  const name = category.trim();
  if (!name || !Number.isFinite(amount) || amount <= 0) throw new Error('Enter a category and a positive finite target.');
  const store = useBankWorkbookStore.getState();
  const budgets = { ...store.workbook.settings.budgets };
  if (originalCategory && originalCategory !== name) {
    if (!Object.hasOwn(budgets, originalCategory)) throw new Error('This target no longer exists. Reopen the editor.');
    if (Object.hasOwn(budgets, name)) throw new Error('A target already exists for this category.');
    delete budgets[originalCategory];
  }
  budgets[name] = amount;
  store.setWorkbook({ ...store.workbook, settings: { ...store.workbook.settings, budgets } });
}
