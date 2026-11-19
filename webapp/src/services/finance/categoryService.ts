import { auth } from '../../lib/firebase/client';
import { normalizeCategoryKey } from '../../lib/categories';
import { useCategoryStore } from '../../store/categoryStore';
export function subscribeCategories(listener: () => void) { return useCategoryStore.subscribe(listener); }
export function getCategories() { return useCategoryStore.getState().workbook.categories; }
export function createCustomCategory(name: string) {
  if (!auth?.currentUser) throw new Error('Sign in to add a category.');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a category name.');
  if (getCategories().some(category => normalizeCategoryKey(category.name) === normalizeCategoryKey(trimmed))) {
    throw new Error('A category with this name already exists. Select it from the list.');
  }
  return useCategoryStore.getState().addCategory(trimmed);
}
