import { getCurrentUser } from '../../lib/firebase/useAuthState';

export interface SuggestedLinkPreferences { popup: boolean; rejected: string[] }
const defaults = (): SuggestedLinkPreferences => ({ popup: false, rejected: [] });
const storageKey = (owner: string) => 'wc:suggested-links:' + owner;

/** Review preferences stay local to this device; native approvals use synced workbooks. */
export function readSuggestedLinkPreferences(owner?: string): SuggestedLinkPreferences {
  if (!owner || getCurrentUser()?.uid !== owner) return defaults();
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(owner)) ?? 'null');
    return { popup: value?.popup === true, rejected: Array.isArray(value?.rejected)
      ? [...new Set<string>(value.rejected.filter((id: unknown): id is string => typeof id === 'string'))] : [] };
  } catch {
    return defaults();
  }
}

export function saveSuggestedLinkPreferences(owner: string, preferences: SuggestedLinkPreferences) {
  if (getCurrentUser()?.uid !== owner) throw new Error('Sign in to this account before changing review preferences.');
  if (typeof preferences.popup !== 'boolean' || !Array.isArray(preferences.rejected) || preferences.rejected.some(id => typeof id !== 'string')) {
    throw new Error('Invalid review preferences.');
  }
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify({ popup: preferences.popup, rejected: [...new Set(preferences.rejected)] }));
  } catch {
    throw new Error('Preferences could not be saved on this device.');
  }
}
