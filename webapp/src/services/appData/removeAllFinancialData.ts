import { ref, update } from 'firebase/database';
import { auth, db, firebaseReady } from '../../lib/firebase/client';
import { beginWorkbookMaintenance } from '../../lib/firebase/workbookMaintenance';
import { resetAllLocalWorkbooks } from '../../lib/resetLocalData';
import { CLOUD_PATH_SUFFIX, CREATE_EMPTY } from './workbookRegistry';

/** Explicit confirmed user command; never invoked by mounting or signing in. */
export async function removeAllFinancialData(expectedUid: string) {
  if (!firebaseReady || !db || !auth?.currentUser || auth.currentUser.uid !== expectedUid) {
    throw new Error('Your sign-in changed. Sign in and confirm removal again.');
  }
  const finish = beginWorkbookMaintenance();
  try {
    const updates: Record<string, unknown> = {};
    const updated = new Date().toISOString();
    for (const key of Object.keys(CREATE_EMPTY) as Array<keyof typeof CREATE_EMPTY>) {
      updates[CLOUD_PATH_SUFFIX[key]] = JSON.parse(JSON.stringify({ ...CREATE_EMPTY[key](), _updated: updated }));
    }
    // One acknowledged multi-path update: no partial deletion across modules.
    // Empty shapes intentionally replace data rather than null, preserving cloud-first sync.
    await update(ref(db, 'users/' + expectedUid), updates);
    if (auth.currentUser?.uid === expectedUid) resetAllLocalWorkbooks();
  } finally { finish(); }
}
