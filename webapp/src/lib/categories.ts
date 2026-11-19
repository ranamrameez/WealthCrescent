import type { Category } from '../types/finance';

/** Previously bundled personal labels remain custom in existing workbooks.
 * Never rewrite their IDs or transaction references, or seed them for new users. */
export const LEGACY_PERSONAL_CATEGORIES: Category[] = [
  {
    "id": "cat_inevitable",
    "name": "Inevitable",
    "serialNumber": 1,
    "scope": "custom"
  },
  {
    "id": "cat_accomodation",
    "name": "Accomodation",
    "serialNumber": 2,
    "scope": "custom"
  },
  {
    "id": "cat_extra",
    "name": "Extra",
    "serialNumber": 3,
    "scope": "custom"
  },
  {
    "id": "cat_reserve",
    "name": "Reserve",
    "serialNumber": 4,
    "scope": "custom"
  },
  {
    "id": "cat_misk",
    "name": "Misk",
    "serialNumber": 5,
    "scope": "custom"
  },
  {
    "id": "cat_touring",
    "name": "Touring",
    "serialNumber": 6,
    "scope": "custom"
  },
  {
    "id": "cat_saving",
    "name": "Saving",
    "serialNumber": 7,
    "scope": "custom"
  },
  {
    "id": "cat_pakistan",
    "name": "Pakistan",
    "serialNumber": 8,
    "scope": "custom"
  },
  {
    "id": "cat_ignore",
    "name": "Ignore",
    "serialNumber": 9,
    "scope": "custom"
  },
  {
    "id": "cat_ignore_count",
    "name": "IgnoreCount",
    "serialNumber": 10,
    "scope": "custom"
  },
  {
    "id": "cat_psx",
    "name": "PSX",
    "serialNumber": 11,
    "scope": "custom"
  },
  {
    "id": "cat_rent_car_wash",
    "name": "Rent: Car Wash",
    "serialNumber": 12,
    "scope": "custom"
  }
];
export const LEGACY_PERSONAL_CATEGORY_IDS = new Set(LEGACY_PERSONAL_CATEGORIES.map(c => c.id));

/** General-purpose defaults. Stable existing general/system IDs are retained.
 * Categories are labels; they do not determine accounting treatment. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_grocery', serialNumber: 1, name: 'Grocery', scope: 'app' },
  { id: 'cat_travel', serialNumber: 4, name: 'Travel', scope: 'app' },
  { id: 'cat_health', serialNumber: 5, name: 'Health', scope: 'app' },
  { id: 'cat_credit_card_payment', serialNumber: 6, name: 'Credit Card Payment', scope: 'app' },
  { id: 'cat_income', serialNumber: 7, name: 'Income', scope: 'app' },
  { id: 'cat_medical', serialNumber: 14, name: 'Medical', scope: 'app' },
  { id: 'cat_food', serialNumber: 15, name: 'Food', scope: 'app' },
  { id: 'cat_transfer', serialNumber: 16, name: 'Transfer', scope: 'app' },
  { id: 'cat_bill', serialNumber: 19, name: 'Bill', scope: 'app' },
  { id: 'cat_others', serialNumber: 21, name: 'Others', scope: 'app' },
  { id: 'cat_reconcile', serialNumber: 22, name: 'Reconcile', scope: 'app' },
  { id: 'cat_reconciliation_adjustment', serialNumber: 23, name: 'Reconciliation adjustment', scope: 'app' },
  { id: 'cat_rent', serialNumber: 24, name: 'Rent', scope: 'app' },
  { id: 'cat_opening_balance', serialNumber: 26, name: 'Opening balance', scope: 'app' },
  { id: 'cat_uncategorized', serialNumber: 27, name: 'Uncategorized', scope: 'app' },
  { id: 'cat_loan_borrowed', serialNumber: 28, name: 'Loan: Borrowed', scope: 'app' },
  { id: 'cat_loan_lent', serialNumber: 29, name: 'Loan: Lent', scope: 'app' },
  { id: 'cat_standard_housing', serialNumber: 30, name: 'Housing', scope: 'app' },
  { id: 'cat_standard_utilities', serialNumber: 31, name: 'Utilities', scope: 'app' },
  { id: 'cat_standard_transport', serialNumber: 32, name: 'Transport', scope: 'app' },
  { id: 'cat_standard_dining_out', serialNumber: 33, name: 'Dining Out', scope: 'app' },
  { id: 'cat_standard_education', serialNumber: 34, name: 'Education', scope: 'app' },
  { id: 'cat_standard_insurance', serialNumber: 35, name: 'Insurance', scope: 'app' },
  { id: 'cat_standard_shopping', serialNumber: 36, name: 'Shopping', scope: 'app' },
  { id: 'cat_standard_entertainment', serialNumber: 37, name: 'Entertainment', scope: 'app' },
  { id: 'cat_standard_personal_care', serialNumber: 38, name: 'Personal Care', scope: 'app' },
  { id: 'cat_standard_family_childcare', serialNumber: 39, name: 'Family & Childcare', scope: 'app' },
  { id: 'cat_standard_gifts_donations', serialNumber: 40, name: 'Gifts & Donations', scope: 'app' },
  { id: 'cat_standard_taxes', serialNumber: 41, name: 'Taxes', scope: 'app' },
  { id: 'cat_standard_bank_fees', serialNumber: 42, name: 'Bank Fees', scope: 'app' },
  { id: 'cat_standard_salary', serialNumber: 43, name: 'Salary', scope: 'app' },
  { id: 'cat_standard_business_income', serialNumber: 44, name: 'Business Income', scope: 'app' },
  { id: 'cat_standard_investment_income', serialNumber: 45, name: 'Investment Income', scope: 'app' },
  { id: 'cat_standard_savings', serialNumber: 46, name: 'Savings', scope: 'app' },
  { id: 'cat_standard_investments', serialNumber: 47, name: 'Investments', scope: 'app' },
  { id: 'cat_standard_pets', serialNumber: 48, name: 'Pets', scope: 'app' },
  { id: 'cat_standard_miscellaneous', serialNumber: 49, name: 'Miscellaneous', scope: 'app' },
];

/** Every id from `DEFAULT_CATEGORIES`, for cheap membership checks
 * (`categoryStore.ts`'s `normalize()`, `renameCategory`/`deleteCategory`'s
 * app-category guard) without re-scanning the array each time. */
export const DEFAULT_CATEGORY_IDS = new Set(DEFAULT_CATEGORIES.map((c) => c.id));

export const UNCATEGORIZED_ID = 'cat_uncategorized';
/** Used by `lib/interEntityLink.ts`'s `buildSideRecord` for the Cash/Bank
 * side of an inter-module link — a linked transfer's own real category. */
export const TRANSFER_CATEGORY_ID = 'cat_transfer';
/** Used by `RentalsPage.tsx`'s semi-automated rent-collection flow — the
 * category a logged rent-income entry gets, same as the pre-restructure
 * hardcoded `category: 'Rent'`. */
export const RENT_CATEGORY_ID = 'cat_rent';
export const PERSONAL_LOAN_BORROWED_CATEGORY_ID = 'cat_loan_borrowed';
export const PERSONAL_LOAN_LENT_CATEGORY_ID = 'cat_loan_lent';

/** Matches how two category strings are compared for a "safe" merge: trim,
 * lowercase, and collapse any run of hyphens/spaces to one space — enough
 * to recognize "CC-Payment" and "CC payment" as the same category without
 * conflating genuinely different names. */
export function normalizeCategoryKey(name: string): string {
  return name.trim().toLowerCase().replace(/[-\s]+/g, ' ').trim();
}

/** Finds an existing category whose name matches (after normalization) —
 * used both by the one-time legacy-data migration and by any later record
 * that still carries the old free-text `category` field. */
export function findCategoryByName(name: string, categories: Category[]): Category | undefined {
  const key = normalizeCategoryKey(name);
  if (!key) return undefined;
  return categories.find((c) => normalizeCategoryKey(c.name) === key);
}

/** Resolves a `categoryID` to its display name — the one place every
 * category-breakdown chart/table looks this up, so a renamed or deleted
 * category can't leave a stale name baked into old chart code. Falls back
 * to "Uncategorized" for an id that's missing or no longer exists (e.g. the
 * category registry hasn't loaded yet, or was deleted after being used). */
export function categoryName(categoryID: string | undefined, categories: Category[]): string {
  if (!categoryID) return 'Uncategorized';
  return categories.find((c) => c.id === categoryID)?.name ?? 'Uncategorized';
}
