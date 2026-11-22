import { afterEach, expect, it, vi } from 'vitest';
import { readSuggestedLinkPreferences, saveSuggestedLinkPreferences } from './suggestedLinkPreferencesService';
const auth = vi.hoisted(() => ({ uid: 'fixture' as string | undefined }));
vi.mock('../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => auth.uid ? { uid: auth.uid } : null }));
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); auth.uid = 'fixture'; });
it('round-trips per-account rejection and popup settings and tolerates malformed saved preferences', () => {
  expect(readSuggestedLinkPreferences('fixture')).toEqual({ popup: false, rejected: [] });
  saveSuggestedLinkPreferences('fixture', { popup: true, rejected: ['one', 'one', 'two'] });
  expect(readSuggestedLinkPreferences('fixture')).toEqual({ popup: true, rejected: ['one', 'two'] });
  localStorage.setItem('wc:suggested-links:fixture', '{malformed');
  expect(readSuggestedLinkPreferences('fixture')).toEqual({ popup: false, rejected: [] });
});
it('denies foreign-account writes and hides the previous account preferences after sign-out', () => {
  saveSuggestedLinkPreferences('fixture', { popup: true, rejected: ['one'] });
  expect(() => saveSuggestedLinkPreferences('other', { popup: true, rejected: [] })).toThrow(/Sign in/);
  auth.uid = undefined;
  expect(readSuggestedLinkPreferences('fixture')).toEqual({ popup: false, rejected: [] });
  expect(() => saveSuggestedLinkPreferences('fixture', { popup: false, rejected: [] })).toThrow(/Sign in/);
  auth.uid = 'fixture';
  expect(readSuggestedLinkPreferences('fixture')).toEqual({ popup: true, rejected: ['one'] });
});
it('reports storage failures rather than claiming the decision was saved', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(() => saveSuggestedLinkPreferences('fixture', { popup: true, rejected: ['one'] })).toThrow(/could not be saved/);
});
