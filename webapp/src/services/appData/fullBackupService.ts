import { get, ref, runTransaction } from 'firebase/database';
import { auth, db, firebaseReady } from '../../lib/firebase/client';
import { PAYMENT_EXECUTIONS_PATH } from '../../lib/firebase/paymentPaths';
import { fingerprint } from '../../lib/firebase/workbookFingerprint';
import { beginWorkbookMaintenance, workbookSyncEpoch, workbookSyncPaused } from '../../lib/firebase/workbookMaintenance';
import { validBatchDate } from '../../lib/dateValidation';
import { CLOUD_PATH_SUFFIX, CREATE_EMPTY } from './workbookRegistry';

type ModuleKey = keyof typeof CREATE_EMPTY;
type Account = Record<string, unknown>;
const moduleKeys = Object.keys(CREATE_EMPTY) as ModuleKey[];
const paymentModules: ModuleKey[] = ['cash', 'bank', 'plannedCash', 'plannedBank', 'interEntityTransfers'];
const object = (value: unknown): value is Account => !!value && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));

function identity(uid: string) {
  const user = auth?.currentUser;
  if (!firebaseReady || !db || !uid || /[.#$\[\]/\u0000-\u001f\u007f]/.test(uid) || !user || user.uid !== uid) {
    throw new Error('Your sign-in changed. Review the backup operation again.');
  }
  return user;
}

async function readAccount(uid: string) {
  const user = identity(uid);
  const epoch = workbookSyncEpoch();
  if (workbookSyncPaused()) throw new Error('Another data operation is already running.');
  const snapshot = await get(ref(db!, 'users/' + uid));
  if (auth?.currentUser !== user || epoch !== workbookSyncEpoch() || workbookSyncPaused()) {
    throw new Error('The account or data operation changed. Try again.');
  }
  const value: unknown = snapshot.val();
  if (value !== null && !object(value)) throw new Error('Review the cloud account before backing it up.');
  return { user, epoch, account: (value ?? {}) as Account, wasEmpty: value === null };
}

/** A single account snapshot keeps native pending records, plans and history together. */
export async function exportFullCloudBackup(uid: string) {
  const { account } = await readAccount(uid);
  const result: Account = {};
  for (const key of moduleKeys) result[key] = account[CLOUD_PATH_SUFFIX[key]] ?? CREATE_EMPTY[key]();
  result[PAYMENT_EXECUTIONS_PATH] = account[PAYMENT_EXECUTIONS_PATH] ?? [];
  result._backup = { version: 2, scope: 'cloud', owner: uid, createdAt: new Date().toISOString() };
  return clone(result);
}

function workbookShape(defaults: unknown, value: unknown, path: string): unknown {
  if (value === undefined || value === null) return clone(defaults);
  if (Array.isArray(defaults)) {
    if (!Array.isArray(value)) throw new Error(`Invalid backup list: ${path}.`);
    if (path.split('.').length === 2 && value.some(row => !object(row))) throw new Error(`Invalid backup record: ${path}.`);
    return value;
  }
  if (object(defaults)) {
    if (!object(value)) throw new Error(`Invalid backup workbook: ${path}.`);
    const merged = { ...value };
    for (const [key, fallback] of Object.entries(defaults)) merged[key] = workbookShape(fallback, value[key], path + '.' + key);
    return merged;
  }
  if (typeof value !== typeof defaults || typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`Invalid backup value: ${path}.`);
  }
  return value;
}

const isoInstant = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  validBatchDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));

function executionHistory(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('Invalid payment execution history in the backup.');
  const ids = new Set<string>();
  for (const row of value) {
    if (!object(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id) ||
      !['cash', 'bank'].includes(String(row.module)) || typeof row.planId !== 'string' || !row.planId ||
      typeof row.occurrenceDate !== 'string' || !validBatchDate(row.occurrenceDate) ||
      !isoInstant(row.createdAt) ||
      row.settledOn !== undefined && (typeof row.settledOn !== 'string' || !validBatchDate(row.settledOn)) ||
      row.voidedAt !== undefined && !isoInstant(row.voidedAt) ||
      row.settledOn !== undefined && row.voidedAt !== undefined) {
      throw new Error('Review invalid or duplicate payment execution history before restoring.');
    }
    ids.add(row.id);
  }
  return value;
}

export interface FullBackupPreview {
  readonly owner: string;
  readonly modules: readonly ModuleKey[];
  readonly includesPaymentHistory: boolean;
  readonly executionCount: number;
}
interface ReviewedRestore {
  user: ReturnType<typeof identity>;
  epoch: number;
  wasEmpty: boolean;
  expected: Record<string, string>;
  payload: Account;
  modules: ModuleKey[];
  includesHistory: boolean;
}
const reviews = new WeakMap<FullBackupPreview, ReviewedRestore>();

export async function reviewFullBackup(uid: string, input: unknown): Promise<FullBackupPreview> {
  if (!object(input)) throw new Error('The backup must contain workbook data.');
  const file = clone(input);
  if (object(file._backup) && typeof file._backup.version === 'number' && file._backup.version > 2) {
    throw new Error('This backup was created by a newer format. Update the app before restoring it.');
  }
  if (object(file._backup) && file._backup.scope === 'cloud' && !Object.prototype.hasOwnProperty.call(file, PAYMENT_EXECUTIONS_PATH)) {
    throw new Error('This cloud backup is missing its payment execution history. Review the original backup.');
  }
  const modules = moduleKeys.filter(key => file[key] != null || key === 'qse' && file.workbook != null);
  if (!modules.length) throw new Error('No recognized module data found in that file.');
  const includesHistory = Object.prototype.hasOwnProperty.call(file, PAYMENT_EXECUTIONS_PATH);
  if (includesHistory && moduleKeys.some(key => !modules.includes(key))) {
    throw new Error('Restore payment history together with every module from a full cloud backup.');
  }
  const history = includesHistory ? executionHistory(file[PAYMENT_EXECUTIONS_PATH]) : [];
  const { user, epoch, account, wasEmpty } = await readAccount(uid);
  if (!includesHistory && modules.some(key => paymentModules.includes(key)) &&
    account[PAYMENT_EXECUTIONS_PATH] != null && fingerprint(account[PAYMENT_EXECUTIONS_PATH]) !== '[]') {
    throw new Error('This backup omits existing payment execution history. Use a full cloud backup to restore these payment workbooks together.');
  }
  const payload: Account = {};
  const expected: Record<string, string> = { [PAYMENT_EXECUTIONS_PATH]: fingerprint(account[PAYMENT_EXECUTIONS_PATH] ?? null) };
  for (const key of modules) {
    const path = CLOUD_PATH_SUFFIX[key];
    const raw = file[key] ?? file.workbook;
    if (!object(raw)) throw new Error(`Invalid backup workbook: ${key}.`);
    payload[path] = workbookShape(CREATE_EMPTY[key](), raw, key);
    expected[path] = fingerprint(account[path] ?? null);
  }
  if (includesHistory) payload[PAYMENT_EXECUTIONS_PATH] = clone(history);
  const preview = Object.freeze({ owner: uid, modules: Object.freeze([...modules]), includesPaymentHistory: includesHistory, executionCount: history.length });
  reviews.set(preview, { user, epoch, wasEmpty, expected, payload: clone(payload), modules, includesHistory });
  return preview;
}

/** The acknowledged account-root transaction replaces every selected workbook and history together.
 * Scoped maintenance refreshes only restored workbooks; unrelated queued drafts remain intact. */
export async function restoreReviewedFullBackup(preview: FullBackupPreview) {
  const reviewed = reviews.get(preview);
  if (!reviewed || identity(preview.owner) !== reviewed.user || workbookSyncEpoch() !== reviewed.epoch) {
    throw new Error('Review this backup again before restoring.');
  }
  const finish = beginWorkbookMaintenance(reviewed.modules.map(key => CLOUD_PATH_SUFFIX[key]));
  const epoch = workbookSyncEpoch();
  const active = () => auth?.currentUser === reviewed.user && workbookSyncEpoch() === epoch;
  const stamp = new Date().toISOString();
  const payload = clone(reviewed.payload);
  for (const key of reviewed.modules) payload[CLOUD_PATH_SUFFIX[key]] = { ...(payload[CLOUD_PATH_SUFFIX[key]] as object), _updated: stamp };
  let rejection: Error | undefined;
  try {
    const result = await runTransaction(ref(db!, 'users/' + preview.owner), (value: Account | null) => {
      if (!active()) return undefined;
      if (value === null && !reviewed.wasEmpty) return null;
      const account = value ?? {};
      if (Object.entries(reviewed.expected).some(([path, expected]) => fingerprint(account[path] ?? null) !== expected)) {
        rejection = new Error('Cloud data or payment history changed. Review the backup again before restoring.');
        return undefined;
      }
      return { ...account, ...clone(payload) };
    }, { applyLocally: false });
    if (!active()) throw new Error('Your sign-in changed during restore. Check the original account before continuing.');
    if (!result.committed) throw rejection ?? new Error('The backup was not restored. Review it again.');
    const saved = result.snapshot.val() as Account | null;
    if (!saved || reviewed.modules.some(key => (saved[CLOUD_PATH_SUFFIX[key]] as Account | undefined)?._updated !== stamp) ||
      reviewed.includesHistory && fingerprint(saved[PAYMENT_EXECUTIONS_PATH] ?? []) !== fingerprint(payload[PAYMENT_EXECUTIONS_PATH])) {
      throw new Error('Could not verify the restored snapshot. Reload the original account before retrying.');
    }
    reviews.delete(preview);
    finish(Object.fromEntries(reviewed.modules.map(key => [CLOUD_PATH_SUFFIX[key], saved[CLOUD_PATH_SUFFIX[key]] ?? null])));
  } finally { finish(); }
}
