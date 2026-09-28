type PendingWrite = { value: unknown; onError?: (error: unknown) => void };

const pending = new Map<string, PendingWrite>();
let scheduled = false;

function flush() {
  scheduled = false;
  const writes = [...pending.entries()];
  pending.clear();
  for (const [key, write] of writes) {
    try {
      localStorage.setItem(key, JSON.stringify(write.value));
    } catch (error) {
      write.onError?.(error);
    }
  }
}

/** Coalesces repeated whole-workbook writes and moves serialization off the input call stack. */
export function scheduleLocalStorageWrite(key: string, value: unknown, onError?: (error: unknown) => void) {
  pending.set(key, { value, onError });
  if (scheduled) return;
  scheduled = true;
  if (typeof requestIdleCallback === 'function') requestIdleCallback(flush, { timeout: 500 });
  else setTimeout(flush, 0);
}

export function flushLocalStorageWrites() {
  if (pending.size) flush();
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flushLocalStorageWrites);
