import { afterEach, expect, it, vi } from 'vitest';
const account = vi.hoisted(() => ({ currentUser: null as null | { uid: string } }));
vi.mock('../../lib/firebase/client', () => ({ auth: account }));
import { createCustomCategory, getCategories, subscribeCategories } from './categoryService';
import { useCategoryStore } from '../../store/categoryStore';
const original = useCategoryStore.getState().workbook;
afterEach(() => { account.currentUser = null; useCategoryStore.getState().setWorkbook(original); });
it('rejects unauthenticated, empty and duplicate names without changing the registry', () => {
  const categories = getCategories();
  expect(() => createCustomCategory('New')).toThrow('Sign in');
  account.currentUser = { uid: 'test' };
  expect(() => createCustomCategory('  ')).toThrow('Enter');
  expect(() => createCustomCategory(' grocery ')).toThrow('already exists');
  expect(getCategories()).toBe(categories);
});
it('creates a custom category and notifies subscribed consumers', () => {
  account.currentUser = { uid: 'test' }; const listener = vi.fn(); const unsubscribe = subscribeCategories(listener);
  try {
    const created = createCustomCategory('  My category  ');
    expect(created).toMatchObject({ name: 'My category', scope: 'custom' });
    expect(getCategories()).toContainEqual(created); expect(listener).toHaveBeenCalled();
    expect(() => createCustomCategory('My-category')).toThrow('already exists');
  } finally { unsubscribe(); }
});
