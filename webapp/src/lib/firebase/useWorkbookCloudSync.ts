import { fingerprint } from './workbookFingerprint';
import { workbookSyncEpoch, workbookSyncPaused } from './workbookMaintenance';
import type { User } from 'firebase/auth';
import { onValue, ref, runTransaction } from 'firebase/database';
import { useEffect, useRef, useState } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { db, firebaseReady } from './client';

const PUSH_DEBOUNCE_MS = 900;

/** The only shape this hook actually touches — `workbook` and `setWorkbook`
 * — deliberately smaller than the full stock-exchange `WorkbookStoreState`
 * (which also has addTransaction/addTransfer/etc. this hook never calls).
 * Any store built from any factory (`createWorkbookStore`,
 * `createEntryStore`, ...) satisfies this structurally, so non-stock
 * modules (Cash, Personal Loans, ...) can reuse this same sync hook instead
 * of a second copy of the pull/push/safety logic. */
export interface MinimalWorkbookStore<TWorkbook> {
  workbook: TWorkbook;
  setWorkbook: (wb: TWorkbook, opts?: { skipPersist?: boolean }) => void;
}

/** Firebase Realtime Database's `set()` throws synchronously — before even
 * making the network call — if the value tree contains a literal
 * `undefined` anywhere (a `catch()` on the returned promise never sees it).
 * Several add-forms across modules write `field: x?.trim() || undefined`
 * for an empty optional field (e.g. a loan's `note`, an entry's
 * `category`) — perfectly fine for local state, but a real crash the
 * moment that record reaches this push path. Round-tripping through JSON
 * strips every `undefined` object property (and turns an `undefined` array
 * element into `null`, which Firebase does accept) without needing to hunt
 * down and fix every call site that can produce one. Found via a real user
 * report: Personal Loans data failed to sync because a loan saved without
 * a note carried `note: undefined`. */
export function stripUndefinedDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Generic per-module Firebase sync, factored out so every module (QSE,
 * PSX, Cash, ...) shares one implementation instead of N copies of the
 * same pull/push/safety logic.
 *
 * SAFETY: this must never write to the cloud based on an *assumption* that
 * it's empty. An earlier version treated a null first snapshot as "no cloud
 * data yet" and auto-uploaded local (possibly empty/default) data over it —
 * that destroyed a real portfolio. Now: if the cloud looks empty, this only
 * reports that fact (`cloudEmpty`) and waits for the user to explicitly
 * confirm via `uploadLocalToCloud()`. Subsequent local edits compare the
 * last loaded or committed snapshot with the server before writing. */
export function useWorkbookCloudSync<TWorkbook>(
  cloudPathSuffix: string,
  useStore: UseBoundStore<StoreApi<MinimalWorkbookStore<TWorkbook>>>,
  user: User | null,
  createEmpty: () => TWorkbook,
) {
  const [status, setStatus] = useState('Not signed in');
  const [cloudEmpty, setCloudEmpty] = useState(false);
  const upload = useRef<{ uid: string; run: () => Promise<void> } | null>(null);

  useEffect(() => {
    setCloudEmpty(false);
    if (!firebaseReady || !db) {
      setStatus('Cloud sync unavailable — Firebase failed to load');
      return;
    }
    if (!user) {
      setStatus('Not signed in');
      return;
    }
    setStatus('Syncing…');
    const workbookRef = ref(db, `users/${user.uid}/${cloudPathSuffix}`);
    type Snapshot = (TWorkbook & { _updated?: string }) | null;
    let baseline: Snapshot | undefined;
    let latest: Snapshot | undefined;
    let remoteEvents = 0;
    let pending: { workbook: TWorkbook; epoch: number } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let applying = false;
    let writing = false;
    let closed = false;
    let conflict = false;
    let sessionEpoch = workbookSyncEpoch();

    const applyRemote = (remote: Snapshot) => {
      baseline = remote;
      setCloudEmpty(remote === null);
      if (remote === null) {
        setStatus('No cloud data found for this account yet');
        return;
      }
      const { _updated, ...workbook } = remote;
      applying = true;
      try {
        useStore.getState().setWorkbook({ ...createEmpty(), ...workbook } as TWorkbook);
      } finally {
        applying = false;
      }
      setStatus(`Synced${_updated ? ' · ' + new Date(_updated).toLocaleString() : ''}`);
    };

    const refreshEpoch = () => {
      const epoch = workbookSyncEpoch();
      if (sessionEpoch === epoch) return;
      sessionEpoch = epoch;
      pending = undefined;
      conflict = false;
      baseline = latest;
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), PUSH_DEBOUNCE_MS);
    };

    const persist = async (draft: NonNullable<typeof pending>, expected: Snapshot) => {
      const expectedKey = fingerprint(expected);
      const eventsBeforeWrite = remoteEvents;
      const active = () => !closed && !workbookSyncPaused() && workbookSyncEpoch() === draft.epoch;
      const payload = stripUndefinedDeep({ ...draft.workbook, _updated: new Date().toISOString() });
      writing = true;
      try {
        const result = await runTransaction(workbookRef, (current: unknown) =>
          active() && fingerprint(current) === expectedKey ? payload : undefined, { applyLocally: false });
        if (!active()) throw new Error('The active account or workbook changed during upload.');
        if (!result.committed) {
          conflict = true;
          setCloudEmpty(false);
          setStatus('Cloud conflict — local edits kept. Export local data before reloading.');
          throw new Error('Cloud data changed before the upload completed.');
        }
        const committed = (result.snapshot?.val() ?? payload) as Snapshot;
        baseline = committed;
        setCloudEmpty(false);
        setStatus('Synced');
        // Firebase can deliver a newer server value before the transaction
        // promise resolves. A queued edit still belongs to the committed base.
        if (!pending && remoteEvents !== eventsBeforeWrite && latest !== undefined && fingerprint(latest) !== expectedKey &&
            fingerprint(latest) !== fingerprint(committed)) applyRemote(latest);
      } finally {
        writing = false;
        if (!closed && pending && !conflict) schedule();
      }
    };

    async function flush() {
      refreshEpoch();
      if (closed || writing || conflict || workbookSyncPaused() || !pending || baseline === undefined) return;
      const draft = pending;
      pending = undefined;
      try {
        await persist(draft, baseline);
      } catch (error) {
        if (closed || draft.epoch !== workbookSyncEpoch()) return;
        if (!conflict) {
          conflict = true;
          setCloudEmpty(false);
          setStatus('Cloud write failed — local edits kept. Export local data before reloading.');
        }
        console.warn(`Failed to push ${cloudPathSuffix} to cloud`, error);
      }
    }

    const unsubscribeRemote = onValue(workbookRef, snap => {
      if (closed) return;
      refreshEpoch();
      latest = snap.val() as Snapshot;
      remoteEvents++;
      if (!writing && !pending && !conflict) applyRemote(latest);
    }, err => {
      if (closed) return;
      console.warn(`Firebase ${cloudPathSuffix} listener error`, err);
      if (!conflict) setStatus('Sync error — check console');
    });

    const unsubscribeStore = useStore.subscribe((state, previous) => {
      if (workbookSyncPaused() || applying || state.workbook === previous.workbook) return;
      refreshEpoch();
      if (baseline === undefined || conflict) return;
      pending = { workbook: state.workbook, epoch: sessionEpoch };
      schedule();
    });

    const initialize = async () => {
      if (closed) throw new Error('The active account changed. Reopen the upload.');
      if (workbookSyncPaused() || writing) throw new Error('A data operation is in progress.');
      refreshEpoch();
      if (baseline !== null || latest !== null || conflict) throw new Error('Cloud storage must be confirmed empty before upload.');
      clearTimeout(timer);
      pending = undefined;
      await persist({ workbook: useStore.getState().workbook, epoch: sessionEpoch }, null);
    };
    upload.current = { uid: user.uid, run: initialize };

    return () => {
      closed = true;
      upload.current = null;
      clearTimeout(timer);
      unsubscribeStore();
      unsubscribeRemote();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, cloudPathSuffix, useStore]);

  const uploadLocalToCloud = async () => {
    if (!user || !upload.current) throw new Error('Not signed in');
    if (upload.current.uid !== user.uid) throw new Error('The active account changed. Reopen the upload.');
    await upload.current.run();
  };

  return { status, cloudEmpty, uploadLocalToCloud };
}
